"""
Regresión para services/heatmap_ventas.py — protege el segundo dashboard de
"Análisis y Profundidad":

- Una fila por FECHA exacta y hora, nunca combinada/promediada entre fechas
  del mismo día de la semana (ej. un lunes 7 y un lunes 14 son 2 filas
  separadas, cada una con sus propias piezas).
- Horas fuera de 06:00–23:00 se excluyen.
- Un rango sin comandas no genera celdas.
- `top_productos` incluye todos los productos de esa fecha+hora, sin límite.
"""

from datetime import date, time

from app.models import ComandaEmitidaDetalle
from app.services.heatmap_ventas import construir_heatmap_dia_hora, detectar_picos_venta


def _comanda(fecha, hora, cantidad, producto="CAFE", turno="Comida"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta="1",
        estatus="Vendido", grupo="BEBIDAS", categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def test_heatmap_una_fila_por_fecha_no_combinada_entre_semanas():
    # 2026-09-01 y 2026-09-08 son ambos martes, pero deben quedar separados.
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), 3.0),
        _comanda(date(2026, 9, 8), time(13, 0), 5.0),
    ]

    resultado = construir_heatmap_dia_hora(comandas)

    celda_1 = next(c for c in resultado["celdas"] if c["fecha"] == "2026-09-01" and c["hora"] == 13)
    celda_8 = next(c for c in resultado["celdas"] if c["fecha"] == "2026-09-08" and c["hora"] == 13)
    assert celda_1["piezas"] == 3.0
    assert celda_8["piezas"] == 5.0
    assert celda_1["dia_semana"] == 1
    assert celda_8["dia_semana"] == 1


def test_heatmap_agrega_multiples_lineas_de_la_misma_fecha_y_hora():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), 3.0, producto="CAFE"),
        _comanda(date(2026, 9, 1), time(13, 0), 2.0, producto="TE"),
    ]

    resultado = construir_heatmap_dia_hora(comandas)

    celda = next(c for c in resultado["celdas"] if c["fecha"] == "2026-09-01" and c["hora"] == 13)
    assert celda["piezas"] == 5.0


def test_heatmap_excluye_horas_fuera_de_rango_operativo():
    comandas = [
        _comanda(date(2026, 9, 1), time(3, 0), 5.0),  # madrugada, fuera de 6-23
        _comanda(date(2026, 9, 1), time(13, 0), 2.0),
    ]

    resultado = construir_heatmap_dia_hora(comandas)

    assert not any(c["hora"] == 3 for c in resultado["celdas"])
    assert any(c["hora"] == 13 for c in resultado["celdas"])


def test_heatmap_fechas_con_datos_incluye_fechas_sin_horas_operativas():
    """Una fecha que solo tuvo actividad de madrugada no genera celdas, pero sí cuenta como fecha con datos."""
    comandas = [_comanda(date(2026, 9, 1), time(3, 0), 5.0)]

    resultado = construir_heatmap_dia_hora(comandas)

    assert resultado["celdas"] == []
    assert resultado["fechas_con_datos"] == ["2026-09-01"]


def test_heatmap_sin_comandas_no_genera_celdas():
    resultado = construir_heatmap_dia_hora([])
    assert resultado["celdas"] == []
    assert resultado["fechas_con_datos"] == []


# ── top_productos ─────────────────────────────────────────────────────────

def test_heatmap_top_productos_orden_descendente():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), 2.0, producto="TE"),
        _comanda(date(2026, 9, 1), time(13, 0), 5.0, producto="CAFE"),
    ]

    resultado = construir_heatmap_dia_hora(comandas)

    celda = next(c for c in resultado["celdas"] if c["fecha"] == "2026-09-01" and c["hora"] == 13)
    assert [p["producto"] for p in celda["top_productos"]] == ["CAFE", "TE"]
    assert celda["top_productos"][0]["cantidad"] == 5.0


def test_heatmap_top_productos_incluye_todos_sin_limite():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), 10.0, producto="A"),
        _comanda(date(2026, 9, 1), time(13, 0), 9.0, producto="B"),
        _comanda(date(2026, 9, 1), time(13, 0), 8.0, producto="C"),
        _comanda(date(2026, 9, 1), time(13, 0), 7.0, producto="D"),
    ]

    resultado = construir_heatmap_dia_hora(comandas)

    celda = next(c for c in resultado["celdas"] if c["fecha"] == "2026-09-01" and c["hora"] == 13)
    assert len(celda["top_productos"]) == 4
    assert [p["producto"] for p in celda["top_productos"]] == ["A", "B", "C", "D"]


def test_heatmap_top_productos_empate_orden_alfabetico_deterministico():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), 5.0, producto="ZETA"),
        _comanda(date(2026, 9, 1), time(13, 0), 5.0, producto="ALFA"),
    ]

    resultado = construir_heatmap_dia_hora(comandas)

    celda = next(c for c in resultado["celdas"] if c["fecha"] == "2026-09-01" and c["hora"] == 13)
    assert [p["producto"] for p in celda["top_productos"]] == ["ALFA", "ZETA"]


# ── detectar_picos_venta ─────────────────────────────────────────────────

def _celda(fecha, hora, piezas):
    return {"fecha": fecha, "dia_semana": 0, "hora": hora, "piezas": piezas, "top_productos": []}


def test_detecta_pico_muy_por_encima_del_promedio_de_su_hora():
    celdas = [
        _celda("2026-09-01", 18, 10.0),
        _celda("2026-09-08", 18, 12.0),
        _celda("2026-09-15", 18, 45.0),  # muy por encima del promedio de las otras 2 (11.0)
    ]

    picos = detectar_picos_venta(celdas)

    assert len(picos) == 1
    assert picos[0]["fecha"] == "2026-09-15"
    assert picos[0]["promedio_resto_del_mes"] == 11.0
    assert picos[0]["variacion_pct"] == round((45.0 - 11.0) / 11.0 * 100, 1)


def test_no_marca_pico_sin_suficientes_fechas_de_comparacion():
    """Solo 1 otra fecha para esa hora (se requieren al menos 2) -> no hay base suficiente para comparar."""
    celdas = [
        _celda("2026-09-01", 18, 10.0),
        _celda("2026-09-15", 18, 45.0),
    ]

    picos = detectar_picos_venta(celdas)

    assert picos == []


def test_celdas_parejas_no_generan_picos():
    celdas = [_celda(f"2026-09-{d:02d}", 18, 10.0) for d in (1, 8, 15)]

    picos = detectar_picos_venta(celdas)

    assert picos == []
