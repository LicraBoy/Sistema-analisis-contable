"""
Mix de Ventas router — distribución de ventas por grupo, categoria_tipo,
seccion_menu y turno para un rango de fechas. Ver `services/mix_ventas.py`,
`services/ranking_productos.py` y `services/panel_turnos.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ReciboEmitidoDetalle
from app.services.mix_ventas import construir_mix_categoria_tipo, construir_mix_seccion_menu
from app.services.panel_turnos import construir_comparativo_turnos
from app.services.ranking_productos import construir_ranking_grupos, construir_ranking_productos

router = APIRouter()


@router.get("")
async def obtener_mix_ventas(
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
    recibos = (
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
    # Sin filtrar por punto_venta: mismo criterio que el resto de Ventas
    # Diarias (catalogo_productos.punto_venta no trae "Restaurante" tal cual).
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    productos = construir_ranking_productos(comandas, catalogo)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "grupo": construir_ranking_grupos(productos),
        "categoria_tipo": construir_mix_categoria_tipo(comandas, catalogo),
        "seccion_menu": construir_mix_seccion_menu(comandas, catalogo),
        "turno": construir_comparativo_turnos(comandas, recibos, catalogo),
    }
