"""
Panel de Turnos router — comparativo Desayuno/Comida/Cena para un rango de
fechas, calculado al vuelo a partir de Comandas Emitidas y Recibos
Emitidos. Ver `services/panel_turnos.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ReciboEmitidoDetalle
from app.services.panel_turnos import construir_comparativo_turnos

router = APIRouter()


@router.get("")
async def obtener_panel_turnos(
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
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    turnos = construir_comparativo_turnos(comandas, recibos, catalogo)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "turnos": turnos,
    }
