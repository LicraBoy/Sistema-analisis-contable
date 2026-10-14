"""
Regresión para services/api de ranking_productos.py — protege el tercer
dashboard de "Análisis y Profundidad":

- La cantidad se agrega correctamente entre varias filas/turnos del mismo
  producto.
- margen_pct/ingreso_total se calculan contra el Catálogo (nunca inventados).
- Un producto sin match en el catálogo no truena y queda marcado, no oculto.
- Un rango sin comandas no genera filas.
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.ranking_productos import (
    agregar_variacion_periodo_anterior,
    agregar_variacion_periodo_anterior_grupos,
    construir_ranking_grupos,
    construir_ranking_productos,
)


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


def test_ranking_agrega_cantidad_entre_turnos():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CERVEZA CORONA 1/2", 3.0),
        _comanda(date(2026, 9, 1), time(20, 0), "Cena", "CERVEZA CORONA 1/2", 8.0),
    ]
    catalogo = [_catalogo("CERVEZA CORONA 1/2", 12.83, 65.0)]

    resultado = construir_ranking_productos(comandas, catalogo)

    assert len(resultado) == 1
    assert resultado[0]["cantidad"] == 11.0


def test_ranking_margen_e_ingreso_desde_catalogo():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]

    resultado = construir_ranking_productos(comandas, catalogo)

    fila = resultado[0]
    assert fila["margen_pct"] == round((49.75 - 12.74) / 49.75 * 100, 1)
    assert fila["ingreso_total"] == round(10.0 * 49.75, 2)


def test_ranking_producto_sin_match_no_truena_y_no_se_oculta():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "PRODUCTO FANTASMA", 2.0)]

    resultado = construir_ranking_productos(comandas, catalogo=[])

    assert len(resultado) == 1
    fila = resultado[0]
    assert fila["producto_catalogo_encontrado"] is False
    assert fila["costo"] is None
    assert fila["precio_venta"] is None
    assert fila["margen_pct"] is None
    assert fila["ingreso_total"] == 0.0
    assert fila["categoria_tipo"] is None
    assert fila["seccion_menu"] is None


def test_ranking_categoria_y_seccion_vienen_del_catalogo_con_match():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 5.0)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]

    resultado = construir_ranking_productos(comandas, catalogo)

    fila = resultado[0]
    assert fila["categoria_tipo"] == "Bebidas"
    assert fila["seccion_menu"] == "Bar"


def test_ranking_rango_vacio_no_genera_filas():
    assert construir_ranking_productos([], catalogo=[]) == []


# ── construir_ranking_grupos ─────────────────────────────────────────────

def test_grupos_agrega_cantidad_e_ingreso_del_mismo_grupo():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CERVEZA CORONA 1/2", 2.0, grupo="BEBIDAS"),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0, grupo="BEBIDAS"),
    ]
    catalogo = [
        _catalogo("CERVEZA CORONA 1/2", 12.83, 65.0),
        _catalogo("CAFE", 12.74, 49.75),
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_ranking_grupos(productos)

    assert len(resultado) == 1
    fila = resultado[0]
    assert fila["grupo"] == "BEBIDAS"
    assert fila["cantidad"] == 12.0
    assert fila["ingreso_total"] == round(2.0 * 65.0 + 10.0 * 49.75, 2)


def test_grupos_margen_pct_correcto_con_match_completo():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_ranking_grupos(productos)

    fila = resultado[0]
    ingreso_total = 10.0 * 49.75
    costo_total = 10.0 * 12.74
    assert fila["margen_pct"] == round((ingreso_total - costo_total) / ingreso_total * 100, 1)


def test_grupos_producto_sin_match_no_rompe_margen_del_grupo():
    """Un producto sin match aporta cantidad/ingreso (0.0) pero no costo — el grupo no truena."""
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0, grupo="BEBIDAS"),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "PRODUCTO FANTASMA", 3.0, grupo="BEBIDAS"),
    ]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_ranking_grupos(productos)

    fila = resultado[0]
    assert fila["cantidad"] == 13.0  # 10 + 3, aunque el fantasma no tenga match
    assert fila["ingreso_total"] == round(10.0 * 49.75, 2)  # el fantasma aporta 0.0


def test_grupos_none_cae_en_sin_grupo():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 5.0, grupo=None)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75, grupo=None)]
    productos = construir_ranking_productos(comandas, catalogo)
    productos[0]["grupo"] = None  # forzar el caso sin grupo, incluso si el catálogo no lo asigna

    resultado = construir_ranking_grupos(productos)

    assert resultado[0]["grupo"] == "Sin Grupo"


def test_grupos_lista_vacia_no_genera_filas():
    assert construir_ranking_grupos([]) == []


# ── agregar_variacion_periodo_anterior (7B) ──────────────────────────────

def test_variacion_pct_producto_presente_en_ambos_periodos():
    comandas_actual = [_comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 15.0)]
    comandas_anterior = [_comanda(date(2026, 9, 3), time(13, 0), "Comida", "CAFE", 10.0)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]

    actual = construir_ranking_productos(comandas_actual, catalogo)
    anterior = construir_ranking_productos(comandas_anterior, catalogo)

    resultado = agregar_variacion_periodo_anterior(actual, anterior)

    fila = resultado[0]
    assert fila["cantidad_periodo_anterior"] == 10.0
    assert fila["variacion_pct_cantidad"] == 50.0


def test_variacion_pct_producto_nuevo_no_truena_y_queda_none():
    """Un producto sin venta en el periodo anterior no es '-100%', es None (no confundir con declive)."""
    comandas_actual = [_comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 5.0)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]

    actual = construir_ranking_productos(comandas_actual, catalogo)
    resultado = agregar_variacion_periodo_anterior(actual, productos_periodo_anterior=[])

    fila = resultado[0]
    assert fila["cantidad_periodo_anterior"] == 0.0
    assert fila["variacion_pct_cantidad"] is None


def test_variacion_pct_producto_desaparecido_no_aparece_en_actual():
    """Un producto que se vendía antes pero no en el rango actual simplemente no está en `productos` (por diseño)."""
    comandas_anterior = [_comanda(date(2026, 9, 3), time(13, 0), "Comida", "CAFE", 10.0)]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]

    anterior = construir_ranking_productos(comandas_anterior, catalogo)
    resultado = agregar_variacion_periodo_anterior([], anterior)

    assert resultado == []


# ── construir_ranking_grupos: pct_participacion ─────────────────────────

def test_grupos_pct_participacion_un_solo_grupo_es_100():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 5.0, grupo="BEBIDAS")]
    catalogo = [_catalogo("CAFE", 12.74, 49.75)]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_ranking_grupos(productos)

    assert resultado[0]["pct_participacion"] == 100.0


def test_grupos_pct_participacion_varios_grupos_suman_100():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 10.0, grupo="BEBIDAS"),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "TACO", 5.0, grupo="COMIDA"),
    ]
    catalogo = [
        _catalogo("CAFE", 12.74, 49.75, grupo="BEBIDAS"),
        _catalogo("TACO", 20.0, 80.0, grupo="COMIDA"),
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_ranking_grupos(productos)

    assert round(sum(g["pct_participacion"] for g in resultado), 1) == 100.0


# ── agregar_variacion_periodo_anterior_grupos ────────────────────────────

def test_variacion_pct_grupo_presente_en_ambos_periodos():
    comandas_actual = [_comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 15.0, grupo="BEBIDAS")]
    comandas_anterior = [_comanda(date(2026, 9, 3), time(13, 0), "Comida", "CAFE", 10.0, grupo="BEBIDAS")]
    catalogo = [_catalogo("CAFE", 12.74, 49.75, grupo="BEBIDAS")]

    grupos_actual = construir_ranking_grupos(construir_ranking_productos(comandas_actual, catalogo))
    grupos_anterior = construir_ranking_grupos(construir_ranking_productos(comandas_anterior, catalogo))

    resultado = agregar_variacion_periodo_anterior_grupos(grupos_actual, grupos_anterior)

    fila = resultado[0]
    ingreso_actual = 15.0 * 49.75
    ingreso_anterior = 10.0 * 49.75
    assert fila["ingreso_total_periodo_anterior"] == round(ingreso_anterior, 2)
    assert fila["variacion_pct_ingreso"] == round((ingreso_actual - ingreso_anterior) / ingreso_anterior * 100, 1)


def test_variacion_pct_grupo_nuevo_no_truena_y_queda_none():
    comandas_actual = [_comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 5.0, grupo="BEBIDAS")]
    catalogo = [_catalogo("CAFE", 12.74, 49.75, grupo="BEBIDAS")]

    grupos_actual = construir_ranking_grupos(construir_ranking_productos(comandas_actual, catalogo))
    resultado = agregar_variacion_periodo_anterior_grupos(grupos_actual, grupos_periodo_anterior=[])

    fila = resultado[0]
    assert fila["ingreso_total_periodo_anterior"] == 0.0
    assert fila["variacion_pct_ingreso"] is None
