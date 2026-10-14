"""
Amarre de Costo de Ventas (Inventarios) — router. Módulo nuevo e
independiente: no comparte datos con ningún otro módulo del sistema. Cada
periodo (`YYYY-MM`) se llena incrementalmente subiendo los 12 archivos
crudos de Novohit (ver `services/amarre_costo_parsing.py`), en cualquier
orden, sin pisar los campos de otro tipo de archivo ni los huecos
manuales ya capturados.
"""

import logging
from io import BytesIO

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import AmarreCostoArchivoOriginal, AmarreCostoConsignacionRenglon, AmarreCostoPeriodo
from app.services.amarre_costo_parsing import (
    AJUSTE_REDONDEO_CAFETERIA_ALIMENTOS,
    CATEGORIAS_ALM_GRAL,
    CATEGORIAS_CAFETERIA,
    CATEGORIAS_COMPUESTAS_ALM_GRAL,
    CATEGORIAS_COMPUESTAS_CAFETERIA,
    CATEGORIAS_COMPUESTAS_TIENDA,
    CATEGORIAS_REST_BAR,
    CATEGORIAS_TIENDA,
    buscar_en_balanza,
    parsear_balanza,
    parsear_conteo_fisico,
    parsear_entradas,
    parsear_salidas_almacen_general,
    parsear_salidas_mantenimiento,
)
from app.services.amarre_costo_reportes import (
    construir_amarre_costo,
    construir_comparacion_balanza_2,
    construir_datos_entrysal,
    construir_resumen_inv,
)
from app.services.amarre_costo_storage import eliminar_archivo_original_amarre_costo, guardar_archivo_original_amarre_costo, leer_archivo_original_amarre_costo
from app.services.amarre_costo_workbook import generar_workbook_amarre_costo

logger = logging.getLogger(__name__)

router = APIRouter()

CUENTA_ALM_GRAL = "1007101"
CUENTA_TIENDA = "1007102"
CUENTA_RESTAURANT = "1007103.001"
CUENTA_BAR = "1007103.002"
CUENTA_CAFETERIA = "1007108"


async def _obtener_o_crear_periodo(db: AsyncSession, periodo: str) -> AmarreCostoPeriodo:
    res = await db.execute(
        select(AmarreCostoPeriodo)
        .options(selectinload(AmarreCostoPeriodo.renglones_consignacion))
        .where(AmarreCostoPeriodo.periodo == periodo)
    )
    fila = res.scalar_one_or_none()
    if fila is None:
        fila = AmarreCostoPeriodo(periodo=periodo)
        db.add(fila)
        await db.flush()
    return fila


def _marcar_archivo_cargado(fila: AmarreCostoPeriodo, tipo: str) -> None:
    cargados = set(filter(None, fila.archivos_cargados.split(",")))
    cargados.add(tipo)
    fila.archivos_cargados = ",".join(sorted(cargados))


async def _leer_archivo(archivo: UploadFile) -> bytes:
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")
    return await archivo.read()


TIPOS_VALIDOS = (
    "balanza",
    "conteo-alm-gral",
    "conteo-tienda",
    "conteo-rest-bar",
    "conteo-cafeteria",
    "salidas-alm-gral",
    "salidas-mtto",
    "entradas-alm-gral",
    "entradas-tienda",
    "entradas-mtto",
    "entradas-cafeteria",
    "entradas-rest",
)

# "Balanza 2": segundo archivo de balanza, subido y parseado aparte, solo
# para comparar contra el "Saldo Real" ya calculado (`construir_comparacion_
# balanza_2`). A propósito NO forma parte de TIPOS_VALIDOS: no bloquea
# `/export` si no se sube, y no escribe ningún campo de AmarreCostoPeriodo —
# solo se guarda el archivo original y se relee/parsea al vuelo cuando se
# pide la comparación (mismo patrón que 1BALANZA en el export).
TIPOS_OPCIONALES = ("balanza-2",)


