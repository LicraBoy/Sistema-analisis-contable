"""
Regresión para services/api de resumen_ejecutivo.py — protege el
comportamiento del primer dashboard de "Análisis y Profundidad":

- `construir_serie_diaria` agrega Comandas/Recibos por día, no por fila.
- `calcular_kpis` no truena con división por cero (sin cuentas) ni cuando no
  hay periodo anterior con qué comparar.
- `generar_insights` NO inventa el insight de mejor/peor día de la semana
  cuando el historial es insuficiente (evita un "hallazgo" engañoso con
  pocos datos) y sí lo genera cuando hay muestra suficiente.
- Un rango sin ningún dato no genera insights (lista vacía, no insights
  vacíos/falsos).
"""

from datetime import date, time

import pytest

from app.api.resumen_ejecutivo import obtener_resumen_ejecutivo
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ReciboEmitidoDetalle
from app.services.ranking_productos import construir_ranking_productos
from app.services.resumen_ejecutivo import (
    _insight_precio_candidato,
    calcular_kpis,
    construir_comparaciones_periodo,
    construir_serie_diaria,
    construir_serie_mensual,
    generar_insights,
)


def _comanda(fecha, hora, turno, producto, cantidad, cuenta="450913", grupo="BEBIDAS"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta=cuenta,
        estatus="Vendido", grupo=grupo, categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _catalogo(nombre, costo, precio_venta, grupo="BEBIDAS"):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo=grupo, nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo="Bebidas", seccion_menu="Bar", costo=costo, precio_venta=precio_venta,
    )


def _recibo(fecha, hora, turno, cuenta="450913", total=100.0, propina=10.0, tipo="HOTEL", segmento=None, descuento=0.0):
    # `total` aquí es la VENTA NETA de la cuenta (subtotal − descuento): el
    # `total` real del recibo suma además propina (tax=0 en estos fixtures).
    return ReciboEmitidoDetalle(
        fecha=fecha, hora=hora, turno=turno, cuenta=cuenta, pos="RESTAURANT LA PALAPA", tipo=tipo,
        segmento=segmento, pagada="ALGUIEN, X", subtotal=total + descuento, descuento=descuento, tax=0.0,
        room_serv=0.0, servicio=0.0, propina=propina, total=total + propina, subtotal_tipo_producto=0.0,
    )


# ── construir_serie_diaria ───────────────────────────────────────────────

def test_serie_diaria_agrega_por_dia():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 3.0),
        _comanda(date(2026, 9, 1), time(20, 0), "Cena", "CAFE", 2.0),
        _comanda(date(2026, 9, 2), time(13, 0), "Comida", "CAFE", 1.0),
    ]
    recibos = [
        _recibo(date(2026, 9, 1), time(13, 30), "Comida", cuenta="1", total=100.0),
        _recibo(date(2026, 9, 1), time(20, 30), "Cena", cuenta="2", total=50.0),
        _recibo(date(2026, 9, 2), time(13, 30), "Comida", cuenta="3", total=80.0),
    ]

    serie = construir_serie_diaria(comandas, recibos)

    assert len(serie) == 2
    dia1 = next(d for d in serie if d["fecha"] == "2026-09-01")
    assert dia1["total_vendido"] == 150.0
    assert dia1["cantidad_cuentas"] == 2
    assert dia1["piezas_vendidas"] == 5.0


def test_serie_diaria_rango_vacio():
    assert construir_serie_diaria([], []) == []


# ── calcular_kpis ────────────────────────────────────────────────────────

def test_kpis_ticket_promedio_sin_cuentas_no_truena():
    serie = [{"fecha": "2026-09-01", "total_vendido": 0.0, "cantidad_cuentas": 0, "piezas_vendidas": 0.0}]

    kpis = calcular_kpis(serie, recibos=[], total_vendido_periodo_anterior=None)

    assert kpis["ticket_promedio"] == 0.0
    assert kpis["variacion_pct"] is None


def test_kpis_variacion_pct_con_periodo_anterior():
    serie = [{"fecha": "2026-09-02", "total_vendido": 150.0, "cantidad_cuentas": 2, "piezas_vendidas": 5.0}]

    kpis = calcular_kpis(serie, recibos=[], total_vendido_periodo_anterior=100.0)

    assert kpis["variacion_pct"] == 50.0
    assert kpis["total_vendido_periodo_anterior"] == 100.0


