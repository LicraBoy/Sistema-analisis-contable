"""
Pagos de Recepción router — gastos que hace un huésped durante su estancia.
Módulo independiente del flujo de Ingresos/Pagos/Conciliación y de
Facturación: no lee ni escribe la base de datos (por ahora).
"""

import logging
from datetime import date
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.descargas import cabecera_descarga
from app.core.security import get_current_user
from app.db.session import get_db
from app.models import PagoRecepcionDia
from app.services.pagos_recepcion import (
    COLUMNAS_MOVIMIENTO_PAGOS_RECEPCION,
    COLUMNAS_MOVIMIENTOS_PERIODO_PAGOS_RECEPCION,
    COLUMNAS_PAGOS_RECEPCION,
    FORMAS_PAGO_RECONOCIDAS,
    TOLERANCIA_CONCILIACION,
    agrupar_bloques_pagos_recepcion,
    calcular_metricas_desde_valores,
    conciliar_forma_pago_pagos_recepcion,
    construir_tabla1_pagos_recepcion,
    construir_tabla2_pagos_recepcion,
    extraer_columnas_movimiento_pagos_recepcion,
    extraer_columnas_movimientos_periodo_pagos_recepcion,
    extraer_columnas_pagos_recepcion,
    extraer_pagos_amex_de_movimientos_periodo,
    filtrar_cuentas_conciliadas,
    generar_reporte_pagos_del_mes_excel,
    leer_excel_movimiento_pagos_recepcion,
    leer_excel_movimientos_periodo_pagos_recepcion,
    leer_excel_pagos_recepcion,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_pagos_recepcion(
    archivo: UploadFile = File(..., description="Archivo Excel de gastos de recepción"),
    current_user: dict = Depends(get_current_user),
):
    """
    Extrae las columnas fijas (COLUMNAS_PAGOS_RECEPCION) del Excel subido y
    las agrupa en bloques por huésped (columna B = número de folio marca el
    inicio de cada bloque). Sin guardar en base de datos todavía.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_pagos_recepcion(contenido)
        df_extraido = extraer_columnas_pagos_recepcion(df)
        bloques = agrupar_bloques_pagos_recepcion(df_extraido)
        tabla1 = construir_tabla1_pagos_recepcion(bloques)
        tabla2 = construir_tabla2_pagos_recepcion(bloques)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error leyendo el archivo de Pagos de Recepción")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    return {
        "filename": archivo.filename,
        "total_filas": len(df_extraido),
        "total_bloques": len(bloques),
        "columnas": COLUMNAS_PAGOS_RECEPCION,
        "bloques": bloques,
        "tabla1": tabla1,
        "tabla2": tabla2,
    }


@router.post("/movimiento/upload")
async def upload_movimiento_pagos_recepcion(
    archivo: UploadFile = File(..., description="Archivo Excel de Movimiento (conciliación de forma de pago)"),
    current_user: dict = Depends(get_current_user),
):
    """
    Extrae las columnas fijas (COLUMNAS_MOVIMIENTO_PAGOS_RECEPCION) del
    archivo de Movimiento y las regresa como vista previa plana. La
    conciliación contra las cuentas de Pagos de Recepción se agrega en una
    siguiente iteración.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_movimiento_pagos_recepcion(contenido)
        df_extraido = extraer_columnas_movimiento_pagos_recepcion(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error leyendo el archivo de Movimiento")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    filas = df_extraido.astype(object).where(pd.notna(df_extraido), None).to_dict(orient="records")
    return {
        "filename": archivo.filename,
        "total": len(filas),
        "columnas": COLUMNAS_MOVIMIENTO_PAGOS_RECEPCION,
        "filas": filas,
    }


@router.post("/movimientos-periodo/upload")
async def upload_movimientos_periodo_pagos_recepcion(
    archivo: UploadFile = File(..., description="Archivo Excel de Movimientos por Periodo (para identificar pagos American Express)"),
    current_user: dict = Depends(get_current_user),
):
    """
    Extrae las columnas fijas (COLUMNAS_MOVIMIENTOS_PERIODO_PAGOS_RECEPCION)
    del archivo de Movimientos por Periodo y regresa solo las filas del
    segmento American Express, para poder distinguirlas de "CREDITO"
    genérico al conciliar.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_movimientos_periodo_pagos_recepcion(contenido)
        df_extraido = extraer_columnas_movimientos_periodo_pagos_recepcion(df)
        filas_amex = extraer_pagos_amex_de_movimientos_periodo(df_extraido)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error leyendo el archivo de Movimientos por Periodo")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    return {
        "filename": archivo.filename,
        "total": len(filas_amex),
        "filas_amex": filas_amex,
    }


@router.post("/conciliar-forma-pago")
async def conciliar_forma_pago(
    body: dict = Body(
        ...,
        description="{'tabla1': [...], 'tabla2': [...], 'movimiento_filas': [...], 'filas_amex_periodo': [...]}",
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Cruza la Tabla 2 y el archivo de Movimiento ya obtenidos por el
    frontend (no recibe archivos aquí) para llenar Efectivo/Amex/Visa/
    M.Card/Crédito/Totales de cada cuenta, y regresa un resumen para
    verificar que la suma de Tabla 2 cuadre contra la suma de Tabla 1.
    `filas_amex_periodo` es opcional (ver `/movimientos-periodo/upload`).
    """
    tabla1 = body.get("tabla1") or []
    tabla2 = body.get("tabla2") or []
    movimiento_filas = body.get("movimiento_filas") or []
    filas_amex_periodo = body.get("filas_amex_periodo") or []

    try:
        resultado = conciliar_forma_pago_pagos_recepcion(tabla2, movimiento_filas, filas_amex_periodo)
    except Exception as e:
        logger.exception("Error conciliando la forma de pago")
        raise HTTPException(status_code=400, detail=f"Error al conciliar: {str(e)}")

    suma_tabla1 = sum(fila.get("total", 0.0) for fila in tabla1)
    suma_tabla2 = sum(fila.get("totales", 0.0) for fila in resultado["tabla2"])

    return {
        "tabla2": resultado["tabla2"],
        "no_conciliados": resultado["no_conciliados"],
        "amex_sin_match": resultado["amex_sin_match"],
        "credito_reclasificado_a_amex": resultado["credito_reclasificado_a_amex"],
        "suma_tabla1": suma_tabla1,
        "suma_tabla2": suma_tabla2,
        "diferencia": suma_tabla1 - suma_tabla2,
    }


CAMPOS_PAGO_RECEPCION_DIA = (
    "efectivo",
    "amex",
    "visa",
    "mcard",
    "credito",
    "totales",
    "subtotal1",
    "iva16",
    "ish3",
    "subtotal2",
    "gravado",
    "tasa0",
    "propina",
    "total",
)


def _fila_a_dict(fila: PagoRecepcionDia) -> dict:
    return {
        "id": fila.id,
        "fecha": fila.fecha.isoformat(),
        "cuenta": fila.cuenta,
        "habitacion": fila.habitacion,
        "huesped": fila.huesped,
        "es_manual": fila.es_manual,
        "es_sin_cuenta": fila.es_sin_cuenta,
        **{campo: getattr(fila, campo) for campo in CAMPOS_PAGO_RECEPCION_DIA},
    }


@router.post("/pagos-del-mes")
async def guardar_pagos_del_mes(
    body: dict = Body(
        ...,
        description="{'fecha': 'YYYY-MM-DD', 'tabla2': [...], 'no_conciliados': [...]}",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Guarda en "Pagos del Mes", para el día indicado a mano por el usuario:
    el subconjunto ya conciliado de Tabla 2 (Totales > 0), y además una
    fila por cada pago de `no_conciliados` (lo que `conciliar_forma_pago_
    pagos_recepcion` no logró amarrar a ninguna cuenta) — Movimiento es la
    fuente de verdad de lo que de verdad se cobró ese día, así que nada de
    lo que trae debe perderse solo porque no encontró su factura; esas
    filas quedan `es_manual=True, es_sin_cuenta=True` (mismo mecanismo que
    `POST /pagos-del-mes/fila-manual`, pero generado solo). Reemplaza las
    cuentas de Tabla 2 y las filas `es_sin_cuenta` ya guardadas para esa
    fecha — las filas manuales REALES (`es_manual=True, es_sin_cuenta=
    False`, tecleadas por el usuario vía `/pagos-del-mes/fila-manual`)
    nunca se tocan aquí, para que volver a conciliar/guardar un día no
    borre un ajuste manual ya capturado. Si ya había cuentas de Tabla 2
    guardadas para esa fecha y el body no trae `confirmar_reemplazo: true`,
    no borra nada — regresa `requiere_confirmacion` para que el frontend
    avise al usuario antes de reemplazar. Con `confirmar_reemplazo: true`,
    reemplaza como antes.
    """
    fecha_texto = body.get("fecha")
    tabla2 = body.get("tabla2") or []
    no_conciliados = body.get("no_conciliados") or []
    confirmar_reemplazo = bool(body.get("confirmar_reemplazo"))
    if not fecha_texto:
        raise HTTPException(status_code=400, detail="Falta 'fecha'")
    try:
        fecha = date.fromisoformat(fecha_texto)
    except ValueError:
        raise HTTPException(status_code=400, detail="'fecha' debe tener formato YYYY-MM-DD")

    if not confirmar_reemplazo:
        res_conteo = await db.execute(
            select(func.count())
            .select_from(PagoRecepcionDia)
            .where(PagoRecepcionDia.fecha == fecha, PagoRecepcionDia.es_manual == False)  # noqa: E712
        )
        cuentas_existentes = res_conteo.scalar_one()
        if cuentas_existentes > 0:
            return {"requiere_confirmacion": True, "cuentas_existentes": cuentas_existentes}

    cuentas_conciliadas = filtrar_cuentas_conciliadas(tabla2)

    await db.execute(
        delete(PagoRecepcionDia).where(
            PagoRecepcionDia.fecha == fecha,
            (PagoRecepcionDia.es_manual == False) | (PagoRecepcionDia.es_sin_cuenta == True),  # noqa: E712
        )
    )

    filas_guardadas: list[PagoRecepcionDia] = []
    for cuenta in cuentas_conciliadas:
        fila = PagoRecepcionDia(
            fecha=fecha,
            cuenta=cuenta.get("cuenta"),
            habitacion=cuenta.get("habitacion"),
            huesped=cuenta.get("huesped"),
            es_manual=False,
            **{campo: cuenta.get(campo, 0.0) for campo in CAMPOS_PAGO_RECEPCION_DIA},
        )
        db.add(fila)
        filas_guardadas.append(fila)

    for pago in no_conciliados:
        forma_pago = pago.get("forma_pago")
        monto = float(pago.get("monto") or 0.0)
        if forma_pago not in FORMAS_PAGO_RECONOCIDAS or not monto:
            continue
        fila = PagoRecepcionDia(
            fecha=fecha,
            cuenta=0,
            habitacion=pago.get("habitacion") or None,
            huesped=pago.get("huesped") or None,
            es_manual=True,
            es_sin_cuenta=True,
            **{forma: (monto if forma == forma_pago else 0.0) for forma in FORMAS_PAGO_RECONOCIDAS},
        )
        fila.totales = monto
        db.add(fila)
        filas_guardadas.append(fila)

    await db.commit()
    for fila in filas_guardadas:
        await db.refresh(fila)

    return {"fecha": fecha.isoformat(), "total": len(filas_guardadas), "filas": [_fila_a_dict(f) for f in filas_guardadas]}


@router.get("/pagos-del-mes")
async def obtener_pagos_del_mes(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Regresa todas las cuentas guardadas en Pagos del Mes, ordenadas por fecha y cuenta."""
    res = await db.execute(
        select(PagoRecepcionDia).order_by(PagoRecepcionDia.fecha, PagoRecepcionDia.cuenta)
    )
    filas = res.scalars().all()
    return {"total": len(filas), "filas": [_fila_a_dict(f) for f in filas]}


@router.get("/pagos-del-mes/dias")
async def obtener_dias_pagos_del_mes(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Regresa las fechas distintas guardadas en Pagos del Mes con el número de cuentas de cada una."""
    res = await db.execute(
        select(PagoRecepcionDia.fecha, func.count())
        .group_by(PagoRecepcionDia.fecha)
        .order_by(PagoRecepcionDia.fecha)
    )
    return {"dias": [{"fecha": fecha.isoformat(), "total": total} for fecha, total in res.all()]}


@router.delete("/pagos-del-mes")
async def eliminar_dia_pagos_del_mes(
    fecha: str = Query(..., description="Fecha a eliminar (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Elimina todas las cuentas guardadas en Pagos del Mes para una fecha (ej. un día guardado por error)."""
    try:
        fecha_parseada = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="'fecha' debe tener formato YYYY-MM-DD")

    res_conteo = await db.execute(
        select(func.count()).select_from(PagoRecepcionDia).where(PagoRecepcionDia.fecha == fecha_parseada)
    )
    eliminados = res_conteo.scalar_one()

    await db.execute(delete(PagoRecepcionDia).where(PagoRecepcionDia.fecha == fecha_parseada))
    await db.commit()

    return {"fecha": fecha_parseada.isoformat(), "eliminados": eliminados}


@router.get("/pagos-del-mes/export")
async def exportar_pagos_del_mes(
    fecha: str | None = Query(default=None, description="Filtrar por una fecha (YYYY-MM-DD); si se omite, exporta todo"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Exporta a Excel las cuentas guardadas en Pagos del Mes, agrupadas por día con subtotal por día."""
    consulta = select(PagoRecepcionDia)
    nombre_archivo = "Pagos_Del_Mes.xlsx"
    if fecha:
        try:
            fecha_parseada = date.fromisoformat(fecha)
        except ValueError:
            raise HTTPException(status_code=400, detail="'fecha' debe tener formato YYYY-MM-DD")
        consulta = consulta.where(PagoRecepcionDia.fecha == fecha_parseada)
        nombre_archivo = f"Pagos_Del_Mes_{fecha}.xlsx"

    res = await db.execute(consulta.order_by(PagoRecepcionDia.fecha, PagoRecepcionDia.cuenta))
    filas = [_fila_a_dict(f) for f in res.scalars().all()]

    excel_bytes = generar_reporte_pagos_del_mes_excel(filas)

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=cabecera_descarga(nombre_archivo),
    )


CAMPOS_EDITABLES_PAGO_RECEPCION_DIA = (
    "efectivo",
    "amex",
    "visa",
    "mcard",
    "credito",
    "subtotal1",
    "iva16",
    "ish3",
    "propina",
)


@router.put("/pagos-del-mes/{fila_id}")
async def actualizar_pago_recepcion_dia(
    fila_id: int,
    body: dict = Body(..., description="{'efectivo', 'amex', 'visa', 'mcard', 'credito', 'subtotal1', 'iva16', 'ish3', 'propina'}"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Edita manualmente una cuenta ya guardada en Pagos del Mes: recibe los 9
    campos base editables y recalcula del lado del servidor (no confía en
    lo que mande el cliente) Totales/Subtotal2/Gravado/Tasa 0%/Total con
    las mismas fórmulas de siempre.
    """
    fila = await db.get(PagoRecepcionDia, fila_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="No se encontró esa cuenta en Pagos del Mes")

    for campo in CAMPOS_EDITABLES_PAGO_RECEPCION_DIA:
        if campo in body:
            setattr(fila, campo, float(body[campo]))

    fila.totales = sum(getattr(fila, forma) for forma in FORMAS_PAGO_RECONOCIDAS)
    derivados = calcular_metricas_desde_valores(fila.subtotal1, fila.iva16, fila.ish3, fila.propina)
    fila.subtotal2 = derivados["subtotal2"]
    fila.gravado = derivados["gravado"]
    fila.tasa0 = derivados["tasa0"]
    fila.total = derivados["total"]

    await db.commit()
    await db.refresh(fila)

    return _fila_a_dict(fila)


@router.post("/pagos-del-mes/fila-manual")
async def agregar_fila_manual_pagos_del_mes(
    body: dict = Body(
        ...,
        description="{'fecha': 'YYYY-MM-DD', 'cuenta': int?, 'habitacion': str?, 'huesped': str?, 'efectivo'/'amex'/'visa'/'mcard'/'credito': float?}",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Agrega UNA fila nueva a "Pagos del Mes" para una fecha ya guardada (sin
    borrar ni tocar las demás) — para registrar a mano un monto real
    cobrado ese día que no amarra contra ninguna factura de huésped (ej. un
    subtotal de forma de pago del archivo de Movimiento que no corresponde
    a ninguna cuenta de Tabla 2). Subtotal1/IVA16/ISH3/Propina quedan en 0
    (no hay factura detrás de este ajuste); Totales/Total se recalculan
    igual que en `PUT /pagos-del-mes/{fila_id}` — el "no cuadra" resultante
    es esperado y no se oculta.
    """
    fecha_texto = body.get("fecha")
    if not fecha_texto:
        raise HTTPException(status_code=400, detail="Falta 'fecha'")
    try:
        fecha = date.fromisoformat(fecha_texto)
    except ValueError:
        raise HTTPException(status_code=400, detail="'fecha' debe tener formato YYYY-MM-DD")

    fila = PagoRecepcionDia(
        fecha=fecha,
        cuenta=int(body.get("cuenta") or 0),
        habitacion=body.get("habitacion") or None,
        huesped=body.get("huesped") or None,
        es_manual=True,
        **{forma: float(body.get(forma) or 0.0) for forma in FORMAS_PAGO_RECONOCIDAS},
        subtotal1=0.0,
        iva16=0.0,
        ish3=0.0,
        propina=0.0,
    )
    fila.totales = sum(getattr(fila, forma) for forma in FORMAS_PAGO_RECONOCIDAS)
    derivados = calcular_metricas_desde_valores(fila.subtotal1, fila.iva16, fila.ish3, fila.propina)
    fila.subtotal2 = derivados["subtotal2"]
    fila.gravado = derivados["gravado"]
    fila.tasa0 = derivados["tasa0"]
    fila.total = derivados["total"]

    db.add(fila)
    await db.commit()
    await db.refresh(fila)

    return _fila_a_dict(fila)


@router.delete("/pagos-del-mes/{fila_id}")
async def eliminar_fila_pagos_del_mes(
    fila_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Elimina una sola fila de Pagos del Mes por id (ej. deshacer una fila manual agregada por error)."""
    fila = await db.get(PagoRecepcionDia, fila_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="No se encontró esa cuenta en Pagos del Mes")

    await db.delete(fila)
    await db.commit()

    return {"id": fila_id, "eliminado": True}


CAMPOS_MONETARIOS_ANALITICA = (
    "efectivo",
    "amex",
    "visa",
    "mcard",
    "credito",
    "totales",
    "iva16",
    "ish3",
    "propina",
    "total",
)


@router.get("/analitica")
async def obtener_analitica_pagos_recepcion(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Serie diaria (suma por fecha) y KPIs de todo el historial guardado en
    Pagos del Mes — piloto de analítica descriptiva: tendencias de ingreso
    diario, desglose por forma de pago y propinas, base para agregar
    predicciones más adelante cuando haya más historial.
    """
    columnas_suma = [func.sum(getattr(PagoRecepcionDia, campo)) for campo in CAMPOS_MONETARIOS_ANALITICA]
    res = await db.execute(
        select(PagoRecepcionDia.fecha, *columnas_suma)
        .group_by(PagoRecepcionDia.fecha)
        .order_by(PagoRecepcionDia.fecha)
    )
    filas = res.all()

    serie_diaria = [
        {
            "fecha": fecha.isoformat(),
            **{campo: round(valor or 0.0, 2) for campo, valor in zip(CAMPOS_MONETARIOS_ANALITICA, valores)},
        }
        for fecha, *valores in filas
    ]

    dias_registrados = len(serie_diaria)
    total_historico = sum(dia["total"] for dia in serie_diaria)
    propina_total = sum(dia["propina"] for dia in serie_diaria)
    hoy = date.today()
    total_mes_actual = sum(
        dia["total"] for dia in serie_diaria if date.fromisoformat(dia["fecha"]).month == hoy.month
        and date.fromisoformat(dia["fecha"]).year == hoy.year
    )

    kpis = {
        "dias_registrados": dias_registrados,
        "total_historico": round(total_historico, 2),
        "total_mes_actual": round(total_mes_actual, 2),
        "promedio_diario": round(total_historico / dias_registrados, 2) if dias_registrados else 0.0,
        "propina_total": round(propina_total, 2),
        "propina_promedio_diaria": round(propina_total / dias_registrados, 2) if dias_registrados else 0.0,
        "distribucion_forma_pago": {
            forma: round(sum(dia[forma] for dia in serie_diaria), 2)
            for forma in ("efectivo", "amex", "visa", "mcard", "credito")
        },
    }

    res_cuentas = await db.execute(
        select(
            PagoRecepcionDia.cuenta,
            PagoRecepcionDia.habitacion,
            PagoRecepcionDia.huesped,
            PagoRecepcionDia.fecha,
            PagoRecepcionDia.totales,
            PagoRecepcionDia.total,
        ).order_by(PagoRecepcionDia.cuenta, PagoRecepcionDia.fecha)
    )
    ultimo_por_cuenta: dict[int, tuple] = {}
    for cuenta, habitacion, huesped, fecha, totales, total in res_cuentas.all():
        # Ordenado por fecha ascendente: la última vez que se itera cada
        # cuenta es, por construcción, su registro más reciente.
        ultimo_por_cuenta[cuenta] = (habitacion, huesped, fecha, totales, total)

    cuentas_pendientes = []
    for cuenta, (habitacion, huesped, fecha, totales, total) in ultimo_por_cuenta.items():
        pendiente = total - totales
        if pendiente > TOLERANCIA_CONCILIACION:
            cuentas_pendientes.append(
                {
                    "cuenta": cuenta,
                    "habitacion": habitacion,
                    "huesped": huesped,
                    "fecha": fecha.isoformat(),
                    "totales": round(totales, 2),
                    "total": round(total, 2),
                    "pendiente": round(pendiente, 2),
                }
            )
    cuentas_pendientes.sort(key=lambda c: c["pendiente"], reverse=True)

    return {"serie_diaria": serie_diaria, "kpis": kpis, "cuentas_pendientes": cuentas_pendientes}
