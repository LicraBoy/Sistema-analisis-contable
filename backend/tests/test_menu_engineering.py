"""
Regresión para services/menu_engineering.py — protege el tab "Ingeniería de
Menú" de "Análisis y Profundidad":

- Cada cuadrante (Estrella/Caballo de Batalla/Rompecabezas/Perro) se asigna
  correctamente combinando el corte de popularidad (mediana de cantidad) y
  el corte de rentabilidad (promedio de margen_pct).
- Un producto sin margen (sin match de catálogo) no se clasifica en un
  cuadrante inventado — va a `sin_clasificar`.
- Con muestra insuficiente, no se clasifica nada.
- Los empates exactos en los cortes son deterministas (>=, no <).
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.menu_engineering import clasificar_menu_engineering
from app.services.ranking_productos import construir_ranking_productos


def _comanda(fecha, hora, turno, producto, cantidad, grupo="BEBIDAS"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta="1",
        estatus="Vendido", grupo=grupo, categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _catalogo(nombre, costo, precio_venta, grupo="BEBIDAS"):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo=grupo, nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo="Bebidas", seccion_menu="Bar", costo=costo, precio_venta=precio_venta,
    )


def test_clasifica_los_4_cuadrantes_por_construccion():
    # Popularidad alta = cantidad >= mediana; rentabilidad alta = margen_pct >= promedio.
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "ESTRELLA", 100.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CABALLO_BATALLA", 90.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "ROMPECABEZAS", 5.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "PERRO", 3.0),
    ]
    catalogo = [
        _catalogo("ESTRELLA", 10.0, 100.0),           # margen 90%
        _catalogo("CABALLO_BATALLA", 80.0, 100.0),    # margen 20%
        _catalogo("ROMPECABEZAS", 10.0, 100.0),       # margen 90%
        _catalogo("PERRO", 80.0, 100.0),               # margen 20%
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = clasificar_menu_engineering(productos)

    por_producto = {p["producto"]: p["cuadrante"] for p in resultado["productos"]}
    assert por_producto["ESTRELLA"] == "estrella"
    assert por_producto["CABALLO_BATALLA"] == "caballo_batalla"
    assert por_producto["ROMPECABEZAS"] == "rompecabezas"
    assert por_producto["PERRO"] == "perro"
    assert resultado["sin_clasificar"] == []


def test_muestra_insuficiente_no_clasifica_nada():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 5.0),
    ]
    catalogo = [_catalogo("A", 10.0, 50.0), _catalogo("B", 10.0, 50.0)]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = clasificar_menu_engineering(productos)

    assert resultado["corte_popularidad"] is None
    assert resultado["corte_margen"] is None
    assert resultado["productos"] == []
    assert len(resultado["sin_clasificar"]) == 2


def test_producto_sin_match_va_a_sin_clasificar_no_a_un_cuadrante():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 20.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "C", 30.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "D", 40.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "FANTASMA", 99.0),
    ]
    catalogo = [
        _catalogo("A", 10.0, 50.0),
        _catalogo("B", 10.0, 50.0),
        _catalogo("C", 10.0, 50.0),
        _catalogo("D", 10.0, 50.0),
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = clasificar_menu_engineering(productos)

    nombres_sin_clasificar = {p["producto"] for p in resultado["sin_clasificar"]}
    assert nombres_sin_clasificar == {"FANTASMA"}
    nombres_clasificados = {p["producto"] for p in resultado["productos"]}
    assert "FANTASMA" not in nombres_clasificados


def test_empate_exacto_en_los_cortes_cae_en_alta_popularidad_y_alta_rentabilidad():
    # Los 4 productos empatan exactamente en cantidad y margen_pct -> todos
    # deben caer en "estrella" (>=, no <), no dividirse arbitrariamente.
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "C", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "D", 10.0),
    ]
    catalogo = [
        _catalogo("A", 50.0, 100.0),
        _catalogo("B", 50.0, 100.0),
        _catalogo("C", 50.0, 100.0),
        _catalogo("D", 50.0, 100.0),
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = clasificar_menu_engineering(productos)

    assert all(p["cuadrante"] == "estrella" for p in resultado["productos"])
