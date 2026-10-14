"""
Cortesías desde Recibos Emitidos (`tipo = CORTESIA`) — fuente principal del
panel Cortesías de "Análisis y Profundidad" (services/cortesias_dashboard.py).
Productos Vendidos queda como detalle por producto; ver también
`test_cortesias_dashboard.py`.
"""

from datetime import date, time

from app.models import ReciboEmitidoDetalle
from app.services.cortesias_dashboard import construir_cortesias_desde_recibos, elegir_resumen_cortesias


def _recibo(cuenta, subtotal, tipo="CORTESIA", segmento=None, turno="Comida", fecha=date(2026, 9, 1), descuento=0.0):
    return ReciboEmitidoDetalle(
        fecha=fecha, hora=time(13, 0), turno=turno, cuenta=cuenta, tipo=tipo, segmento=segmento,
        subtotal=subtotal, descuento=descuento, tax=0.0, propina=0.0, room_serv=0.0, servicio=0.0,
        total=subtotal - descuento, subtotal_tipo_producto=0.0,
    )


def test_solo_tipo_cortesia_suma_en_el_total():
    recibos = [
        _recibo("1/A", 100, segmento="CONS DPTO REST"),
        _recibo("2/A", 50, tipo="AL COSTO"),
        _recibo("3/A", 25, tipo="HOTEL", segmento="CONS DPTO GERENCIA"),  # consumo interno, no cortesía
        _recibo("4/A", 1000, tipo="HOTEL"),  # venta comercial
    ]
    r = construir_cortesias_desde_recibos(recibos)
    assert r["total_monto_cortesia"] == 100.0
    assert r["cuentas_cortesia"] == 1
    assert r["otros_no_comerciales"]["al_costo"] == {"monto": 50.0, "cuentas": 1}
    assert r["otros_no_comerciales"]["consumo_interno"] == {"monto": 25.0, "cuentas": 1}
    assert r["pct_de_venta_neta"] == 10.0  # 100 / venta neta 1000


def test_agrupa_por_departamento_y_nombra_sin_departamento():
    recibos = [
        _recibo("1/A", 100, segmento="CONS DPTO REST"),
        _recibo("2/A", 60, segmento="CONS DPTO REST"),
        _recibo("3/A", 200, segmento=None),
        _recibo("4/A", 10, segmento="  "),
    ]
    r = construir_cortesias_desde_recibos(recibos)
    assert r["por_departamento"] == [
        {"segmento": "Sin departamento", "monto": 210.0, "cuentas": 2},
        {"segmento": "CONS DPTO REST", "monto": 160.0, "cuentas": 2},
    ]


def test_por_turno_en_orden_y_mayores_cuentas_limitadas_a_10():
    recibos = [_recibo(f"{i}/A", 10 + i, turno="Cena" if i % 2 else "Desayuno") for i in range(15)]
    r = construir_cortesias_desde_recibos(recibos)
    assert [f["turno"] for f in r["por_turno"]] == ["Desayuno", "Cena"]
    assert len(r["mayores_cuentas"]) == 10
    montos = [c["monto"] for c in r["mayores_cuentas"]]
    assert montos == sorted(montos, reverse=True)
    assert montos[0] == 24.0


def test_por_dia_ordenado_y_descuento_se_resta():
    recibos = [
        _recibo("1/A", 100, fecha=date(2026, 9, 2), descuento=10.0),
        _recibo("2/A", 50, fecha=date(2026, 9, 1)),
    ]
    r = construir_cortesias_desde_recibos(recibos)
    assert [f["fecha"] for f in r["por_dia"]] == ["2026-09-01", "2026-09-02"]
    assert r["total_monto_cortesia"] == 140.0


def test_sin_venta_neta_no_calcula_porcentaje_ni_truena():
    assert construir_cortesias_desde_recibos([_recibo("1/A", 100)])["pct_de_venta_neta"] is None
    vacio = construir_cortesias_desde_recibos([])
    assert vacio["total_monto_cortesia"] == 0.0
    assert vacio["por_departamento"] == []


def test_elegir_resumen_usa_recibos_si_ambos_periodos_tienen_y_cae_a_pv_si_no():
    pv_actual = {"total_monto_cortesia": 999.0}
    pv_anterior = {"total_monto_cortesia": 888.0}
    actual, anterior = elegir_resumen_cortesias([_recibo("1/A", 100)], [_recibo("2/A", 50)], pv_actual, pv_anterior)
    assert (actual["total_monto_cortesia"], anterior["total_monto_cortesia"]) == (100.0, 50.0)

    # Falta uno de los dos periodos -> nunca se mezclan fuentes: ambos vienen de PV.
    assert elegir_resumen_cortesias([_recibo("1/A", 100)], [], pv_actual, pv_anterior) == (pv_actual, pv_anterior)
    assert elegir_resumen_cortesias([], [], pv_actual, pv_anterior) == (pv_actual, pv_anterior)