@router.post("/{periodo}/upload/{tipo}")
async def upload_amarre_costo(
    periodo: str,
    tipo: str,
    archivo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Sube y parsea uno de los 12 archivos fuente del periodo. `tipo` es uno
    de TIPOS_VALIDOS. Solo actualiza los campos de ese tipo — nunca pisa
    campos de otro archivo ni los huecos manuales ya capturados.
    """
    if tipo not in TIPOS_VALIDOS and tipo not in TIPOS_OPCIONALES:
        raise HTTPException(
            status_code=400,
            detail=f"'tipo' debe ser uno de: {', '.join(TIPOS_VALIDOS + TIPOS_OPCIONALES)}",
        )

    contenido = await _leer_archivo(archivo)
    fila = await _obtener_o_crear_periodo(db, periodo)

    try:
        if tipo == "balanza-2":
            parsear_balanza(contenido, archivo.filename)  # solo valida que se pueda parsear

        elif tipo == "balanza":
            balanza = parsear_balanza(contenido, archivo.filename)
            fila.inv_inicial_alm_gral = buscar_en_balanza(CUENTA_ALM_GRAL, balanza, "saldo_anterior")
            fila.inv_inicial_tienda = buscar_en_balanza(CUENTA_TIENDA, balanza, "saldo_anterior")
            fila.inv_inicial_restaurant = buscar_en_balanza(CUENTA_RESTAURANT, balanza, "saldo_anterior")
            fila.inv_inicial_bar = buscar_en_balanza(CUENTA_BAR, balanza, "saldo_anterior")
            fila.inv_inicial_cafeteria = buscar_en_balanza(CUENTA_CAFETERIA, balanza, "saldo_anterior")
            fila.saldo_contable_alm_gral = buscar_en_balanza(CUENTA_ALM_GRAL, balanza, "saldo_actual")
            fila.saldo_contable_tienda = buscar_en_balanza(CUENTA_TIENDA, balanza, "saldo_actual")
            fila.saldo_contable_restaurant = buscar_en_balanza(CUENTA_RESTAURANT, balanza, "saldo_actual")
            fila.saldo_contable_bar = buscar_en_balanza(CUENTA_BAR, balanza, "saldo_actual")
            fila.saldo_contable_cafeteria = buscar_en_balanza(CUENTA_CAFETERIA, balanza, "saldo_actual")

        elif tipo == "conteo-alm-gral":
            r = parsear_conteo_fisico(contenido, archivo.filename, CATEGORIAS_ALM_GRAL, CATEGORIAS_COMPUESTAS_ALM_GRAL)
            fila.alm_gral_alimentos = r.get("alimentos", 0.0)
            fila.alm_gral_bebidas = r.get("bebidas", 0.0)
            fila.alm_gral_tabaqueria = r.get("tabaqueria", 0.0)
            fila.alm_gral_papeleria = r.get("papeleria", 0.0)
            fila.alm_gral_stock_mantenimiento = r.get("stock_mantenimiento", 0.0)
            fila.alm_gral_ropa_uniformes = r.get("ropa_uniformes", 0.0)
            fila.alm_gral_higienicos = r.get("higienicos", 0.0)
            fila.alm_gral_material_mantto = r.get("material_mantto", 0.0)
            fila.inv_final_alm_gral = sum(r.values())

        elif tipo == "conteo-tienda":
            r = parsear_conteo_fisico(contenido, archivo.filename, CATEGORIAS_TIENDA, CATEGORIAS_COMPUESTAS_TIENDA)
            fila.tienda_alimentos = r.get("alimentos", 0.0)
            fila.tienda_bebidas = r.get("bebidas", 0.0)
            fila.tienda_tabaqueria = r.get("tabaqueria", 0.0)
            fila.tienda_medicinas = r.get("medicinas", 0.0)
            fila.tienda_ropa = r.get("ropa", 0.0)
            fila.tienda_artesanias = r.get("artesanias", 0.0)
            fila.tienda_higienicos = r.get("higienicos", 0.0)
            fila.inv_final_tienda = sum(r.values())

        elif tipo == "conteo-rest-bar":
            r = parsear_conteo_fisico(contenido, archivo.filename, CATEGORIAS_REST_BAR, None)
            fila.restaurant_alimentos = r.get("alimentos", 0.0)
            fila.bar_bebidas = r.get("bebidas", 0.0)
            fila.inv_final_restaurant = r.get("alimentos", 0.0)
            fila.inv_final_bar = r.get("bebidas", 0.0)

        elif tipo == "conteo-cafeteria":
            r = parsear_conteo_fisico(contenido, archivo.filename, CATEGORIAS_CAFETERIA, CATEGORIAS_COMPUESTAS_CAFETERIA)
            # +0.01: ajuste de redondeo confirmado en el libro maestro real
            # (`AD426=AD321+AD391+AD417+0.01`) — no es un error nuestro.
            fila.cafeteria_alimentos = r.get("alimentos", 0.0) + AJUSTE_REDONDEO_CAFETERIA_ALIMENTOS
            fila.cafeteria_souvenirs = r.get("souvenirs", 0.0)
            fila.inv_final_cafeteria = fila.cafeteria_alimentos + fila.cafeteria_souvenirs

        elif tipo == "salidas-alm-gral":
            r = parsear_salidas_almacen_general(contenido, archivo.filename)
            fila.entrysal_despacho_gasto = r["despacho_gasto"]
            fila.entrysal_despacho_centro_costo = r["despacho_centro_costo"]
            fila.entrysal_restaurant = r["entrysal_restaurant"]
            fila.entrysal_palapa_bar = r["entrysal_palapa_bar"]
            fila.entrysal_tienda = r["entrysal_tienda"]
            fila.entrysal_cafeteria_alimentos = r["entrysal_cafeteria_alimentos"]
            fila.entrysal_carreta_alimentos = r["entrysal_carreta_alimentos"]
            fila.entrysal_carreta_bebidas = r["entrysal_carreta_bebidas"]
            fila.entrysal_souvenirs_cafe = r["entrysal_souvenirs_cafe"]

        elif tipo == "salidas-mtto":
            fila.entrysal_despacho_mtto = parsear_salidas_mantenimiento(contenido, archivo.filename)

        elif tipo.startswith("entradas-"):
            r = parsear_entradas(contenido, archivo.filename)
            prefijo = {
                "entradas-alm-gral": "ent_alm_gral", "entradas-tienda": "ent_tienda",
                "entradas-mtto": "ent_mtto", "entradas-cafeteria": "ent_cafeteria", "entradas-rest": "ent_rest",
            }[tipo]
            setattr(fila, f"{prefijo}_subtotal", r["subtotal"])
            setattr(fila, f"{prefijo}_descuento", r["descuento"])
            setattr(fila, f"{prefijo}_iva", r["iva"])
            setattr(fila, f"{prefijo}_total", r["total"])

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error procesando archivo de Amarre de Costo (tipo=%s)", tipo)
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    _marcar_archivo_cargado(fila, tipo)

    # Guardar el archivo original en disco (además de lo ya parseado arriba)
    # — necesario para poder regenerar el clon completo del libro maestro
    # con fórmulas vivas (`GET /{periodo}/export`), que pega cada archivo
    # tal cual en su propia hoja. Reemplaza el anterior si ya existía.
    res_archivo = await db.execute(
        select(AmarreCostoArchivoOriginal).where(
            AmarreCostoArchivoOriginal.periodo_id == fila.id, AmarreCostoArchivoOriginal.tipo == tipo
        )
    )
    registro_archivo = res_archivo.scalar_one_or_none()
    ruta_relativa = guardar_archivo_original_amarre_costo(periodo, tipo, archivo.filename, contenido)
    if registro_archivo is None:
        db.add(AmarreCostoArchivoOriginal(periodo_id=fila.id, tipo=tipo, nombre_original=archivo.filename, ruta_relativa=ruta_relativa))
    else:
        if registro_archivo.ruta_relativa != ruta_relativa:
            eliminar_archivo_original_amarre_costo(registro_archivo.ruta_relativa)
        registro_archivo.nombre_original = archivo.filename
        registro_archivo.ruta_relativa = ruta_relativa

    await db.commit()
    await db.refresh(fila)

    return {"periodo": periodo, "tipo": tipo, "archivo": archivo.filename, "archivos_cargados": fila.archivos_cargados.split(",")}


@router.get("/periodos")
async def listar_periodos_amarre_costo(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    res = await db.execute(select(AmarreCostoPeriodo).order_by(AmarreCostoPeriodo.periodo.desc()))
    filas = res.scalars().all()
    return {
        "periodos": [
            {
                "periodo": f.periodo,
                "archivos_cargados": [t for t in f.archivos_cargados.split(",") if t],
                "total_archivos": len(TIPOS_VALIDOS),
                "actualizado_en": f.actualizado_en.isoformat(),
            }
            for f in filas
        ]
    }


async def _cargar_periodo(db: AsyncSession, periodo: str) -> AmarreCostoPeriodo:
    res = await db.execute(
        select(AmarreCostoPeriodo)
        .options(selectinload(AmarreCostoPeriodo.renglones_consignacion))
        .where(AmarreCostoPeriodo.periodo == periodo)
    )
    fila = res.scalar_one_or_none()
    if fila is None:
        raise HTTPException(status_code=404, detail=f"No hay datos guardados para el periodo {periodo}")
    return fila


@router.get("/{periodo}")
async def obtener_amarre_costo(
    periodo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    fila = await _cargar_periodo(db, periodo)
    consignacion = sorted(fila.renglones_consignacion, key=lambda r: r.orden)
    return {
        "periodo": periodo,
        "archivos_cargados": [t for t in fila.archivos_cargados.split(",") if t],
        "amarre_costo": construir_amarre_costo(fila, consignacion),
        "datos_entrysal": construir_datos_entrysal(fila),
        "resumen_inv": construir_resumen_inv(fila, consignacion),
        "huecos_manuales": {
            "inv_final_mantenimiento": fila.inv_final_mantenimiento,
            "entrysal_cafeteria_bebidas": fila.entrysal_cafeteria_bebidas,
            "resumen_lavanderia": fila.resumen_lavanderia,
        },
    }


@router.get("/{periodo}/comparacion-balanza-2")
async def obtener_comparacion_balanza_2(
    periodo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Compara el "Saldo Real" (columna G de 4Resumen INV, ya calculado del
    conteo físico) contra el "Saldo Actual" de un segundo archivo de balanza
    subido aparte (tipo "balanza-2", opcional). No requiere que se haya
    subido — si falta, regresa `disponible: False`.
    """
    fila = await _cargar_periodo(db, periodo)
    res_archivo = await db.execute(
        select(AmarreCostoArchivoOriginal).where(
            AmarreCostoArchivoOriginal.periodo_id == fila.id, AmarreCostoArchivoOriginal.tipo == "balanza-2"
        )
    )
    registro = res_archivo.scalar_one_or_none()
    if registro is None:
        return {"disponible": False, "renglones": []}

    contenido = leer_archivo_original_amarre_costo(registro.ruta_relativa)
    try:
        balanza_2 = parsear_balanza(contenido, registro.nombre_original)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "disponible": True,
        "archivo": registro.nombre_original,
        "actualizado_en": registro.actualizado_en.isoformat(),
        "renglones": construir_comparacion_balanza_2(fila, balanza_2),
    }


