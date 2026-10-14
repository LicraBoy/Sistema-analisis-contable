"""
Regresión para services/api de panel_turnos.py — protege el cuarto
dashboard de "Análisis y Profundidad":

- Agrega total_vendido/cantidad_cuentas/piezas_vendidas por turno.
- ticket_promedio no truena sin cuentas.
- pct_participacion suma ~100% entre todos los turnos del rango.
- Un turno con Comandas pero sin Recibos (o viceversa) no se descarta.
- margen_pct se calcula con Catálogo × Comandas (nunca con los montos de
  Recibos, que no tienen desglose por producto).
- Rango sin datos no genera filas.
"""

from datetime import date, time

import pytest

from app.models import CatalogoProducto, ComandaEmitidaDetalle, ReciboEmitidoDetalle
from app.services.panel_turnos import construir_comparativo_turnos


def _comanda(fecha, hora, turno, cantidad, producto="CAFE", cuenta="1"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta=cuenta,
        estatus="Vendido", grupo="BEBIDAS", categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _recibo(fecha, hora, turno, cuenta="1", total=100.0):
    return ReciboEmitidoDetalle(
        fecha=fecha, hora=hora, turno=turno, cuenta=cuenta, pos="RESTAURANT LA PALAPA", tipo="HOTEL",
        pagada="ALGUIEN, X", subtotal=total, descuento=0.0, tax=0.0, room_serv=0.0, servicio=0.0,
        propina=0.0, total=total, subtotal_tipo_producto=0.0,
    )


def _catalogo(nombre, costo, precio_venta, grupo="BEBIDAS"):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo=grupo, nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo="Bebidas", seccion_menu="Bar", costo=costo, precio_venta=precio_venta,
    )


def test_comparativo_agrega_por_turno():
    comandas = [
        _comanda(date(2026, 9, 1), time(8, 0), "Desayuno", 2.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", 5.0),
    ]
    recibos = [
        _recibo(date(2026, 9, 1), time(8, 30), "Desayuno", cuenta="a", total=100.0),
        _recibo(date(2026, 9, 1), time(13, 30), "Comida", cuenta="b", total=300.0),
    ]

    resultado = construir_comparativo_turnos(comandas, recibos, catalogo=[])

    desayuno = next(f for f in resultado if f["turno"] == "Desayuno")
    comida = next(f for f in resultado if f["turno"] == "Comida")
    assert desayuno["total_vendido"] == 100.0
    assert desayuno["piezas_vendidas"] == 2.0
    assert comida["total_vendido"] == 300.0
    assert comida["piezas_vendidas"] == 5.0
    # Orden fijo: Desayuno antes que Comida.
    assert [f["turno"] for f in resultado] == ["Desayuno", "Comida"]


def test_ticket_promedio_sin_cuentas_no_truena():
    comandas = [_comanda(date(2026, 9, 1), time(8, 0), "Desayuno", 2.0)]

    resultado = construir_comparativo_turnos(comandas, recibos=[], catalogo=[])

    fila = resultado[0]
    assert fila["cantidad_cuentas"] == 0
    assert fila["ticket_promedio"] == 0.0


def test_pct_participacion_suma_cien():
    recibos = [
        _recibo(date(2026, 9, 1), time(8, 30), "Desayuno", cuenta="a", total=100.0),
        _recibo(date(2026, 9, 1), time(13, 30), "Comida", cuenta="b", total=300.0),
    ]

    resultado = construir_comparativo_turnos(comandas=[], recibos=recibos, catalogo=[])

    assert sum(f["pct_participacion"] for f in resultado) == pytest.approx(100.0, abs=0.1)


def test_turno_solo_en_comandas_no_se_descarta():
    """Un turno con Comandas pero sin Recibos correspondiente sigue apareciendo."""
    comandas = [_comanda(date(2026, 9, 1), time(20, 0), "Cena", 3.0)]

    resultado = construir_comparativo_turnos(comandas, recibos=[], catalogo=[])

    assert len(resultado) == 1
    fila = resultado[0]
    assert fila["turno"] == "Cena"
    assert fila["total_vendido"] == 0.0
    assert fila["piezas_vendidas"] == 3.0


def test_rango_vacio_no_genera_filas():
    assert construir_comparativo_turnos([], [], catalogo=[]) == []


# ── margen_pct (7A) ───────────────────────────────────────────────────────

def test_margen_pct_calculado_con_match_completo():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", 10.0, producto="CAFE")]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]

    resultado = construir_comparativo_turnos(comandas, recibos=[], catalogo=catalogo)

    fila = next(f for f in resultado if f["turno"] == "Comida")
    ingreso = 10.0 * 49.75
    costo = 10.0 * 12.74
    assert fila["margen_pct"] == round((ingreso - costo) / ingreso * 100, 1)


def test_margen_pct_producto_sin_match_no_truena():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", 2.0, producto="PRODUCTO FANTASMA")]

    resultado = construir_comparativo_turnos(comandas, recibos=[], catalogo=[])

    fila = next(f for f in resultado if f["turno"] == "Comida")
    assert fila["margen_pct"] is None
