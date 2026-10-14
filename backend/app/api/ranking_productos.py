"""
Ranking de Productos router — popularidad/margen/ingreso por producto para
un rango de fechas, calculado al vuelo a partir de Comandas Emitidas ×
Catálogo. Ver `services/ranking_productos.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.rangos_fecha import periodo_anterior
from app.services.ranking_productos import (
    agregar_variacion_periodo_anterior,
    construir_ranking_grupos,
    construir_ranking_productos,
)

router = APIRouter()


@router.get("")
async def obtener_ranking_productos(
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

    # Periodo anterior: mes calendario anterior si el rango es un mes
    # calendario completo (caso normal del frontend), si no, mismo número de
    # días inmediatamente antes — ver services/rangos_fecha.py.
    fecha_desde_anterior, fecha_hasta_anterior = periodo_anterior(fecha_desde, fecha_hasta)
    comandas_periodo_anterior = (
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
    productos_periodo_anterior = construir_ranking_productos(comandas_periodo_anterior, catalogo)

    productos = construir_ranking_productos(comandas, catalogo)
    productos = agregar_variacion_periodo_anterior(productos, productos_periodo_anterior)
    grupos = construir_ranking_grupos(productos)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "productos": productos,
        "grupos": grupos,
    }
