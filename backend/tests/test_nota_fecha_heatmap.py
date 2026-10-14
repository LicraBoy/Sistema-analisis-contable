"""
Regresión para el router de notas por fecha del Heatmap
(`api/heatmap_ventas.py::guardar_nota_fecha_heatmap`) — protege el upsert por
fecha y el borrado al guardar una nota vacía.
"""

from datetime import date

import pytest

from app.api.heatmap_ventas import NotaFechaHeatmapBody, guardar_nota_fecha_heatmap
from app.models import NotaFechaHeatmap


@pytest.mark.anyio
async def test_guardar_nota_nueva_la_crea(db_session):
    resultado = await guardar_nota_fecha_heatmap(
        NotaFechaHeatmapBody(fecha=date(2026, 9, 15), nota="Fiesta Mexicana"), db=db_session, current_user={}
    )

    assert resultado == {"fecha": "2026-09-15", "nota": "Fiesta Mexicana"}


@pytest.mark.anyio
async def test_guardar_nota_existente_la_actualiza(db_session):
    db_session.add(NotaFechaHeatmap(fecha=date(2026, 9, 15), nota="Nota vieja"))
    await db_session.commit()

    resultado = await guardar_nota_fecha_heatmap(
        NotaFechaHeatmapBody(fecha=date(2026, 9, 15), nota="Nota nueva"), db=db_session, current_user={}
    )

    assert resultado["nota"] == "Nota nueva"


@pytest.mark.anyio
async def test_guardar_nota_vacia_borra_la_fila(db_session):
    db_session.add(NotaFechaHeatmap(fecha=date(2026, 9, 15), nota="Algo"))
    await db_session.commit()

    resultado = await guardar_nota_fecha_heatmap(
        NotaFechaHeatmapBody(fecha=date(2026, 9, 15), nota="   "), db=db_session, current_user={}
    )

    assert resultado == {"fecha": "2026-09-15", "nota": None}
