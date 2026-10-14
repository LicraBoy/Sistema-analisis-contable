"""
Regresión para services/alertas_riesgo.py — protege el tab "Alertas de
Riesgo" de "Análisis y Profundidad":

- "Producto en declive" delega en oportunidades_comerciales (mismo umbral,
  sin duplicar lógica).
- "Grupo con tendencia negativa" respeta el mismo umbral -30% y no genera
  una alerta falsa para un grupo nuevo (sin dato en el periodo anterior).
- "Incremento de cortesías" no truena con periodo anterior en cero y solo
  alerta con un incremento real >= 30%.
- "Disminución de margen" no fabrica una caída para un producto nuevo sin
  margen anterior.
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.alertas_riesgo import agregar_variacion_margen, detectar_alertas_riesgo
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


def _resumen_cortesias(total_monto=0.0, total_cantidad=0):
    return {"total_monto_cortesia": total_monto, "total_cantidad_cortesia": total_cantidad, "productos": []}


def test_producto_en_declive_delega_en_oportunidades():
    comandas_actual = [_comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 3.0)]
    comandas_anterior = [_comanda(date(2026, 9, 3), time(13, 0), "Comida", "CAFE", 10.0)]
    catalogo = [_catalogo("CAFE", 10.0, 50.0)]

    productos = agregar_variacion_periodo_anterior(
        construir_ranking_productos(comandas_actual, catalogo),
        construir_ranking_productos(comandas_anterior, catalogo),
    )
    productos = agregar_variacion_margen(productos, construir_ranking_productos(comandas_anterior, catalogo))

    alertas = detectar_alertas_riesgo(productos, [], _resumen_cortesias(), _resumen_cortesias())

    assert any(a["tipo"] == "producto_en_declive" and "CAFE" in a["mensaje"] for a in alertas)


def test_grupo_tendencia_negativa_y_grupo_nuevo_sin_falsa_alerta():
    comandas_actual = [
        _comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 3.0, grupo="BEBIDAS"),
        _comanda(date(2026, 9, 10), time(13, 0), "Comida", "TACO_NUEVO", 5.0, grupo="COMIDA_NUEVA"),
    ]
    comandas_anterior = [_comanda(date(2026, 9, 3), time(13, 0), "Comida", "CAFE", 10.0, grupo="BEBIDAS")]
    catalogo = [
        _catalogo("CAFE", 10.0, 50.0, grupo="BEBIDAS"),
        _catalogo("TACO_NUEVO", 20.0, 80.0, grupo="COMIDA_NUEVA"),
    ]

    grupos_actual = construir_ranking_grupos(construir_ranking_productos(comandas_actual, catalogo))
    grupos_anterior = construir_ranking_grupos(construir_ranking_productos(comandas_anterior, catalogo))
    grupos_con_variacion = agregar_variacion_periodo_anterior_grupos(grupos_actual, grupos_anterior)

    alertas = detectar_alertas_riesgo([], grupos_con_variacion, _resumen_cortesias(), _resumen_cortesias())

    tipos_bebidas = [a for a in alertas if a["tipo"] == "grupo_tendencia_negativa" and "BEBIDAS" in a["mensaje"]]
    assert len(tipos_bebidas) == 1
    assert not any("COMIDA_NUEVA" in a["mensaje"] for a in alertas)


def test_incremento_cortesias_sin_periodo_anterior_no_truena():
    alertas = detectar_alertas_riesgo([], [], _resumen_cortesias(total_monto=100.0), _resumen_cortesias(total_monto=0.0))

    assert not any(a["tipo"] == "incremento_cortesias" for a in alertas)


def test_incremento_cortesias_real_genera_alerta():
    alertas = detectar_alertas_riesgo(
        [], [], _resumen_cortesias(total_monto=150.0), _resumen_cortesias(total_monto=100.0)
    )

    assert any(a["tipo"] == "incremento_cortesias" and a["severidad"] == "media" for a in alertas)


def test_disminucion_margen_detecta_caida_y_no_fabrica_para_producto_nuevo():
    comandas_actual = [
        _comanda(date(2026, 9, 10), time(13, 0), "Comida", "MARGEN_BAJA", 5.0),
        _comanda(date(2026, 9, 10), time(13, 0), "Comida", "NUEVO", 5.0),
    ]
    comandas_anterior = [_comanda(date(2026, 9, 3), time(13, 0), "Comida", "MARGEN_BAJA", 5.0)]
    catalogo_actual = [
        _catalogo("MARGEN_BAJA", 40.0, 100.0),  # margen 60%
        _catalogo("NUEVO", 50.0, 100.0),
    ]
    catalogo_anterior = [_catalogo("MARGEN_BAJA", 10.0, 100.0)]  # margen 90% antes -> cayó 30 puntos

    productos_actual = construir_ranking_productos(comandas_actual, catalogo_actual)
    productos_anterior = construir_ranking_productos(comandas_anterior, catalogo_anterior)
    productos = agregar_variacion_periodo_anterior(productos_actual, productos_anterior)
    productos = agregar_variacion_margen(productos, productos_anterior)

    alertas = detectar_alertas_riesgo(productos, [], _resumen_cortesias(), _resumen_cortesias())

    disminucion = [a for a in alertas if a["tipo"] == "disminucion_margen"]
    assert any("MARGEN_BAJA" in a["mensaje"] for a in disminucion)
    assert not any("NUEVO" in a["mensaje"] for a in disminucion)
