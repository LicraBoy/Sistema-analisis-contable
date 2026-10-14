"""
Saldo Cuenta Huésped — router. Módulo independiente (vive en la pantalla de
Pagos de Recepción). Cada periodo (`YYYY-MM`) se llena subiendo el RCP170 de
Novohit (`services/saldo_cuenta_huesped.py`); IVA/propina/IEPS/ISH los captura
el usuario por línea. Re-subir un periodo reemplaza las líneas pero conserva
lo capturado en las líneas que siguen existiendo.
"""

import logging
import re
from io import BytesIO

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import SaldoCuentaHuespedLinea
from app.services.saldo_cuenta_huesped import (
    aplanar_lineas,
    calcular_desglose,
    es_excel_editado,
    generar_excel_saldo_cuenta_huesped,
    leer_excel_editado,
    parsear_rcp170,
)

logger = logging.getLogger(__name__)

router = APIRouter()

CAMPOS_CAPTURA = ("subtotal", "iva", "propina", "ieps", "ish")  # GRAVADO y TASA 0 se derivan


def _validar_periodo(periodo: str) -> None:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", periodo):
        raise HTTPException(status_code=400, detail="'periodo' debe tener formato YYYY-MM")


def _linea_a_dict(fila: SaldoCuentaHuespedLinea) -> dict:
    return {
        "id": fila.id,
        "orden": fila.orden,
        "tipo": fila.tipo,
        "habitacion": fila.habitacion,
        "codigo": fila.codigo or "",
        "huesped": fila.huesped or "",
        "adultos_ninos": fila.adultos_ninos or "",
        "llegada": fila.llegada or "",
        "salida": fila.salida or "",
        "tarifa": fila.tarifa,
        "garantia": fila.garantia or "",
        "saldo_habitacion": fila.saldo_habitacion,
        "es_primera_linea": fila.es_primera_linea,
        "agencia": fila.agencia or "",
        "linea_nombre": fila.linea_nombre or "",
        "monto": fila.monto,
        **calcular_desglose(fila.monto, fila.subtotal, fila.iva, fila.propina, fila.ieps, fila.ish),
    }


async def _lineas_del_periodo(db: AsyncSession, periodo: str) -> list[SaldoCuentaHuespedLinea]:
    res = await db.execute(
        select(SaldoCuentaHuespedLinea)
        .where(SaldoCuentaHuespedLinea.periodo == periodo)
        .order_by(SaldoCuentaHuespedLinea.orden)
    )
    return list(res.scalars().all())


def _visibles(lineas: list[SaldoCuentaHuespedLinea]) -> list[dict]:
    """
    Filas a mostrar/exportar: se omiten las líneas de habitación con monto 0
    (Varios se conserva siempre). Se aplica al leer, así también limpia
    periodos cargados antes de este filtro; la 1ª línea que sobrevive de cada
    habitación pasa a abrir su grupo.
    """
    filas: list[dict] = []
    vistas: set[tuple] = set()
    for f in lineas:
        if f.tipo != "varios" and f.monto == 0:
            continue
        d = _linea_a_dict(f)
        clave = (f.tipo, f.habitacion, f.orden if f.tipo == "varios" else 0)
        d["es_primera_linea"] = clave not in vistas
        vistas.add(clave)
        filas.append(d)
    return filas


def _respuesta_periodo(periodo: str, lineas: list[SaldoCuentaHuespedLinea]) -> dict:
    filas = _visibles(lineas)
    totales = {
        campo: round(sum(f[campo] for f in filas), 2)
        for campo in ("monto", "gravado", "tasa0", "subtotal", "iva", "propina", "ieps", "ish", "total2", "dif")
    }
    return {"periodo": periodo, "filas": filas, "totales": totales}


