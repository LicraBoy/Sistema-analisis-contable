"""
Alertas de Riesgo router — hallazgos ejecutivos de riesgo para un rango de
fechas, comparando siempre contra el periodo inmediato anterior (mismo
número de días). Ver `services/alertas_riesgo.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ProductoVendidoDetalle, ReciboEmitidoDetalle
from app.services.alertas_riesgo import agregar_variacion_margen, detectar_alertas_riesgo
from app.services.cortesias_dashboard import construir_resumen_cortesias, elegir_resumen_cortesias
from app.services.rangos_fecha import periodo_anterior
from app.services.ranking_productos import (
    agregar_variacion_periodo_anterior,
    agregar_variacion_periodo_anterior_grupos,
    construir_ranking_grupos,
    construir_ranking_productos,
)

router = APIRouter()


@router.get("")
async def obtener_alertas_riesgo(
    fecha_desde: date = Query(..., description="Inicio del rango, formato 'YYYY-MM-DD'"),
    fecha_hasta: date = Query(..., description="Fin del rango (incluido), formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Periodo anterior: mes calendario anterior si el rango es un mes
    # calendario completo (caso normal del frontend), si no, mismo número de
    # días inmediatamente antes — ver services/rangos_fecha.py.
    fecha_desde_anterior, fecha_hasta_anterior = periodo_anterior(fecha_desde, fecha_hasta)

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
    comandas_anterior = (
        (
            await db.execute(
                select(ComandaEmitidaDetalle).where(
                    ComandaEmitidaDetalle.fecha >= fecha_desde_anterior,
                    ComandaEmitidaDetalle.fecha <= fecha_hasta_anterior,
                )
            )
        )
        .scalars()
        .all()
    )
    # Sin filtrar por punto_venta: mismo criterio que el resto de Ventas
    # Diarias (catalogo_productos.punto_venta no trae "Restaurante" tal cual).
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    productos_actual = construir_ranking_productos(comandas, catalogo)
    productos_anterior = construir_ranking_productos(comandas_anterior, catalogo)

    productos = agregar_variacion_periodo_anterior(productos_actual, productos_anterior)
    productos = agregar_variacion_margen(productos, productos_anterior)

    grupos_actual = construir_ranking_grupos(productos_actual)
    grupos_anterior = construir_ranking_grupos(productos_anterior)
    grupos_con_variacion = agregar_variacion_periodo_anterior_grupos(grupos_actual, grupos_anterior)

    # Mismo criterio de traslape que el guard de /productos-vendidos/upload y
    # api/cortesias_dashboard.py: cualquier lote que toque el rango, no solo
    # los contenidos por completo en él.
    productos_vendidos_actual = (
        (
            await db.execute(
                select(ProductoVendidoDetalle).where(
                    ProductoVendidoDetalle.fecha_desde <= fecha_hasta,
                    ProductoVendidoDetalle.fecha_hasta >= fecha_desde,
                )
            )
        )
        .scalars()
        .all()
    )
    productos_vendidos_anterior = (
        (
            await db.execute(
                select(ProductoVendidoDetalle).where(
                    ProductoVendidoDetalle.fecha_desde <= fecha_hasta_anterior,
                    ProductoVendidoDetalle.fecha_hasta >= fecha_desde_anterior,
                )
            )
        )
        .scalars()
        .all()
    )
    # Cortesías: Recibos (todos los meses) si ambos periodos tienen recibos; si
    # no, cae a Productos Vendidos — ver `elegir_resumen_cortesias`.
    async def _recibos_en(desde: date, hasta: date) -> list:
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

    resumen_cortesias_actual, resumen_cortesias_anterior = elegir_resumen_cortesias(
        await _recibos_en(fecha_desde, fecha_hasta),
        await _recibos_en(fecha_desde_anterior, fecha_hasta_anterior),
        construir_resumen_cortesias(productos_vendidos_actual),
        construir_resumen_cortesias(productos_vendidos_anterior),
    )

    alertas = detectar_alertas_riesgo(productos, grupos_con_variacion, resumen_cortesias_actual, resumen_cortesias_anterior)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "alertas": alertas,
    }
