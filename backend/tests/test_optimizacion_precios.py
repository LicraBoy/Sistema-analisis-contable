"""
Regresión para services/optimizacion_precios.py — protege la sub-vista
"Optimización de Precios" (rediseñada: análisis de costeo/rentabilidad
sobre TODO el catálogo, no solo "REQ AJUSTE") de Desempeño Comercial:

- Todo producto con match de catálogo aparece (OK y REQ AJUSTE), a
  diferencia de la v1 que filtraba a solo REQ AJUSTE.
- `pct_costo_objetivo` es el mismo valor global en todos los productos y
  niveles de resumen (no existe un objetivo por grupo hoy).
- Subtotal/IVA/incremento potencial se calculan sin IVA (identidad
  subtotal + iva == ingreso bruto).
- `construir_resumen_por_dimension` pondera por volumen, no promedia
  porcentajes simples; `incremento_potencial_estimado` solo suma productos
  "REQ AJUSTE".
- `construir_comparacion_hora_feliz` compara específicamente Hora Feliz
  contra el grupo "CERVEZAS".
- Los hallazgos no truenan sin datos.
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.optimizacion_precios import (
    construir_analisis_costeo_productos,
    construir_comparacion_hora_feliz,
    construir_resumen_por_dimension,
    generar_hallazgos_costeo_productos,
)
from app.services.ranking_productos import construir_ranking_productos

_CONFIG = {"iva_factor": 1.16, "descuento_pct": 0.05, "pct_costo_objetivo": 0.28, "incremento_default": 0.03}


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


def test_productos_ok_y_req_ajuste_aparecen_ambos():
    # CARO: pct_costo = 40/(100/1.16) = 46.4% -> REQ AJUSTE
    # BARATO: pct_costo = 20/(100/1.16) = 23.2% -> OK
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CARO", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "BARATO", 10.0),
    ]
    catalogo = [_catalogo("CARO", 40.0, 100.0), _catalogo("BARATO", 20.0, 100.0)]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})

    estados = {f["producto"]: f["estado"] for f in resultado}
    assert estados == {"CARO": "REQ AJUSTE", "BARATO": "OK"}


def test_producto_con_precio_venta_cero_no_truena_ni_aparece():
    # calcular_costeo trata precio_venta == 0 igual que None (todos los
    # campos calculados en None, incluido precio_sugerido) — el filtro de
    # entrada debe descartar este caso, no solo costo/precio_venta is None
    # (bug real: producía un TypeError al multiplicar cantidad * None).
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "GRATIS", 10.0)]
    catalogo = [_catalogo("GRATIS", 0.0, 0.0)]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})

    assert resultado == []


def test_producto_sin_match_de_catalogo_no_truena_ni_aparece():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "FANTASMA", 10.0)]

    resultado = construir_analisis_costeo_productos(
        construir_ranking_productos(comandas, catalogo=[]), {}, _CONFIG, {}
    )

    assert resultado == []


def test_pct_costo_objetivo_es_el_mismo_global_en_todos_lados():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CARO", 10.0, grupo="BUFFET"),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "BARATO", 5.0, grupo="POSTRES"),
    ]
    catalogo = [_catalogo("CARO", 40.0, 100.0, grupo="BUFFET"), _catalogo("BARATO", 20.0, 100.0, grupo="POSTRES")]
    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})

    assert all(f["pct_costo_objetivo"] == 28.0 for f in analisis)

    resumen = construir_resumen_por_dimension(analisis, "grupo", _CONFIG["pct_costo_objetivo"])
    assert all(r["pct_costo_objetivo"] == 28.0 for r in resumen)


def test_subtotal_mas_iva_reconstruye_ingreso_bruto_y_no_usa_iva():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CARO", 10.0)]
    catalogo = [_catalogo("CARO", 40.0, 100.0)]
    productos = construir_ranking_productos(comandas, catalogo)

    fila = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})[0]

    ingreso_bruto = 10.0 * 100.0
    assert round(fila["subtotal_actual"] + fila["iva_actual"], 2) == round(ingreso_bruto, 2)
    assert fila["incremento_potencial"] == round(fila["subtotal_potencial"] - fila["subtotal_actual"], 2)


def test_resumen_por_dimension_pondera_por_volumen_no_promedio_simple():
    # Producto A: 90 piezas, costo alto (46.4%). Producto B: 1 pieza, costo bajo (23.2%).
    # Un promedio simple daría (46.4+23.2)/2=34.8%; el ponderado por volumen
    # debe quedar mucho más cerca del 46.4% de A, que domina el subtotal.
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 90.0, grupo="BUFFET"),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 1.0, grupo="BUFFET"),
    ]
    catalogo = [_catalogo("A", 40.0, 100.0, grupo="BUFFET"), _catalogo("B", 20.0, 100.0, grupo="BUFFET")]
    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})

    resumen = construir_resumen_por_dimension(analisis, "grupo", _CONFIG["pct_costo_objetivo"])

    assert len(resumen) == 1
    assert resumen[0]["pct_costo_promedio"] > 40.0
    assert resumen[0]["pct_costo_promedio"] != 34.8


def test_incremento_potencial_estimado_solo_suma_req_ajuste():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CARO", 10.0, grupo="BUFFET"),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "BARATO", 10.0, grupo="BUFFET"),
    ]
    catalogo = [_catalogo("CARO", 40.0, 100.0, grupo="BUFFET"), _catalogo("BARATO", 20.0, 100.0, grupo="BUFFET")]
    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})

    resumen = construir_resumen_por_dimension(analisis, "grupo", _CONFIG["pct_costo_objetivo"])

    caro = next(f for f in analisis if f["producto"] == "CARO")
    assert resumen[0]["incremento_potencial_estimado"] == caro["incremento_potencial"]


def test_comparacion_hora_feliz_contra_cervezas_exclusivamente():
    comandas = [
        _comanda(date(2026, 9, 1), time(18, 0), "Cena", "HF CERV", 20.0, grupo="HORA FELIZ CERVEZAS"),
        _comanda(date(2026, 9, 1), time(18, 0), "Cena", "CERVEZA NORMAL", 20.0, grupo="CERVEZAS"),
        _comanda(date(2026, 9, 1), time(18, 0), "Cena", "VINO", 20.0, grupo="VINOS"),
    ]
    catalogo = [
        _catalogo("HF CERV", 40.0, 100.0, grupo="HORA FELIZ CERVEZAS"),
        _catalogo("CERVEZA NORMAL", 20.0, 100.0, grupo="CERVEZAS"),
        _catalogo("VINO", 20.0, 100.0, grupo="VINOS"),
    ]
    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})

    comparacion = construir_comparacion_hora_feliz(analisis)

    assert comparacion["pct_costo_promedio_hora_feliz"] == 46.4
    assert comparacion["pct_costo_promedio_cervezas"] == 23.2
    assert comparacion["diferencia_margen"] == round((100 - 46.4) - (100 - 23.2), 1)


def test_comparacion_hora_feliz_sin_datos_de_un_lado_da_none():
    comandas = [_comanda(date(2026, 9, 1), time(18, 0), "Cena", "HF CERV", 20.0, grupo="HORA FELIZ CERVEZAS")]
    catalogo = [_catalogo("HF CERV", 40.0, 100.0, grupo="HORA FELIZ CERVEZAS")]
    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})

    comparacion = construir_comparacion_hora_feliz(analisis)

    assert comparacion["pct_costo_promedio_cervezas"] is None
    assert comparacion["margen_pct_cervezas"] is None
    assert comparacion["diferencia_margen"] is None


# ── generar_hallazgos_costeo_productos ──────────────────────────────────────

def test_hallazgos_vacio_sin_productos_req_ajuste():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "BARATO", 10.0)]
    catalogo = [_catalogo("BARATO", 20.0, 100.0)]
    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})
    resumen_grupos = construir_resumen_por_dimension(analisis, "grupo", _CONFIG["pct_costo_objetivo"])
    resumen_secciones = construir_resumen_por_dimension(analisis, "seccion_menu", _CONFIG["pct_costo_objetivo"])
    comparacion = construir_comparacion_hora_feliz(analisis)

    assert generar_hallazgos_costeo_productos(analisis, resumen_grupos, resumen_secciones, comparacion) == []


def test_hallazgos_genera_tipos_esperados_con_datos():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CARO1", 50.0, grupo="BUFFET"),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CARO2", 5.0, grupo="POSTRES"),
        _comanda(date(2026, 9, 1), time(18, 0), "Cena", "HF CERV", 20.0, grupo="HORA FELIZ CERVEZAS"),
        _comanda(date(2026, 9, 1), time(18, 0), "Cena", "CERVEZA NORMAL", 20.0, grupo="CERVEZAS"),
    ]
    catalogo = [
        _catalogo("CARO1", 40.0, 100.0, grupo="BUFFET"),
        _catalogo("CARO2", 40.0, 100.0, grupo="POSTRES"),
        _catalogo("HF CERV", 40.0, 100.0, grupo="HORA FELIZ CERVEZAS"),
        _catalogo("CERVEZA NORMAL", 20.0, 100.0, grupo="CERVEZAS"),
    ]
    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, {}, _CONFIG, {})
    resumen_grupos = construir_resumen_por_dimension(analisis, "grupo", _CONFIG["pct_costo_objetivo"])
    resumen_secciones = construir_resumen_por_dimension(analisis, "seccion_menu", _CONFIG["pct_costo_objetivo"])
    comparacion = construir_comparacion_hora_feliz(analisis)

    resultado = generar_hallazgos_costeo_productos(analisis, resumen_grupos, resumen_secciones, comparacion)

    tipos = {h["tipo"] for h in resultado}
    assert "grupo_mayor_desviacion" in tipos
    assert "grupo_mayor_concentracion" in tipos
    assert "hora_feliz_utilidad_no_capturada" in tipos
    assert "concentracion_productos" in tipos
    assert any("BUFFET" in h["mensaje"] for h in resultado)