@router.post("/{periodo}/upload")
async def upload_saldo(
    periodo: str,
    file: UploadFile = File(...),
    confirmar_periodo: bool = Query(False, description="Guardar en el periodo de la URL aunque el Excel traiga otro en A1"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Acepta dos formatos y reemplaza el periodo:
    - RCP170 de Novohit: filtra habitaciones con garantía (+ Varios) y conserva
      las capturas de las líneas que siguen existiendo.
    - El Excel de este módulo ya editado: guarda sus capturas tal cual.
    Si el Excel trae otro periodo en A1, responde `requiere_confirmacion` sin guardar.
    """
    _validar_periodo(periodo)
    contenido = await file.read()

    if es_excel_editado(contenido):
        try:
            leido = leer_excel_editado(contenido)
        except Exception as e:
            logger.exception("Error leyendo el Excel editado")
            raise HTTPException(status_code=400, detail=f"No se pudo leer el Excel: {e}")
        periodo_archivo = leido["periodo_archivo"]
        if periodo_archivo and periodo_archivo != periodo and not confirmar_periodo:
            return {"requiere_confirmacion": True, "periodo_archivo": periodo_archivo, "periodo_seleccionado": periodo}
        filas = leido["filas"]
        if not filas:
            raise HTTPException(status_code=400, detail="El Excel no trae líneas para guardar.")
        origen = "excel_editado"
        excluidas: list[str] = []
        conservadas = len(filas)
        saldo_total_reporte = None
        await db.execute(delete(SaldoCuentaHuespedLinea).where(SaldoCuentaHuespedLinea.periodo == periodo))
        for f in filas:
            db.add(SaldoCuentaHuespedLinea(periodo=periodo, **f))
    else:
        try:
            parseado = parsear_rcp170(contenido)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.exception("Error leyendo el RCP170")
            raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {e}")

        filas = aplanar_lineas(parseado["habitaciones"], parseado["varios"])
        if not filas:
            raise HTTPException(status_code=400, detail="El RCP170 no trae habitaciones con garantía ni folios de Varios.")

        # Conserva lo capturado de las líneas que siguen existiendo (misma habitación + cuenta + monto).
        previas: dict[tuple, list[SaldoCuentaHuespedLinea]] = {}
        for f in await _lineas_del_periodo(db, periodo):
            previas.setdefault((f.habitacion, f.linea_nombre or "", round(f.monto, 2)), []).append(f)

        await db.execute(delete(SaldoCuentaHuespedLinea).where(SaldoCuentaHuespedLinea.periodo == periodo))
        conservadas = 0
        for f in filas:
            captura = {campo: 0.0 for campo in CAMPOS_CAPTURA}
            coincidencias = previas.get((f["habitacion"], f["linea_nombre"], round(f["monto"], 2)))
            if coincidencias:
                anterior = coincidencias.pop(0)
                captura = {campo: getattr(anterior, campo) for campo in CAMPOS_CAPTURA}
                conservadas += 1
            db.add(SaldoCuentaHuespedLinea(periodo=periodo, **f, **captura))
        origen = "rcp170"
        excluidas = [h["habitacion"] for h in parseado["habitaciones"] if not h["garantia"]]
        saldo_total_reporte = parseado["saldo_total"]

    await db.flush()
    return {
        **_respuesta_periodo(periodo, await _lineas_del_periodo(db, periodo)),
        "origen": origen,
        "excluidas_sin_garantia": excluidas,
        "capturas_conservadas": conservadas,
        "saldo_total_reporte": saldo_total_reporte,
    }


@router.get("/{periodo}")
async def obtener_periodo(
    periodo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _validar_periodo(periodo)
    return _respuesta_periodo(periodo, await _lineas_del_periodo(db, periodo))


@router.patch("/{periodo}/lineas/{linea_id}")
async def actualizar_captura(
    periodo: str,
    linea_id: int,
    body: dict = Body(..., description="{'subtotal','iva','propina','ieps','ish': n} (cualquiera)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _validar_periodo(periodo)
    fila = await db.get(SaldoCuentaHuespedLinea, linea_id)
    if fila is None or fila.periodo != periodo:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    for campo in CAMPOS_CAPTURA:
        if campo in body:
            try:
                valor = float(body[campo] or 0)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"'{campo}' debe ser numérico")
            if valor < 0:
                raise HTTPException(status_code=400, detail=f"'{campo}' no puede ser negativo")
            setattr(fila, campo, valor)
    await db.flush()
    return _linea_a_dict(fila)


@router.delete("/{periodo}")
async def eliminar_periodo(
    periodo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _validar_periodo(periodo)
    res = await db.execute(delete(SaldoCuentaHuespedLinea).where(SaldoCuentaHuespedLinea.periodo == periodo))
    return {"eliminadas": res.rowcount}


@router.get("/{periodo}/export")
async def exportar_periodo(
    periodo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _validar_periodo(periodo)
    lineas = await _lineas_del_periodo(db, periodo)
    if not lineas:
        raise HTTPException(status_code=404, detail="No hay datos para ese periodo; sube primero el RCP170.")
    excel = generar_excel_saldo_cuenta_huesped(_visibles(lineas), periodo)
    return StreamingResponse(
        BytesIO(excel),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Saldo_Cuenta_Huesped_{periodo}.xlsx"},
    )
