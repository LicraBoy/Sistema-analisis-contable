"""
Regresión para services/api de cortesias_dashboard.py — protege el 5º
dashboard de "Análisis y Profundidad":

- `construir_resumen_cortesias` agrega cortesías del mismo producto entre
  2 lotes distintos dentro del rango (no las lista duplicadas).
- `construir_desglose_dia_turno` solo usa lotes de un solo día (single-day)
  — reutiliza `construir_productos_consolidados`, ya protegido por
  `test_conciliacion_ventas_diarias.py`, no reimplementa su lógica.
- El router separa lotes multi-día de los de un solo día y reporta cuántos
  quedaron excluidos del desglose por día/turno.
"""

from datetime import date, time

import pytest

from app.api.cortesias_dashboard import obtener_cortesias_dashboard
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ProductoVendidoDetalle
from app.services.cortesias_dashboard import construir_desglose_dia_turno, construir_resumen_cortesias


def _comanda(fecha, hora, turno, producto, cantidad, cuenta="1"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta=cuenta,
        estatus="Vendido", grupo="BEBIDAS", categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _pv(fecha_desde, fecha_hasta, nombre, cantidad, costo, precio_venta, subtotal, impuesto, descuento=0.0):
    return ProductoVendidoDetalle(
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, punto_venta="Restaurante", grupo="BEBIDAS",
        nombre_producto=nombre, costo=costo, precio_venta=precio_venta, cantidad=cantidad, total_costo=0.0,
        descuento=descuento, subtotal=subtotal, impuesto=impuesto, total=subtotal + impuesto,
        categoria_tipo="Bebidas", seccion_menu="Bar", producto_catalogo_encontrado=True,
        costo_catalogo=costo, precio_venta_catalogo=precio_venta,
    )


def _catalogo(nombre, costo, precio_venta, grupo="BEBIDAS"):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo=grupo, nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo="Bebidas", seccion_menu="Bar", costo=costo, precio_venta=precio_venta,
    )


# ── construir_resumen_cortesias ─────────────────────────────────────────

def test_resumen_agrega_mismo_producto_entre_2_lotes():
    pv = [
        _pv(date(2026, 9, 1), date(2026, 9, 1), "CAFE", cantidad=5.0, costo=12.74, precio_venta=49.75,
            subtotal=100.0, impuesto=20.0),
        _pv(date(2026, 9, 5), date(2026, 9, 5), "CAFE", cantidad=3.0, costo=12.74, precio_venta=49.75,
            subtotal=50.0, impuesto=5.0),
    ]

    resultado = construir_resumen_cortesias(pv)

    assert len(resultado["productos"]) == 1
    fila = resultado["productos"][0]
    assert fila["producto"] == "CAFE"
    # ingreso_real de cada fila: 20/0.16=125, monto=|125-100|=25; 5/0.16=31.25, monto=|31.25-50|=18.75
    assert fila["monto_cortesia"] == pytest.approx(25.0 + 18.75, abs=0.01)


def test_resumen_producto_sin_costo_no_truena():
    pv = [_pv(date(2026, 9, 1), date(2026, 9, 1), "SIN COSTO", cantidad=1.0, costo=0.0, precio_venta=10.0,
              subtotal=10.0, impuesto=1.6)]

    resultado = construir_resumen_cortesias(pv)

    assert resultado["productos"] == []  # sin costo, no se puede calcular cantidad_cortesia -> excluido


def test_resumen_lista_vacia():
    resultado = construir_resumen_cortesias([])
    assert resultado["total_monto_cortesia"] == 0.0
    assert resultado["productos"] == []


# ── construir_desglose_dia_turno ────────────────────────────────────────

def test_desglose_usa_solo_lotes_de_un_solo_dia():
    fecha = date(2026, 9, 17)
    comandas_dia = [_comanda(fecha, time(13, 0), "Comida", "CAFE", 2.0)]
    pv_dia = [_pv(fecha, fecha, "CAFE", cantidad=2.0, costo=12.74, precio_venta=49.75, subtotal=85.6, impuesto=13.7)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]

    resultado = construir_desglose_dia_turno({fecha: (pv_dia, comandas_dia)}, catalogo)

    assert len(resultado["por_dia"]) == 1
    assert resultado["por_dia"][0]["fecha"] == fecha.isoformat()
    assert len(resultado["por_turno"]) == 1
    assert resultado["por_turno"][0]["turno"] == "Comida"


def test_desglose_sin_fechas_no_genera_filas():
    resultado = construir_desglose_dia_turno({}, catalogo=[])
    assert resultado["por_dia"] == []
    assert resultado["por_turno"] == []


# ── obtener_cortesias_dashboard (router) ────────────────────────────────

@pytest.mark.anyio
async def test_router_excluye_lote_multidia_del_desglose(db_session):
    """Un lote de 2 días cuenta en el resumen total, pero no aporta a por_dia/por_turno."""
    db_session.add_all(
        [
            _pv(date(2026, 9, 1), date(2026, 9, 2), "CAFE", cantidad=10.0, costo=12.74, precio_venta=49.75,
                subtotal=428.02, impuesto=68.48),
        ]
    )
    await db_session.commit()

    resultado = await obtener_cortesias_dashboard(
        fecha_desde=date(2026, 9, 1), fecha_hasta=date(2026, 9, 2), db=db_session, current_user={}
    )

    assert resultado["dias_excluidos_por_lote_multi_dia"] == 1
    assert resultado["por_dia"] == []
    assert resultado["resumen"]["productos"][0]["producto"] == "CAFE"


@pytest.mark.anyio
async def test_router_lote_fuera_de_rango_no_se_cuenta(db_session):
    db_session.add_all(
        [
            _pv(date(2026, 8, 1), date(2026, 8, 1), "CAFE", cantidad=5.0, costo=12.74, precio_venta=49.75,
                subtotal=100.0, impuesto=20.0),
        ]
    )
    await db_session.commit()

    resultado = await obtener_cortesias_dashboard(
        fecha_desde=date(2026, 9, 1), fecha_hasta=date(2026, 9, 17), db=db_session, current_user={}
    )

    assert resultado["resumen"]["productos"] == []