def test_kpis_variacion_pct_none_si_periodo_anterior_en_cero():
    serie = [{"fecha": "2026-09-02", "total_vendido": 150.0, "cantidad_cuentas": 2, "piezas_vendidas": 5.0}]

    kpis = calcular_kpis(serie, recibos=[], total_vendido_periodo_anterior=0.0)

    assert kpis["variacion_pct"] is None


# ── generar_insights ─────────────────────────────────────────────────────

def test_insights_rango_vacio_no_genera_nada():
    kpis = calcular_kpis([], [], None)
    assert generar_insights([], [], [], kpis, catalogo=[], productos=[]) == []


def test_insights_omite_dia_semana_con_poca_muestra():
    """Solo 2 días de datos (menos del mínimo de 2 días-de-semana distintos con 2 muestras c/u) -> se omite."""
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 3.0)]
    recibos = [_recibo(date(2026, 9, 1), time(13, 30), "Comida", total=100.0)]
    serie = construir_serie_diaria(comandas, recibos)
    kpis = calcular_kpis(serie, recibos, None)

    insights = generar_insights(serie, comandas, recibos, kpis, catalogo=[], productos=[])

    mensajes = [i["mensaje"] for i in insights]
    assert not any("mejor día" in m or "más flojo" in m for m in mensajes)
    # Los insights de turno y producto top sí deben seguir generándose.
    assert any("turno de Comida" in m for m in mensajes)
    assert any("CAFE" in m for m in mensajes)
    # Cada insight generado debe traer una acción sugerida concreta (7E).
    assert all(i["accion_sugerida"] for i in insights)


def test_insights_genera_dia_semana_con_muestra_suficiente():
    """2 martes y 2 miércoles con datos -> ya hay muestra suficiente para el insight."""
    martes = [date(2026, 9, 1), date(2026, 9, 8)]  # ambos martes
    miercoles = [date(2026, 9, 2), date(2026, 9, 9)]  # ambos miércoles

    comandas = []
    recibos = []
    for f in martes:
        comandas.append(_comanda(f, time(13, 0), "Comida", "CAFE", 1.0))
        recibos.append(_recibo(f, time(13, 30), "Comida", cuenta=f.isoformat(), total=50.0))
    for f in miercoles:
        comandas.append(_comanda(f, time(13, 0), "Comida", "CAFE", 1.0))
        recibos.append(_recibo(f, time(13, 30), "Comida", cuenta=f.isoformat(), total=200.0))

    serie = construir_serie_diaria(comandas, recibos)
    kpis = calcular_kpis(serie, recibos, None)

    insights = generar_insights(serie, comandas, recibos, kpis, catalogo=[], productos=[])

    mensajes = [i["mensaje"] for i in insights]
    assert any("mejor día" not in m and "Miércoles" in m for m in mensajes) or any(
        "Miércoles es el mejor día" in m for m in mensajes
    )


# ── _insight_por_que_mejor_peor_dia (diagnóstico automático) ─────────────

def test_diagnostico_nombra_turno_con_mayor_brecha_de_participacion():
    """
    Martes (peor día) vende 100% en Comida; Miércoles (mejor día) vende 100%
    en Cena -> el mix general del rango queda 20% Comida / 80% Cena, así que
    Martes (minoría casi total del rango en Comida) es el que más se aleja
    del promedio general (+80 puntos), más que Miércoles (+20 puntos) -- el
    diagnóstico debe nombrar a Martes/Comida, no a Miércoles/Cena.
    """
    martes = [date(2026, 9, 1), date(2026, 9, 8)]  # peor día: 100% Comida
    miercoles = [date(2026, 9, 2), date(2026, 9, 9)]  # mejor día: 100% Cena

    comandas, recibos = [], []
    for f in martes:
        comandas.append(_comanda(f, time(13, 0), "Comida", "CAFE", 1.0))
        recibos.append(_recibo(f, time(13, 30), "Comida", cuenta=f"{f}-c", total=50.0))
    for f in miercoles:
        comandas.append(_comanda(f, time(20, 0), "Cena", "CAFE", 1.0))
        recibos.append(_recibo(f, time(20, 30), "Cena", cuenta=f"{f}-n", total=200.0))

    serie = construir_serie_diaria(comandas, recibos)
    kpis = calcular_kpis(serie, recibos, None)
    catalogo = [_catalogo("CAFE", 10.0, 50.0)]

    insights = generar_insights(serie, comandas, recibos, kpis, catalogo, productos=[])

    mensajes = [i["mensaje"] for i in insights]
    assert any("Martes" in m and "Comida" in m for m in mensajes)


