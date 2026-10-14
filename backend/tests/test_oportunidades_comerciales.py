"""
Regresión para services/oportunidades_comerciales.py — protege el 6º
dashboard de "Análisis y Profundidad". Un caso sintético claro por tipo de
oportunidad, más el caso "todo saludable" (sin oportunidades).
"""

from app.services.oportunidades_comerciales import detectar_oportunidades

_HEATMAP_VACIO = {"celdas": [], "fechas_con_datos": []}


def _producto(nombre, cantidad, margen_pct, ingreso_total, variacion_pct_cantidad=None):
    return {
        "producto": nombre,
        "grupo": "BEBIDAS",
        "cantidad": cantidad,
        "costo": None,
        "precio_venta": None,
        "margen_pct": margen_pct,
        "ingreso_total": ingreso_total,
        "producto_catalogo_encontrado": True,
        "variacion_pct_cantidad": variacion_pct_cantidad,
    }


def _grupo(nombre, ingreso_total):
    return {"grupo": nombre, "cantidad": 1.0, "ingreso_total": ingreso_total, "margen_pct": 50.0}


def test_sin_oportunidades_cuando_todo_esta_balanceado():
    productos = [_producto(f"P{i}", cantidad=10.0, margen_pct=40.0, ingreso_total=100.0) for i in range(6)]
    grupos = [_grupo(f"G{i}", ingreso_total=100.0) for i in range(4)]

    resultado = detectar_oportunidades(_HEATMAP_VACIO, productos, grupos)

    assert resultado == []


def test_detecta_hora_muerta():
    # 3 martes distintos (mismo dia_semana=1), cada uno con piezas altas en
    # horas 12-15 y muy bajas a las 20:00 -> el promedio por dia_semana+hora
    # marca la franja de las 20:00 como hora muerta.
    fechas_martes = ["2026-09-01", "2026-09-08", "2026-09-15"]
    celdas = [
        {"fecha": fecha, "dia_semana": 1, "hora": h, "piezas": 50.0}
        for fecha in fechas_martes
        for h in range(12, 16)
    ]
    celdas += [{"fecha": fecha, "dia_semana": 1, "hora": 20, "piezas": 2.0} for fecha in fechas_martes]
    heatmap = {"celdas": celdas, "fechas_con_datos": fechas_martes}

    resultado = detectar_oportunidades(heatmap, productos=[], grupos=[])

    hora_muerta = next(o for o in resultado if o["tipo"] == "hora_muerta")
    assert hora_muerta["dia_semana"] == 1


def test_detecta_producto_desaprovechado():
    # 3 productos populares con margen bajo + 1 con margen alto y muy poca venta.
    productos = [
        _producto("POPULAR A", cantidad=100.0, margen_pct=10.0, ingreso_total=500.0),
        _producto("POPULAR B", cantidad=90.0, margen_pct=12.0, ingreso_total=450.0),
        _producto("POPULAR C", cantidad=80.0, margen_pct=8.0, ingreso_total=400.0),
        _producto("JOYA OCULTA", cantidad=1.0, margen_pct=80.0, ingreso_total=50.0),
    ]

    resultado = detectar_oportunidades(_HEATMAP_VACIO, productos, grupos=[])

    assert any(o["tipo"] == "producto_desaprovechado" and "JOYA OCULTA" in o["mensaje"] for o in resultado)


def test_detecta_concentracion_pareto():
    # 1 producto con el 90% del ingreso, el resto muy repartido.
    productos = [_producto("ESTRELLA", cantidad=1.0, margen_pct=50.0, ingreso_total=900.0)]
    productos += [_producto(f"CHICO{i}", cantidad=1.0, margen_pct=50.0, ingreso_total=20.0) for i in range(5)]

    resultado = detectar_oportunidades(_HEATMAP_VACIO, productos, grupos=[])

    assert any(o["tipo"] == "concentracion_ventas" for o in resultado)


def test_detecta_grupo_subutilizado():
    grupos = [_grupo("GRANDE", ingreso_total=1000.0), _grupo("GRANDE2", ingreso_total=900.0), _grupo("CHIQUITO", ingreso_total=10.0)]

    resultado = detectar_oportunidades(_HEATMAP_VACIO, productos=[], grupos=grupos)

    assert any(o["tipo"] == "grupo_subutilizado" and "CHIQUITO" in o["mensaje"] for o in resultado)


def test_detecta_producto_en_declive_fuerte():
    productos = [_producto("EN CAIDA", cantidad=5.0, margen_pct=30.0, ingreso_total=100.0, variacion_pct_cantidad=-50.0)]

    resultado = detectar_oportunidades(_HEATMAP_VACIO, productos, grupos=[])

    assert any(o["tipo"] == "producto_en_declive" and "EN CAIDA" in o["mensaje"] for o in resultado)


def test_declive_leve_no_se_reporta():
    """Una caída moderada (no fuerte) no debe generar alerta — evita ruido excesivo."""
    productos = [_producto("CAIDA LEVE", cantidad=8.0, margen_pct=30.0, ingreso_total=100.0, variacion_pct_cantidad=-10.0)]

    resultado = detectar_oportunidades(_HEATMAP_VACIO, productos, grupos=[])

    assert not any(o["tipo"] == "producto_en_declive" for o in resultado)


def test_oportunidades_dia_agnosticas_traen_dia_semana_none():
    """Los 4 tipos que no dependen de un día de semana (todo menos hora_muerta) traen dia_semana=None."""
    productos = [_producto("EN CAIDA", cantidad=5.0, margen_pct=30.0, ingreso_total=100.0, variacion_pct_cantidad=-50.0)]

    resultado = detectar_oportunidades(_HEATMAP_VACIO, productos, grupos=[])

    assert all(o["dia_semana"] is None for o in resultado if o["tipo"] != "hora_muerta")
