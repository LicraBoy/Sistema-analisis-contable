"""
Dependencia de Productos router — tabla de concentración de ingreso (Pareto)
para un rango de fechas. Ver `services/dependencia_productos.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.dependencia_productos import construir_tabla_dependencia
from app.services.ranking_productos import construir_ranking_productos

router = APIRouter()


@router.get("")
async def obtener_dependencia_productos(
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
    # Sin filtrar por punto_venta: mismo criterio que el resto de Ventas
    # Diarias (catalogo_productos.punto_venta no trae "Restaurante" tal cual).
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    productos = construir_ranking_productos(comandas, catalogo)
    tabla = construir_tabla_dependencia(productos)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        **tabla,
    }