CAMPOS_MANUALES_AMARRE_COSTO = (
    "inv_final_mantenimiento",
    "entrysal_cafeteria_bebidas",
    "resumen_lavanderia",
)


@router.patch("/{periodo}/manual")
async def actualizar_manual_amarre_costo(
    periodo: str,
    body: dict = Body(..., description="{'inv_final_mantenimiento', 'entrysal_cafeteria_bebidas', 'resumen_lavanderia'}"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Edita únicamente los huecos manuales (whitelist) — nunca campos calculados."""
    fila = await _cargar_periodo(db, periodo)
    for campo in CAMPOS_MANUALES_AMARRE_COSTO:
        if campo in body:
            valor = body[campo]
            setattr(fila, campo, None if valor is None else float(valor))
    await db.commit()
    return {campo: getattr(fila, campo) for campo in CAMPOS_MANUALES_AMARRE_COSTO}


@router.post("/{periodo}/consignacion")
async def agregar_renglon_consignacion(
    periodo: str,
    body: dict = Body(..., description="{'concepto': str, 'monto': float}"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    fila = await _cargar_periodo(db, periodo)
    orden = len(fila.renglones_consignacion)
    renglon = AmarreCostoConsignacionRenglon(
        periodo_id=fila.id, orden=orden,
        concepto=str(body.get("concepto", "")), monto=float(body.get("monto", 0.0)),
    )
    db.add(renglon)
    await db.commit()
    await db.refresh(renglon)
    return {"id": renglon.id, "concepto": renglon.concepto, "monto": renglon.monto}


@router.patch("/{periodo}/consignacion/{renglon_id}")
async def editar_renglon_consignacion(
    periodo: str,
    renglon_id: int,
    body: dict = Body(..., description="{'concepto': str, 'monto': float}"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    renglon = await db.get(AmarreCostoConsignacionRenglon, renglon_id)
    if renglon is None:
        raise HTTPException(status_code=404, detail="No se encontró ese renglón")
    if "concepto" in body:
        renglon.concepto = str(body["concepto"])
    if "monto" in body:
        renglon.monto = float(body["monto"])
    await db.commit()
    return {"id": renglon.id, "concepto": renglon.concepto, "monto": renglon.monto}


@router.delete("/{periodo}/consignacion/{renglon_id}")
async def eliminar_renglon_consignacion(
    periodo: str,
    renglon_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    await db.execute(delete(AmarreCostoConsignacionRenglon).where(AmarreCostoConsignacionRenglon.id == renglon_id))
    await db.commit()
    return {"id": renglon_id, "eliminado": True}


@router.delete("/{periodo}")
async def eliminar_periodo_amarre_costo(
    periodo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    fila = await _cargar_periodo(db, periodo)
    res_archivos = await db.execute(
        select(AmarreCostoArchivoOriginal).where(AmarreCostoArchivoOriginal.periodo_id == fila.id)
    )
    for registro in res_archivos.scalars().all():
        eliminar_archivo_original_amarre_costo(registro.ruta_relativa)
    await db.delete(fila)
    await db.commit()
    return {"periodo": periodo, "eliminado": True}


@router.get("/{periodo}/export")
async def exportar_amarre_costo(
    periodo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Genera un clon completo del libro maestro original: las 12 hojas fuente
    pegadas tal cual (necesitan haberse subido con este endpoint nuevo —
    periodos cargados antes de este cambio no tienen el archivo original
    guardado y deben volver a subirse) más Amarre COSTO/2DATOS ENTRYSAL/
    4Resumen INV con fórmulas de Excel vivas que las referencian. Ver
    `services/amarre_costo_workbook.py`.
    """
    fila = await _cargar_periodo(db, periodo)
    consignacion = sorted(fila.renglones_consignacion, key=lambda r: r.orden)

    res_archivos = await db.execute(
        select(AmarreCostoArchivoOriginal).where(AmarreCostoArchivoOriginal.periodo_id == fila.id)
    )
    registros_archivo = {r.tipo: r for r in res_archivos.scalars().all()}
    faltantes = [t for t in TIPOS_VALIDOS if t not in registros_archivo]
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Falta subir estos archivos para exportar el libro completo: {', '.join(faltantes)}. "
                "Si ya los subiste antes de esta actualización, vuelve a subirlos — el archivo original "
                "no quedó guardado en ese momento."
            ),
        )

    # Los 12 archivos requeridos van siempre; "balanza-2" (opcional) se
    # manda también si ya se subió — `generar_workbook_amarre_costo` la
    # pega como una hoja más (no tiene fórmulas propias, solo para
    # consulta), y la ignora si el periodo no la trae.
    archivos_originales = {
        tipo: (registro.nombre_original, leer_archivo_original_amarre_costo(registro.ruta_relativa))
        for tipo, registro in registros_archivo.items()
        if tipo in TIPOS_VALIDOS or tipo in TIPOS_OPCIONALES
    }

    try:
        excel_bytes = generar_workbook_amarre_costo(fila, consignacion, archivos_originales)
    except Exception as e:
        logger.exception("Error generando el libro completo de Amarre de Costo")
        raise HTTPException(status_code=500, detail=f"Error al generar el Excel: {str(e)}")

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Amarre_Costo_{periodo}.xlsx"},
    )
