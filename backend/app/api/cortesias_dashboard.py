"""
Dashboard de Cortesías router — impacto económico y ranking por producto
para un rango de fechas, más desglose día/turno cuando hay granularidad
real (lotes de Productos Vendidos de un solo día). Ver
`services/cortesias_dashboard.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ProductoVendidoDetalle, ReciboEmitidoDetalle
from app.services.cortesias_dashboard import (
    construir_cortesias_desde_recibos,
    construir_desglose_dia_turno,
    construir_resumen_cortesias,
)

router = APIRouter()


@router.get("")
async def obtener_cortesias_dashboard(
    fecha_desde: date = Query(..., description="Inicio del rango, formato 'YYYY-MM-DD'"),
    fecha_hasta: date = Query(..., description="Fin del rango (incluido), formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Mismo criterio de traslape que el guard de /productos-vendidos/upload:
    # cualquier lote que toque el rango pedido, no solo los contenidos por
    # completo en él.
    productos_vendidos_en_rango = (
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
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    recibos_rango = (
        (
            await db.execute(
                select(ReciboEmitidoDetalle).where(
                    ReciboEmitidoDetalle.fecha >= fecha_desde, ReciboEmitidoDetalle.fecha <= fecha_hasta
                )
            )
        )
        .scalars()
        .all()
    )

    resumen = construir_resumen_cortesias(productos_vendidos_en_rango)

    lotes_un_dia = sorted(
        {row.fecha_desde for row in productos_vendidos_en_rango if row.fecha_desde == row.fecha_hasta}
    )
    lotes_multi_dia = {
        (row.fecha_desde, row.fecha_hasta)
        for row in productos_vendidos_en_rango
        if row.fecha_desde != row.fecha_hasta
    }

    datos_por_dia = {}
    for fecha in lotes_un_dia:
        pv_dia = [
            row for row in productos_vendidos_en_rango if row.fecha_desde == fecha and row.fecha_hasta == fecha
        ]
        comandas_dia = (
            (await db.execute(select(ComandaEmitidaDetalle).where(ComandaEmitidaDetalle.fecha == fecha)))
            .scalars()
            .all()
        )
        datos_por_dia[fecha] = (pv_dia, comandas_dia)

    desglose = construir_desglose_dia_turno(datos_por_dia, catalogo)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "resumen": resumen,
        # Fuente principal (Recibos, todos los meses, con departamento); `resumen`
        # y el desglose de arriba/abajo son el detalle por producto vía PV.
        "recibos": construir_cortesias_desde_recibos(recibos_rango),
        "por_dia": desglose["por_dia"],
        "por_turno": desglose["por_turno"],
        "dias_excluidos_por_lote_multi_dia": len(lotes_multi_dia),
    }
