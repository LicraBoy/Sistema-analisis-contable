"""
Panel de Oportunidades Comerciales router — arma internamente lo mismo que
ya arman `/heatmap-ventas` y `/ranking-productos` (llamando directo a sus
funciones de servicio, sin HTTP) y le pasa el resultado a
`services/oportunidades_comerciales.py::detectar_oportunidades`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.heatmap_ventas import construir_heatmap_dia_hora
from app.services.oportunidades_comerciales import detectar_oportunidades
from app.services.rangos_fecha import periodo_anterior
from app.services.ranking_productos import (
    agregar_variacion_periodo_anterior,
    construir_ranking_grupos,
    construir_ranking_productos,
)

router = APIRouter()


@router.get("")
async def obtener_oportunidades_comerciales(
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
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

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

    heatmap = construir_heatmap_dia_hora(comandas)
    productos = construir_ranking_productos(comandas, catalogo)
    productos_periodo_anterior = construir_ranking_productos(comandas_periodo_anterior, catalogo)
    productos = agregar_variacion_periodo_anterior(productos, productos_periodo_anterior)
    grupos = construir_ranking_grupos(productos)

    oportunidades = detectar_oportunidades(heatmap, productos, grupos)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "oportunidades": oportunidades,
    }
