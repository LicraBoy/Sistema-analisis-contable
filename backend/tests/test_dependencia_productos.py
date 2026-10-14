"""
Regresión para services/dependencia_productos.py — protege el tab
"Dependencia de Productos" de "Análisis y Profundidad":

- pct_individual/pct_acumulado se calculan correctamente por rank.
- Con menos de 5 productos con ingreso, la tabla queda vacía (no una tabla
  trivial al 100%).
- Un producto sin ingreso (sin match de catálogo) se excluye del cálculo.
- Empates en ingreso_total tienen un orden determinista.
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.dependencia_productos import construir_tabla_dependencia
from app.services.ranking_productos import construir_ranking_productos


def _comanda(fecha, hora, turno, producto, cantidad, grupo="BEBIDAS"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta="1",
        estatus="Vendido", grupo=grupo, categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _catalogo(nombre, costo, precio_venta):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo="BEBIDAS", nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo="Bebidas", seccion_menu="Bar", costo=costo, precio_venta=precio_venta,
    )


def _productos_con_ingresos(ingresos: dict[str, float]) -> list[dict]:
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", nombre, 1.0) for nombre in ingresos]
    catalogo = [_catalogo(nombre, 0.0, ingreso) for nombre, ingreso in ingresos.items()]
    return construir_ranking_productos(comandas, catalogo)


def test_pct_individual_y_acumulado_exactos_por_rank():
    productos = _productos_con_ingresos({"A": 500.0, "B": 200.0, "C": 150.0, "D": 100.0, "E": 50.0})

    resultado = construir_tabla_dependencia(productos)

    filas = resultado["filas"]
    assert [f["producto"] for f in filas] == ["A", "B", "C", "D", "E"]
    assert filas[0]["pct_individual"] == 50.0
    assert filas[0]["pct_acumulado"] == 50.0
    assert filas[1]["pct_acumulado"] == 70.0
    assert resultado["top5_pct"] == 100.0
    assert resultado["top10_pct"] is None


def test_menos_de_5_productos_con_ingreso_tabla_vacia():
    productos = _productos_con_ingresos({"A": 500.0, "B": 200.0, "C": 100.0})

    resultado = construir_tabla_dependencia(productos)

    assert resultado["filas"] == []
    assert resultado["top5_pct"] is None
    assert resultado["top10_pct"] is None


def test_producto_sin_ingreso_excluido_no_distorsiona_porcentajes():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 1.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 1.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "C", 1.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "D", 1.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "E", 1.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "FANTASMA", 99.0),
    ]
    catalogo = [
        _catalogo("A", 0.0, 500.0), _catalogo("B", 0.0, 200.0), _catalogo("C", 0.0, 150.0),
        _catalogo("D", 0.0, 100.0), _catalogo("E", 0.0, 50.0),
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_tabla_dependencia(productos)

    nombres = [f["producto"] for f in resultado["filas"]]
    assert "FANTASMA" not in nombres
    assert resultado["top5_pct"] == 100.0


def test_empate_en_ingreso_total_orden_deterministico_alfabetico():
    productos = _productos_con_ingresos({"ZETA": 100.0, "ALFA": 100.0, "BETA": 200.0, "GAMA": 50.0, "DELTA": 30.0})

    resultado = construir_tabla_dependencia(productos)

    empatados = [f["producto"] for f in resultado["filas"] if f["ingreso_total"] == 100.0]
    assert empatados == ["ALFA", "ZETA"]
