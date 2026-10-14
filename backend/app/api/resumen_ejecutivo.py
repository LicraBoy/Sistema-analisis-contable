"""
Resumen Ejecutivo router — KPIs e insights automáticos de ventas para un
rango de fechas (Restaurante). Todo se calcula al vuelo; ver
`services/resumen_ejecutivo.py`.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ReciboEmitidoDetalle
from app.services.rangos_fecha import mismo_periodo_anio_anterior, periodo_anterior
from app.services.ranking_productos import construir_ranking_productos
from app.services.resumen_ejecutivo import (
    calcular_kpis,
    construir_comparaciones_periodo,
    construir_conciliacion_ventas,
    construir_serie_diaria,
    construir_serie_mensual,
    generar_insights,
)
from app.services.venta_neta import venta_neta_de

router = APIRouter()

# El último día con datos se marca "parcial" si tiene menos de esta fracción
# de las cuentas comerciales de un día promedio del rango (probablemente el
# día aún no cierra completo) — evita presentar una "caída" que es solo un día
# incompleto. Necesita al menos `_MIN_DIAS_PARA_DIA_PARCIAL` otros días.
_UMBRAL_DIA_PARCIAL = 0.70
_MIN_DIAS_PARA_DIA_PARCIAL = 3


async def _recibos_en(db: AsyncSession, desde: date, hasta: date) -> list:
    return (
        (
            await db.execute(
                select(ReciboEmitidoDetalle).where(
                    ReciboEmitidoDetalle.fecha >= desde, ReciboEmitidoDetalle.fecha <= hasta
                )
            )
        )
        .scalars()
        .all()
    )


def _en(recibos: list, desde: date, hasta: date) -> list:
    return [r for r in recibos if desde <= r.fecha <= hasta]


def _dia_es_parcial(serie_diaria: list[dict], dia_referencia: date) -> bool:
    cuentas_por_dia = {f["fecha"]: f["cantidad_cuentas"] for f in serie_diaria}
    otros = [v for k, v in cuentas_por_dia.items() if k != dia_referencia.isoformat()]
    if len(otros) < _MIN_DIAS_PARA_DIA_PARCIAL:
        return False
    promedio = sum(otros) / len(otros)
    return bool(promedio) and cuentas_por_dia.get(dia_referencia.isoformat(), 0) < promedio * _UMBRAL_DIA_PARCIAL


@router.get("")
async def obtener_resumen_ejecutivo(
    fecha_desde: date = Query(..., description="Inicio del rango, formato 'YYYY-MM-DD'"),
    fecha_hasta: date = Query(..., description="Fin del rango (incluido), formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    comandas = (
        (
            await db.execute(
                select(ComandaEmitidaDetalle).where(
                    ComandaEmitidaDetalle.fecha >= fecha_desde, ComandaEmitidaDetalle.fecha <= fecha_hasta
                )
            )
        )
        .scalars()
        .all()
    )

    # Periodo anterior: mes calendario anterior si el rango es un mes
    # calendario completo (caso normal del frontend), si no, mismo número de
    # días inmediatamente antes — ver services/rangos_fecha.py.
    fecha_desde_anterior, fecha_hasta_anterior = periodo_anterior(fecha_desde, fecha_hasta)

    # Una sola consulta contigua cubre: periodo actual, periodo anterior y las
    # ventanas de semana (7+7 días terminando el último día del rango). Antes
    # eran 7 consultas secuenciales de la misma tabla. Solo el año anterior
    # (lejano) necesita su propia consulta.
    desde_ancho = min(fecha_desde_anterior, fecha_hasta - timedelta(days=13))
    recibos_ancho = await _recibos_en(db, desde_ancho, fecha_hasta)
    recibos = _en(recibos_ancho, fecha_desde, fecha_hasta)
    recibos_periodo_anterior = _en(recibos_ancho, fecha_desde_anterior, fecha_hasta_anterior)
    total_vendido_periodo_anterior = venta_neta_de(recibos_periodo_anterior) if recibos_periodo_anterior else None

    # Sin filtrar por punto_venta: mismo criterio que el resto de Ventas
    # Diarias (catalogo_productos.punto_venta no trae "Restaurante" tal cual).
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    productos = construir_ranking_productos(comandas, catalogo)

    serie_diaria = construir_serie_diaria(comandas, recibos)
    kpis = calcular_kpis(serie_diaria, recibos, total_vendido_periodo_anterior)
    insights = generar_insights(serie_diaria, comandas, recibos, kpis, catalogo, productos)
    conciliacion = construir_conciliacion_ventas(recibos, comandas, productos)

    comparaciones = None
    if serie_diaria:
        dia_referencia = date.fromisoformat(max(fila["fecha"] for fila in serie_diaria))
        # "Día" se compara contra el MISMO día de la semana anterior (un
        # domingo contra el domingo previo, no contra el sábado).
        dia_comparado = dia_referencia - timedelta(days=7)
        semana_desde = dia_referencia - timedelta(days=6)
        semana_anterior_hasta = semana_desde - timedelta(days=1)
        semana_anterior_desde = semana_anterior_hasta - timedelta(days=6)
        anio_anterior_desde, anio_anterior_hasta = mismo_periodo_anio_anterior(fecha_desde, fecha_hasta)
        recibos_anio_anterior = await _recibos_en(db, anio_anterior_desde, anio_anterior_hasta)

        comparaciones = construir_comparaciones_periodo(
            recibos_dia=_en(recibos_ancho, dia_referencia, dia_referencia),
            recibos_dia_anterior=_en(recibos_ancho, dia_comparado, dia_comparado),
            recibos_semana=_en(recibos_ancho, semana_desde, dia_referencia),
            recibos_semana_anterior=_en(recibos_ancho, semana_anterior_desde, semana_anterior_hasta),
            recibos_mes=recibos,
            recibos_mes_anterior=recibos_periodo_anterior,
            recibos_anio_anterior=recibos_anio_anterior,
        )
        comparaciones["dia"].update(
            {
                "fecha": dia_referencia.isoformat(),
                "fecha_comparada": dia_comparado.isoformat(),
                "parcial": _dia_es_parcial(serie_diaria, dia_referencia),
            }
        )

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "kpis": kpis,
        "serie_diaria": serie_diaria,
        "insights": insights,
        "comparaciones": comparaciones,
        "conciliacion": conciliacion,
    }


@router.get("/tendencia-mensual")
async def obtener_tendencia_mensual(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Vista "Todos los meses" del selector único de Análisis y Profundidad: un total por mes, sin filtro de fecha."""
    comandas = (await db.execute(select(ComandaEmitidaDetalle))).scalars().all()
    recibos = (await db.execute(select(ReciboEmitidoDetalle))).scalars().all()

    return {"meses": construir_serie_mensual(comandas, recibos)}
