"""
Regresión para services/desempeno_comercial.py — protege la nueva pestaña
"Desempeño Comercial" de "Análisis y Profundidad":

- Comparaciones de KPI no truenan con anterior en 0 (variacion_pct None).
- Productos comparados: separación correcta entre comparados/nuevos, y los
  productos descontinuados (en anterior pero no en actual) sí aparecen como
  perdedores en vez de perderse.
- Comparativo por dimensión (grupo/categoría/sección) genérico funciona con
  cualquier clave.
- Hallazgos automáticos no truenan con datos insuficientes.
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.desempeno_comercial import (
    _comparacion_kpi,
    construir_comparativo_dimension,
    construir_productos_comparados,
    construir_top_ganadores_perdedores,
    construir_top_impulsores_rapidos,
    generar_hallazgos_desempeno,
)
from app.services.ranking_productos import construir_ranking_grupos, construir_ranking_productos


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


# ── _comparacion_kpi ───────────────────────────────────────────────────────

def test_comparacion_kpi_calcula_diferencia_y_variacion():
    resultado = _comparacion_kpi(150.0, 100.0)
    assert resultado == {"actual": 150.0, "anterior": 100.0, "diferencia": 50.0, "variacion_pct": 50.0}


def test_comparacion_kpi_anterior_en_cero_no_truena():
    resultado = _comparacion_kpi(100.0, 0.0)
    assert resultado["variacion_pct"] is None
    assert resultado["diferencia"] == 100.0


# ── construir_productos_comparados ──────────────────────────────────────────

def test_producto_en_ambos_periodos_calcula_contribucion():
    comandas_actual = [_comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 15.0)]
    comandas_anterior = [_comanda(date(2026, 8, 10), time(13, 0), "Comida", "CAFE", 10.0)]
    catalogo = [_catalogo("CAFE", 10.0, 50.0)]

    actual = construir_ranking_productos(comandas_actual, catalogo)
    anterior = construir_ranking_productos(comandas_anterior, catalogo)

    resultado = construir_productos_comparados(actual, anterior)

    assert resultado["nuevos"] == []
    fila = resultado["comparados"][0]
    assert fila["producto"] == "CAFE"
    assert fila["contribucion"] == round(15.0 * 50.0 - 10.0 * 50.0, 2)


def test_producto_solo_en_actual_va_a_nuevos_no_a_comparados():
    comandas_actual = [_comanda(date(2026, 9, 10), time(13, 0), "Comida", "NUEVO", 5.0)]
    catalogo = [_catalogo("NUEVO", 10.0, 50.0)]

    actual = construir_ranking_productos(comandas_actual, catalogo)

    resultado = construir_productos_comparados(actual, productos_anterior=[])

    assert resultado["comparados"] == []
    assert len(resultado["nuevos"]) == 1
    assert resultado["nuevos"][0]["producto"] == "NUEVO"


def test_producto_descontinuado_aparece_como_perdedor_no_se_pierde():
    comandas_anterior = [_comanda(date(2026, 8, 10), time(13, 0), "Comida", "DESCONTINUADO", 10.0)]
    catalogo = [_catalogo("DESCONTINUADO", 10.0, 50.0)]

    anterior = construir_ranking_productos(comandas_anterior, catalogo)

    resultado = construir_productos_comparados(productos_actual=[], productos_anterior=anterior)

    assert resultado["nuevos"] == []
    fila = resultado["comparados"][0]
    assert fila["producto"] == "DESCONTINUADO"
    assert fila["ingreso_actual"] == 0.0
    assert fila["contribucion"] < 0


# ── construir_top_impulsores_rapidos / construir_top_ganadores_perdedores ──

def test_top_impulsores_separa_positivos_y_negativos_ordenados():
    comparados = [
        {"producto": "SUBE_MUCHO", "ingreso_actual": 200.0, "ingreso_anterior": 100.0, "contribucion": 100.0, "contribucion_pct": 100.0},
        {"producto": "SUBE_POCO", "ingreso_actual": 110.0, "ingreso_anterior": 100.0, "contribucion": 10.0, "contribucion_pct": 10.0},
        {"producto": "BAJA_MUCHO", "ingreso_actual": 0.0, "ingreso_anterior": 100.0, "contribucion": -100.0, "contribucion_pct": -100.0},
    ]

    resultado = construir_top_impulsores_rapidos(comparados)

    assert [p["producto"] for p in resultado["positivos"]] == ["SUBE_MUCHO", "SUBE_POCO"]
    assert [p["producto"] for p in resultado["negativos"]] == ["BAJA_MUCHO"]


def test_top_ganadores_perdedores_mismo_criterio_mas_filas():
    comparados = [
        {"producto": f"G{i}", "ingreso_actual": 100.0 + i, "ingreso_anterior": 100.0, "contribucion": float(i), "contribucion_pct": None}
        for i in range(1, 8)
    ]

    resultado = construir_top_ganadores_perdedores(comparados)

    assert len(resultado["ganadores"]) == 5
    assert resultado["perdedores"] == []


# ── construir_comparativo_dimension ─────────────────────────────────────────

def test_comparativo_dimension_grupo_nuevo_da_variacion_none():
    grupos_actual = [{"grupo": "NUEVO_GRUPO", "cantidad": 5.0, "ingreso_total": 200.0, "margen_pct": 50.0, "pct_participacion": 100.0}]

    resultado = construir_comparativo_dimension(grupos_actual, anterior=[], clave="grupo")

    assert resultado[0]["variacion_pct"] is None
    assert resultado[0]["ingreso_anterior"] == 0.0


def test_comparativo_dimension_calcula_diferencia_correcta():
    actual = [{"grupo": "BEBIDAS", "cantidad": 10.0, "ingreso_total": 150.0, "margen_pct": 50.0, "pct_participacion": 100.0}]
    anterior = [{"grupo": "BEBIDAS", "cantidad": 8.0, "ingreso_total": 100.0, "margen_pct": 50.0, "pct_participacion": 100.0}]

    resultado = construir_comparativo_dimension(actual, anterior, clave="grupo")

    assert resultado[0]["diferencia"] == 50.0
    assert resultado[0]["variacion_pct"] == 50.0


def test_comparativo_dimension_funciona_con_clave_etiqueta():
    """Mismo generico, usado también para categoria_tipo/seccion_menu (mix_ventas.py usa 'etiqueta')."""
    actual = [{"etiqueta": "Alimentos", "cantidad": 10.0, "ingreso_total": 150.0, "margen_pct": 50.0, "pct_participacion": 100.0}]

    resultado = construir_comparativo_dimension(actual, anterior=[], clave="etiqueta")

    assert resultado[0]["etiqueta"] == "Alimentos"


# ── generar_hallazgos_desempeno ─────────────────────────────────────────────

def test_hallazgos_genera_los_tipos_esperados_con_datos_claros():
    grupos_comparados = [
        {"grupo": "HAMBURGUESAS", "ingreso_actual": 300.0, "ingreso_anterior": 100.0, "diferencia": 200.0, "variacion_pct": 200.0, "pct_participacion": 60.0},
        {"grupo": "CAFE", "ingreso_actual": 50.0, "ingreso_anterior": 50.0, "diferencia": 0.0, "variacion_pct": 0.0, "pct_participacion": 10.0},
    ]
    seccion_comparada = [
        {"etiqueta": "Bar", "ingreso_actual": 88.0, "ingreso_anterior": 100.0, "diferencia": -12.0, "variacion_pct": -12.0, "pct_participacion": 20.0},
    ]
    top_ganadores = [{"producto": "CHILAQUILES", "ingreso_actual": 200.0, "ingreso_anterior": 50.0, "contribucion": 150.0, "contribucion_pct": 300.0}]
    top_perdedores = [{"producto": "CLUB SANDWICH", "ingreso_actual": 10.0, "ingreso_anterior": 100.0, "contribucion": -90.0, "contribucion_pct": -90.0}]

    resultado = generar_hallazgos_desempeno(grupos_comparados, seccion_comparada, top_ganadores, top_perdedores, top5_pct_productos=58.0)

    tipos = {h["tipo"] for h in resultado}
    assert tipos == {"grupo_impulsor", "seccion_impulsora", "producto_top", "producto_caida", "concentracion"}
    assert any("HAMBURGUESAS" in h["mensaje"] for h in resultado)
    assert any("Bar" in h["mensaje"] and "12" in h["mensaje"] for h in resultado)


def test_hallazgos_con_datos_insuficientes_no_truena():
    resultado = generar_hallazgos_desempeno(
        grupos_comparados=[], seccion_comparada=[], top_ganadores=[], top_perdedores=[], top5_pct_productos=None
    )

    assert resultado == []


def test_construir_ranking_grupos_reusado_directamente_sin_cambios():
    """Confirma que este módulo no necesita tocar construir_ranking_grupos — solo lo consume."""
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 5.0)]
    catalogo = [_catalogo("CAFE", 10.0, 50.0)]
    productos = construir_ranking_productos(comandas, catalogo)

    grupos = construir_ranking_grupos(productos)

    assert grupos[0]["grupo"] == "BEBIDAS"