def test_diagnostico_none_si_muestra_insuficiente():
    comandas = [_comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 3.0)]
    recibos = [_recibo(date(2026, 9, 1), time(13, 30), "Comida", total=100.0)]
    serie = construir_serie_diaria(comandas, recibos)
    kpis = calcular_kpis(serie, recibos, None)

    insights = generar_insights(serie, comandas, recibos, kpis, catalogo=[_catalogo("CAFE", 10.0, 50.0)], productos=[])

    assert not any("puntos vs. su participación" in i["mensaje"] for i in insights)


def test_diagnostico_none_si_mix_no_tiene_brecha_significativa():
    """Martes y miércoles con el mismo mix de turno -> ninguna brecha, sin explicación forzada."""
    martes = [date(2026, 9, 1), date(2026, 9, 8)]
    miercoles = [date(2026, 9, 2), date(2026, 9, 9)]

    comandas, recibos = [], []
    for f in martes:
        comandas.append(_comanda(f, time(13, 0), "Comida", "CAFE", 1.0))
        recibos.append(_recibo(f, time(13, 30), "Comida", cuenta=f"{f}-a", total=50.0))
    for f in miercoles:
        comandas.append(_comanda(f, time(13, 0), "Comida", "CAFE", 1.0))
        recibos.append(_recibo(f, time(13, 30), "Comida", cuenta=f"{f}-b", total=200.0))

    serie = construir_serie_diaria(comandas, recibos)
    kpis = calcular_kpis(serie, recibos, None)
    catalogo = [_catalogo("CAFE", 10.0, 50.0)]

    insights = generar_insights(serie, comandas, recibos, kpis, catalogo, productos=[])

    assert not any("puntos vs. su participación" in i["mensaje"] for i in insights)


def test_diagnostico_comandas_y_recibos_vacios_para_el_dia_no_truena():
    """serie_diaria con datos pero comandas/recibos filtrados vacíos para ese día -> no truena, devuelve None."""
    from app.services.resumen_ejecutivo import _insight_por_que_mejor_peor_dia

    serie = [
        {"fecha": "2026-09-01", "total_vendido": 100.0, "cantidad_cuentas": 1, "piezas_vendidas": 1.0},
        {"fecha": "2026-09-08", "total_vendido": 100.0, "cantidad_cuentas": 1, "piezas_vendidas": 1.0},
        {"fecha": "2026-09-02", "total_vendido": 200.0, "cantidad_cuentas": 1, "piezas_vendidas": 1.0},
        {"fecha": "2026-09-09", "total_vendido": 200.0, "cantidad_cuentas": 1, "piezas_vendidas": 1.0},
    ]

    resultado = _insight_por_que_mejor_peor_dia(serie, comandas=[], recibos=[], catalogo=[])

    assert resultado is None


# ── construir_comparaciones_periodo ──────────────────────────────────────

def test_comparaciones_periodo_calcula_variacion_correcta():
    recibos_dia = [_recibo(date(2026, 9, 10), time(13, 0), "Comida", total=150.0)]
    recibos_dia_anterior = [_recibo(date(2026, 9, 9), time(13, 0), "Comida", total=100.0)]

    resultado = construir_comparaciones_periodo(
        recibos_dia=recibos_dia, recibos_dia_anterior=recibos_dia_anterior,
        recibos_semana=[], recibos_semana_anterior=[],
        recibos_mes=[], recibos_mes_anterior=[],
        recibos_anio_anterior=[],
    )

    assert resultado["dia"]["actual"] == 150.0
    assert resultado["dia"]["anterior"] == 100.0
    assert resultado["dia"]["variacion_pct"] == 50.0


def test_comparaciones_periodo_anterior_en_cero_da_variacion_none():
    recibos_mes = [_recibo(date(2026, 9, 10), time(13, 0), "Comida", total=500.0)]

    resultado = construir_comparaciones_periodo(
        recibos_dia=[], recibos_dia_anterior=[],
        recibos_semana=[], recibos_semana_anterior=[],
        recibos_mes=recibos_mes, recibos_mes_anterior=[],
        recibos_anio_anterior=[],
    )

    assert resultado["mes"]["actual"] == 500.0
    assert resultado["mes"]["anterior"] == 0.0
    assert resultado["mes"]["variacion_pct"] is None


