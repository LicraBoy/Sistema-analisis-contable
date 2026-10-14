"""
Regresión para services/mix_ventas.py — protege el tab "Mix de Ventas" de
"Análisis y Profundidad" (dimensiones categoria_tipo/seccion_menu; grupo y
turno se prueban en test_ranking_productos.py y test_panel_turnos.py):

- La cantidad/ingreso se agregan correctamente por categoria_tipo.
- Un producto sin match de catálogo cae en "Sin Clasificar", no rompe margen.
- Un rango sin comandas no genera filas.
- pct_participacion suma 100% entre todas las filas.
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.mix_ventas import construir_mix_categoria_tipo, construir_mix_seccion_menu


def _comanda(fecha, hora, turno, producto, cantidad, grupo="BEBIDAS"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta="1",
        estatus="Vendido", grupo=grupo, categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _catalogo(nombre, costo, precio_venta, categoria_tipo="Bebidas", seccion_menu="Bar"):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo="BEBIDAS", nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo=categoria_tipo, seccion_menu=seccion_menu, costo=costo, precio_venta=precio_venta,
    )


def test_mix_categoria_tipo_agrega_por_categoria():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "TACO", 5.0),
    ]
    catalogo = [
        _catalogo("CAFE", 10.0, 50.0, categoria_tipo="Bebidas"),
        _catalogo("TACO", 20.0, 80.0, categoria_tipo="Alimentos"),
    ]

    resultado = construir_mix_categoria_tipo(comandas, catalogo)

    por_categoria = {f["etiqueta"]: f for f in resultado}
    assert por_categoria["Bebidas"]["cantidad"] == 10.0
    assert por_categoria["Bebidas"]["ingreso_total"] == round(10.0 * 50.0, 2)
    assert por_categoria["Alimentos"]["cantidad"] == 5.0
    assert por_categoria["Alimentos"]["ingreso_total"] == round(5.0 * 80.0, 2)


def test_mix_producto_sin_match_cae_en_sin_clasificar():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "FANTASMA", 3.0),
    ]
    catalogo = [_catalogo("CAFE", 10.0, 50.0)]

    resultado = construir_mix_categoria_tipo(comandas, catalogo)

    por_categoria = {f["etiqueta"]: f for f in resultado}
    assert "Sin Clasificar" in por_categoria
    assert por_categoria["Sin Clasificar"]["cantidad"] == 3.0
    assert por_categoria["Sin Clasificar"]["ingreso_total"] == 0.0
    assert por_categoria["Sin Clasificar"]["margen_pct"] is None


def test_mix_rango_vacio_no_genera_filas():
    assert construir_mix_categoria_tipo([], []) == []
    assert construir_mix_seccion_menu([], []) == []


def test_mix_pct_participacion_suma_100():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "TACO", 5.0),
    ]
    catalogo = [
        _catalogo("CAFE", 10.0, 50.0, categoria_tipo="Bebidas"),
        _catalogo("TACO", 20.0, 80.0, categoria_tipo="Alimentos"),
    ]

    resultado = construir_mix_categoria_tipo(comandas, catalogo)

    assert round(sum(f["pct_participacion"] for f in resultado), 1) == 100.0
