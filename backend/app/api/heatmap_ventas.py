"""
Heatmap Día×Hora de Ventas router — patrón de afluencia por fecha exacta y
hora, calculado al vuelo a partir de Comandas Emitidas, más detección de
picos de venta y notas manuales por fecha. Ver `services/heatmap_ventas.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import ComandaEmitidaDetalle, NotaFechaHeatmap
from app.services.heatmap_ventas import construir_heatmap_dia_hora, detectar_picos_venta

router = APIRouter()


@router.get("")
async def obtener_heatmap_ventas(
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

    heatmap = construir_heatmap_dia_hora(comandas)
    picos = detectar_picos_venta(heatmap["celdas"])

    notas_filas = (
        (
            await db.execute(
                select(NotaFechaHeatmap).where(
                    NotaFechaHeatmap.fecha >= fecha_desde, NotaFechaHeatmap.fecha <= fecha_hasta
                )
            )
        )
        .scalars()
        .all()
    )
    notas = {fila.fecha.isoformat(): fila.nota for fila in notas_filas}

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "celdas": heatmap["celdas"],
        "fechas_con_datos": heatmap["fechas_con_datos"],
        "picos": picos,
        "notas": notas,
    }


class NotaFechaHeatmapBody(BaseModel):
    fecha: date
    nota: str


@router.put("/notas")
async def guardar_nota_fecha_heatmap(
    body: NotaFechaHeatmapBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Upsert por fecha — una nota vacía borra la fila en vez de guardar un string vacío."""
    fila = (
        await db.execute(select(NotaFechaHeatmap).where(NotaFechaHeatmap.fecha == body.fecha))
    ).scalar_one_or_none()

    nota_limpia = body.nota.strip()

    if not nota_limpia:
        if fila is not None:
            await db.delete(fila)
        return {"fecha": body.fecha.isoformat(), "nota": None}

    if fila is None:
        fila = NotaFechaHeatmap(fecha=body.fecha, nota=nota_limpia)
        db.add(fila)
    else:
        fila.nota = nota_limpia

    return {"fecha": body.fecha.isoformat(), "nota": nota_limpia}