# ── construir_serie_mensual ──────────────────────────────────────────────

def test_serie_mensual_agrupa_por_mes_no_por_dia():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 3.0),
        _comanda(date(2026, 9, 15), time(13, 0), "Comida", "CAFE", 2.0),
        _comanda(date(2026, 8, 20), time(13, 0), "Comida", "CAFE", 1.0),
    ]
    recibos = [
        _recibo(date(2026, 9, 1), time(13, 30), "Comida", cuenta="a", total=100.0),
        _recibo(date(2026, 9, 15), time(13, 30), "Comida", cuenta="b", total=50.0),
        _recibo(date(2026, 8, 20), time(13, 30), "Comida", cuenta="c", total=80.0),
    ]

    resultado = construir_serie_mensual(comandas, recibos)

    assert len(resultado) == 2
    sept = next(m for m in resultado if m["mes"] == "2026-09")
    agosto = next(m for m in resultado if m["mes"] == "2026-08")
    assert sept["total_vendido"] == 150.0
    assert sept["piezas_vendidas"] == 5.0
    assert agosto["total_vendido"] == 80.0
    assert agosto["piezas_vendidas"] == 1.0


def test_serie_mensual_rango_vacio_no_genera_filas():
    assert construir_serie_mensual([], []) == []


# ── _insight_precio_candidato ─────────────────────────────────────────────

def test_precio_candidato_detecta_alta_popularidad_con_margen_bajo():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "C", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "MUY PEDIDO", 100.0),
    ]
    catalogo = [
        _catalogo("A", 20.0, 50.0),  # margen 60%
        _catalogo("B", 20.0, 50.0),  # margen 60%
        _catalogo("C", 20.0, 50.0),  # margen 60%
        _catalogo("MUY PEDIDO", 40.0, 50.0),  # margen 20%, muy por debajo del promedio (50%)
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = _insight_precio_candidato(productos)

    assert resultado is not None
    assert "MUY PEDIDO" in resultado["mensaje"]
    assert resultado["tono"] == "neutral"


def test_precio_candidato_producto_popular_con_margen_alto_no_se_sugiere():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "C", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "MUY PEDIDO", 100.0),
    ]
    catalogo = [
        _catalogo("A", 20.0, 50.0),  # margen 60%
        _catalogo("B", 20.0, 50.0),  # margen 60%
        _catalogo("C", 20.0, 50.0),  # margen 60%
        _catalogo("MUY PEDIDO", 5.0, 50.0),  # margen 90%, por encima del promedio
    ]
    productos = construir_ranking_productos(comandas, catalogo)

    resultado = _insight_precio_candidato(productos)

    assert resultado is None


def test_precio_candidato_menos_de_4_productos_con_margen_da_none():
    comandas = [
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "A", 10.0),
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "B", 100.0),
    ]
    catalogo = [_catalogo("A", 20.0, 50.0), _catalogo("B", 40.0, 50.0)]
    productos = construir_ranking_productos(comandas, catalogo)

    assert _insight_precio_candidato(productos) is None


# ── obtener_resumen_ejecutivo (router) ──────────────────────────────────

@pytest.mark.anyio
async def test_resumen_ejecutivo_integra_periodo_anterior(db_session):
    db_session.add_all(
        [
            _comanda(date(2026, 9, 10), time(13, 0), "Comida", "CAFE", 2.0),
            _recibo(date(2026, 9, 10), time(13, 30), "Comida", cuenta="a", total=200.0),
            # Periodo anterior (mismo largo de 1 día, el 9 de sept).
            _recibo(date(2026, 9, 9), time(13, 30), "Comida", cuenta="b", total=100.0),
        ]
    )
    await db_session.commit()

    resultado = await obtener_resumen_ejecutivo(
        fecha_desde=date(2026, 9, 10), fecha_hasta=date(2026, 9, 10), db=db_session, current_user={}
    )

    assert resultado["kpis"]["total_vendido"] == 200.0
    assert resultado["kpis"]["total_vendido_periodo_anterior"] == 100.0
    assert resultado["kpis"]["variacion_pct"] == 100.0
