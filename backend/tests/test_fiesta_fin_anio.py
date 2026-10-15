"""Pruebas de services/fiesta_fin_anio.py — reglas portadas del Excel de reservas."""

from datetime import date

import pytest

from app.services.fiesta_fin_anio import (
    MAX_SILLAS_MESA,
    SILLAS_VISIBLES,
    es_silla_extra,
    calcular_reservacion,
    conciliar_contabilidad,
    construir_cobros,
    construir_cobros_diarios,
    construir_resumen,
    desglose_fiscal,
    es_preventa,
    estado_silla,
    fila_historico_a_fecha,
    mesas_semilla,
    posicion_semilla,
    precio_aplicable,
    distribuir_abono,
    repartir_pagos_por_silla,
    resumir_pagos_historicos,
    sugerir_abonos,
    validar_cantidades,
)
from app.services.fiesta_fin_anio_semilla import CAPACIDAD_MESAS

CORTE = date(2025, 12, 10)
PRECIOS = {"adulto": (2450.0, 2750.0), "nino": (1090.0, 1090.0), "cortesia": (0.0, 0.0)}


def _silla(tipo="adulto", precio=2750.0, activa=True, preventa=False):
    return {"tipo": tipo, "precio_aplicado": precio, "activa": activa, "preventa": preventa}


def _reservacion(sillas, pagos=()):
    calc = calcular_reservacion(sillas, [{"importe": p} for p in pagos])
    return {"sillas": sillas, **calc}


# --- precios ---------------------------------------------------------------


def test_precio_preventa_hasta_el_corte_inclusive():
    assert precio_aplicable("adulto", date(2025, 12, 10), CORTE, PRECIOS) == 2450.0
    assert precio_aplicable("adulto", date(2025, 11, 1), CORTE, PRECIOS) == 2450.0


def test_precio_normal_despues_del_corte_sin_huecos():
    # El Excel devolvía 0 si la fecha caía entre los dos cortes; aquí no.
    assert precio_aplicable("adulto", date(2025, 12, 11), CORTE, PRECIOS) == 2750.0
    assert precio_aplicable("adulto", date(2025, 12, 31), CORTE, PRECIOS) == 2750.0


def test_precio_cortesia_y_nino():
    assert precio_aplicable("cortesia", date(2025, 12, 20), CORTE, PRECIOS) == 0.0
    assert precio_aplicable("nino", date(2025, 12, 20), CORTE, PRECIOS) == 1090.0


def test_sin_corte_todo_es_precio_normal():
    assert not es_preventa(date(2025, 1, 1), None)
    assert precio_aplicable("adulto", date(2025, 1, 1), None, PRECIOS) == 2750.0


def test_tipo_invalido_falla():
    with pytest.raises(ValueError):
        precio_aplicable("vip", date(2025, 12, 1), CORTE, PRECIOS)


# --- reservación -----------------------------------------------------------


def test_reservacion_sin_pagos_es_sin_pago():
    r = calcular_reservacion([_silla(), _silla(precio=2450.0)], [])
    assert r["importe"] == 5200.0
    assert r["pagado"] == 0.0
    assert r["saldo"] == 5200.0
    assert r["estado"] == "sin_pago"


def test_reservacion_con_anticipo_y_varios_pagos():
    r = calcular_reservacion(
        [_silla(), _silla()],
        [{"importe": 1000.0}, {"importe": 2000.0}, {"importe": 500.0}, {"importe": 500.0}],  # 4 pagos, no 3
    )
    assert r["pagado"] == 4000.0
    assert r["saldo"] == 1500.0
    assert r["estado"] == "anticipo"


def test_reservacion_liquidada_y_excedente():
    pagada = calcular_reservacion([_silla()], [{"importe": 2750.0}])
    assert pagada["estado"] == "pagada" and pagada["saldo"] == 0.0 and pagada["excedente"] == 0.0
    sobrepago = calcular_reservacion([_silla()], [{"importe": 3000.0}])
    assert sobrepago["estado"] == "pagada" and sobrepago["excedente"] == 250.0


def test_pagos_cancelados_y_sillas_inactivas_no_cuentan():
    r = calcular_reservacion(
        [_silla(), _silla(activa=False)],
        [{"importe": 2750.0, "cancelado": True}],
    )
    assert r["importe"] == 2750.0
    assert r["pagado"] == 0.0
    assert r["estado"] == "sin_pago"


def test_reservacion_solo_cortesias():
    r = calcular_reservacion([_silla("cortesia", 0.0)], [])
    assert r["importe"] == 0.0
    assert r["estado"] == "cortesia"


def test_estado_silla():
    assert estado_silla("adulto", None) == "libre"
    assert estado_silla("adulto", "anticipo") == "anticipo"
    assert estado_silla("cortesia", "pagada") == "cortesia"
    assert estado_silla("nino", "pagada") == "pagada"


def test_validar_cantidades():
    assert validar_cantidades(2, 1, 0) == []
    assert validar_cantidades(0, 0, 0)
    assert validar_cantidades(-1, 0, 1)


# --- resumen ---------------------------------------------------------------


def test_resumen_cuenta_estados_y_cortesias_como_excel():
    reservaciones = [
        _reservacion([_silla(preventa=True, precio=2450.0), _silla(preventa=True, precio=2450.0)], [4900.0]),
        _reservacion([_silla(), _silla("nino", 1090.0)], [1000.0]),
        _reservacion([_silla()], []),
        _reservacion([_silla("cortesia", 0.0)], []),
    ]
    res = construir_resumen(reservaciones, capacidad_total=760)

    assert res["reservas"] == {"adultos": 4, "ninos": 1, "cortesias": 1, "total": 6}
    assert res["estado"]["pagadas"] == 2
    assert res["estado"]["anticipos"] == 2
    assert res["estado"]["sin_anticipo"] == 1
    # Resumen!E16 del Excel: sin anticipo incluye las cortesías
    assert res["estado"]["sin_anticipo_con_cortesias"] == 2
    assert res["ocupacion"] == {"ocupadas": 6, "disponibles": 754, "pct": 0.8, "adultos": 4, "ninos": 1, "cortesias": 1}
    assert res["preventa"]["adultos"] == {"cantidad": 2, "importe": 4900.0}
    assert res["normal"]["adultos"]["cantidad"] == 2
    assert res["dinero"]["importe_total"] == 4900.0 + 3840.0 + 2750.0
    assert res["dinero"]["pagado"] == 5900.0
    assert res["comparativo"] is None


def test_resumen_vacio_no_divide_entre_cero():
    res = construir_resumen([], capacidad_total=760)
    assert res["reservas"]["total"] == 0
    assert res["estado"]["pct_pagadas"] is None
    assert res["ocupacion"]["disponibles"] == 760


def test_comparativo_contra_misma_fecha_de_edicion_anterior():
    historico = [
        {"fecha": date(2024, 12, 9), "reservados": 500, "pagados": 400, "anticipos": 60, "sin_anticipo": 5, "cortesias": 33},
        {"fecha": date(2024, 12, 10), "reservados": 520, "pagados": 410, "anticipos": 70, "sin_anticipo": 7, "cortesias": 33},
        {"fecha": date(2024, 12, 11), "reservados": 600, "pagados": 500, "anticipos": 60, "sin_anticipo": 7, "cortesias": 33},
    ]
    res = construir_resumen(
        [_reservacion([_silla()] * 5, [13750.0])],
        capacidad_total=760,
        historico=historico,
        fecha_corte=date(2025, 12, 10),
    )
    comp = res["comparativo"]
    assert comp["fecha_referencia"] == date(2024, 12, 10)
    assert comp["reservados"]["anterior"] == 520
    assert comp["reservados"]["variacion"] == 5 - 520
    assert comp["reservados"]["pct"] == round((5 - 520) / 520 * 100, 1)


def test_historico_usa_ultima_fila_anterior_si_falta_el_dia():
    filas = [
        {"fecha": date(2024, 12, 1), "reservados": 1},
        {"fecha": date(2024, 12, 5), "reservados": 5},
    ]
    assert fila_historico_a_fecha(filas, date(2025, 12, 3))["reservados"] == 1
    assert fila_historico_a_fecha(filas, date(2025, 11, 1)) is None
    assert fila_historico_a_fecha(filas, None)["reservados"] == 5
    assert fila_historico_a_fecha([], date(2025, 12, 3)) is None


# --- cobros y fiscal -------------------------------------------------------


def test_cobros_por_dia_con_acumulado_y_sin_iva():
    pagos = [
        {"fecha": date(2025, 12, 2), "importe": 1160.0, "forma_pago": "Efectivo"},
        {"fecha": date(2025, 12, 1), "importe": 2320.0, "forma_pago": "Tarjeta"},
        {"fecha": date(2025, 12, 2), "importe": 1160.0, "forma_pago": "Tarjeta"},
    ]
    c = construir_cobros(pagos, iva_factor=1.16)
    assert [d["fecha"] for d in c["dias"]] == [date(2025, 12, 1), date(2025, 12, 2)]
    assert c["dias"][0]["importe"] == 2320.0 and c["dias"][0]["sin_iva"] == 2000.0
    assert c["dias"][1]["importe"] == 2320.0 and c["dias"][1]["acumulado"] == 4640.0
    assert c["total"] == 4640.0 and c["total_sin_iva"] == 4000.0
    assert {f["forma_pago"]: f["importe"] for f in c["por_forma_pago"]} == {"Efectivo": 1160.0, "Tarjeta": 3480.0}


def test_desglose_fiscal_replica_reservas_t871():
    # Excel: subtotal = total/1.31; IVA 16%; propina 15% del subtotal
    d = desglose_fiscal(1_376_720.0, iva_factor=1.16, propina_pct=0.15)
    assert d["subtotal"] == pytest.approx(1_050_931.30, abs=0.01)
    assert d["iva"] == pytest.approx(168_149.01, abs=0.01)
    assert d["propina"] == pytest.approx(157_639.69, abs=0.01)
    assert d["total"] == pytest.approx(1_376_720.0, abs=0.02)


def test_conciliacion_contabilidad():
    assert conciliar_contabilidad(1000.0, 900.0)["diferencia"] == 100.0
    assert conciliar_contabilidad(1000.0, None)["diferencia"] is None


# --- semilla ---------------------------------------------------------------


def test_semilla_72_mesas_y_864_sillas_todas_a_12():
    mesas = mesas_semilla()
    assert len(mesas) == 72
    assert sum(m["capacidad"] for m in mesas) == 864 == sum(CAPACIDAD_MESAS.values())
    assert max(m["capacidad"] for m in mesas) == MAX_SILLAS_MESA == 12
    assert {m["zona"] for m in mesas} == {"Salón principal", "Zona 200"}
    assert len({m["numero"] for m in mesas}) == 72


def test_sillas_extra_son_las_que_no_se_dibujan():
    assert [n for n in range(1, 13) if es_silla_extra(n)] == [11, 12]
    assert SILLAS_VISIBLES == 10


def test_semilla_posiciones_siguen_la_rejilla_del_excel():
    # Croquis del Excel: mesa 10 en (≈79, 14.5), 20 una columna a la derecha, 11 una fila abajo
    assert posicion_semilla(10) == (79.0, 14.5)
    assert posicion_semilla(20) == (85.0, 14.5)
    assert posicion_semilla(11) == (79.0, 19.5)
    assert posicion_semilla(113) == (139.0, 29.5)
    assert posicion_semilla(200) == (37.0, 55.5)
    assert posicion_semilla(236) == (73.0, 70.5)
    posiciones = {posicion_semilla(m["numero"]) for m in mesas_semilla()}
    assert len(posiciones) == 72  # ninguna mesa encima de otra


# --- pagos reflejados por silla (hojas de mesa del Excel) --------------------


def _s(id, precio=1000.0, orden=None, activa=True):
    return {"silla_id": id, "precio_aplicado": precio, "orden": orden or (10, id), "activa": activa}


def _p(id, importe, dia=1, cancelado=False, ref=""):
    return {"id": id, "importe": importe, "fecha": date(2026, 12, dia), "referencia": ref, "cancelado": cancelado}


def test_reparto_general_se_distribuye_entre_todas_las_sillas():
    r = repartir_pagos_por_silla([_s(1), _s(2), _s(3), _s(4)], [_p(1, 2500)])
    assert [r[i]["pagado"] for i in (1, 2, 3, 4)] == [625, 625, 625, 625]  # ya no se va todo a la silla 1
    assert all(r[i]["estado"] == "anticipo" for i in (1, 2, 3, 4))
    assert [r[i]["saldo"] for i in (1, 2, 3, 4)] == [375, 375, 375, 375]

def test_reparto_varios_pagos_a_una_silla_son_pago_1_2_3():
    r = repartir_pagos_por_silla([_s(1)], [_p(2, 300, dia=5, ref="B"), _p(1, 200, dia=2, ref="A"), _p(3, 500, dia=9)])
    assert [x["referencia"] for x in r[1]["pagos"]] == ["A", "B", ""]  # por fecha
    assert [x["importe"] for x in r[1]["pagos"]] == [200, 300, 500]
    assert r[1]["estado"] == "pagada"


def test_reparto_ignora_cancelados_y_sillas_inactivas():
    r = repartir_pagos_por_silla([_s(1), _s(2, activa=False), _s(3)], [_p(1, 1000, cancelado=True), _p(2, 400)])
    assert 2 not in r
    assert r[1]["pagado"] == 200 and r[3]["pagado"] == 200

def test_reparto_cortesia_no_recibe_dinero():
    r = repartir_pagos_por_silla([_s(1, precio=0.0), _s(2, orden=(11, 1)), _s(3, orden=(10, 2))], [_p(1, 1200)])
    assert r[1]["estado"] == "cortesia" and r[1]["pagado"] == 0
    assert r[2]["pagado"] == 600 and r[3]["pagado"] == 600

def test_reparto_excedente_no_se_asigna_y_totales_cuadran():
    sillas = [_s(1), _s(2)]
    r = repartir_pagos_por_silla(sillas, [_p(1, 2600)])
    assert sum(x["pagado"] for x in r.values()) == 2000  # el excedente de 600 queda a nivel reservación
    calc = calcular_reservacion([_silla(precio=1000.0), _silla(precio=1000.0)], [{"importe": 2600}])
    assert calc["excedente"] == 600
    parcial = repartir_pagos_por_silla(sillas, [_p(1, 700), _p(2, 450)])
    assert sum(x["pagado"] for x in parcial.values()) == 1150


# --- abonos dirigidos a sillas y sugerencias 25/50/75/100 % ------------------


def _pd(id, importe, ids, dia=1):
    return {**_p(id, importe, dia=dia), "silla_ids": ids}


def test_abono_dirigido_a_una_silla_no_toca_las_demas():
    r = repartir_pagos_por_silla([_s(1), _s(2), _s(3)], [_pd(1, 250, [3])])  # 25 % de la silla 3
    assert [r[i]["pagado"] for i in (1, 2, 3)] == [0, 0, 250]
    assert r[3]["estado"] == "anticipo" and r[3]["pagos"][0]["dirigido"] is True
    assert r[1]["estado"] == "sin_pago"


def test_abono_dirigido_a_varias_sillas_se_reparte_entre_ellas():
    r = repartir_pagos_por_silla([_s(1), _s(2), _s(3), _s(4)], [_pd(1, 1500, [2, 4])])
    assert [r[i]["pagado"] for i in (1, 2, 3, 4)] == [0, 750, 0, 750]

def test_abono_dirigido_que_excede_se_derrama_a_las_demas():
    r = repartir_pagos_por_silla([_s(1), _s(2), _s(3)], [_pd(1, 1300, [2])])
    assert r[2]["pagado"] == 1000 and r[1]["pagado"] == 150 and r[3]["pagado"] == 150
    assert r[2]["pagos"][0]["dirigido"] is True and r[1]["pagos"][0]["dirigido"] is False

def test_abono_dirigido_a_silla_liberada_cascadea_y_dirigidos_van_primero():
    # El general (dia 1) no debe quitarle lugar al dirigido posterior (dia 5) a la silla 1.
    r = repartir_pagos_por_silla([_s(1), _s(2)], [_p(1, 1000, dia=1), _pd(2, 1000, [1], dia=5)])
    assert r[1]["pagado"] == 1000 and r[2]["pagado"] == 1000
    assert r[1]["pagos"][0]["dirigido"] is True
    # silla destino que ya no existe → cascada normal
    r2 = repartir_pagos_por_silla([_s(2), _s(3)], [_pd(1, 400, [1])])
    assert r2[2]["pagado"] == 200 and r2[3]["pagado"] == 200


def test_dirigido_y_total_cuadran_con_el_pagado_de_la_reservacion():
    sillas = [_s(1), _s(2), _s(3)]
    pagos = [_pd(1, 250, [2]), _p(2, 900, dia=3), _pd(3, 750, [2], dia=4)]
    r = repartir_pagos_por_silla(sillas, pagos)
    assert sum(x["pagado"] for x in r.values()) == 1900  # 250 + 900 + 750, todo bajo el importe de 3000
    assert r[2]["pagado"] == 1000 and r[2]["estado"] == "pagada"  # 25 % + 75 % = silla pagada en 2 pagos


def test_sugerir_abonos_umbrales_y_complemento():
    s = sugerir_abonos(2450, 0)
    assert [(x["pct"], x["monto"]) for x in s] == [(25, 612.5), (50, 1225.0), (75, 1837.5), (100, 2450.0)]
    assert s[0]["sugerido"] is True and not any(x["sugerido"] for x in s[1:])
    tras_75 = sugerir_abonos(2450, 1837.5, n_pagos=1)
    assert [(x["pct"], x["monto"]) for x in tras_75] == [(100, 612.5)]  # si dio 75 %, sugiere el 25 % restante
    tras_25 = sugerir_abonos(2450, 612.5, n_pagos=1)
    assert [(x["pct"], x["monto"]) for x in tras_25] == [(50, 612.5), (75, 1225.0), (100, 1837.5)]


def test_sugerir_abonos_tope_de_tres_pagos_y_pagado_completo():
    s = sugerir_abonos(2450, 1000, n_pagos=2)
    assert s == [{"pct": 100, "monto": 1450.0, "sugerido": True, "completa": True}]
    assert sugerir_abonos(2450, 2450, n_pagos=1) == []
    assert sugerir_abonos(0, 0) == []


# --- distribución proporcional y reparto guardado por silla -------------------


def test_distribuir_abono_igual_y_proporcional_al_saldo():
    rep, sobra = distribuir_abono(2450, {1: 2450, 2: 2450, 3: 2450, 4: 2450})  # 25 % del total de 4 sillas
    assert rep == {1: 612.5, 2: 612.5, 3: 612.5, 4: 612.5} and sobra == 0
    rep, _ = distribuir_abono(900, {1: 1000, 2: 500})  # proporcional al saldo
    assert rep == {1: 600.0, 2: 300.0}


def test_distribuir_abono_centavos_exactos_tope_y_sobrante():
    rep, sobra = distribuir_abono(100, {1: 1000, 2: 1000, 3: 1000})
    assert round(sum(rep.values()), 2) == 100 and sorted(rep.values()) == [33.33, 33.33, 33.34] and sobra == 0
    rep, sobra = distribuir_abono(3500, {1: 1000, 2: 500})
    assert rep == {1: 1000, 2: 500} and sobra == 2000
    assert distribuir_abono(0, {1: 100}) == ({}, 0.0)
    assert distribuir_abono(50, {}) == ({}, 50.0)


def test_reparto_guardado_manda_y_se_edita_por_silla():
    # El abono de 1000 se guardó 400 / 600 entre las sillas 1 y 2; el de 500 es antiguo (sin reparto).
    pagos = [{**_p(1, 1000), "reparto": {1: 400, 2: 600}}, _p(2, 500, dia=2)]
    r = repartir_pagos_por_silla([_s(1), _s(2)], pagos)
    assert r[1]["pagos"][0]["importe"] == 400 and r[2]["pagos"][0]["importe"] == 600
    assert r[1]["pagado"] == 700 and r[2]["pagado"] == 800  # el antiguo (500) se reparte según el saldo (600 y 400)
    assert sum(x["pagado"] for x in r.values()) == 1500


def test_reparto_guardado_de_silla_liberada_se_redistribuye():
    pagos = [{**_p(1, 1000), "reparto": {1: 500, 9: 500}}]  # la silla 9 ya no está en la reservación
    r = repartir_pagos_por_silla([_s(1), _s(2)], pagos)
    assert sum(x["pagado"] for x in r.values()) == 1000
    assert r[1]["pagado"] > 500 and r[2]["pagado"] > 0


def test_reparto_guardado_no_rebasa_el_precio_de_la_silla():
    pagos = [{**_p(1, 1500), "reparto": {1: 1500}}]
    r = repartir_pagos_por_silla([_s(1), _s(2)], pagos)
    assert r[1]["pagado"] == 1000 and r[2]["pagado"] == 500 and r[1]["estado"] == "pagada"


# --- Cobros día a día (hoja Cobros del Excel) ---------------------------------


def _res(fecha_venta, sillas, pagos=(), cancelada=False, cancelado_en=None):
    return {
        "fecha_venta": fecha_venta,
        "cancelada": cancelada,
        "cancelado_en": cancelado_en,
        "sillas": [
            {"silla_id": i, "precio_aplicado": precio, "activa": not cancelada, "orden": (1, i)}
            for i, precio in enumerate(sillas, start=1)
        ],
        "pagos": [
            {"id": k, "fecha": f, "importe": imp, "cancelado": canc, "referencia": "", "silla_ids": [], "reparto": None}
            for k, (f, imp, canc) in enumerate(pagos, start=1)
        ],
    }


def _d(dia):
    return date(2026, 12, dia)


def test_cobros_diarios_incluye_dias_sin_movimiento_y_llega_al_evento():
    r = _res(_d(2), [1000], [(_d(2), 400, False)])
    out = construir_cobros_diarios([r], {}, 1.16, _d(6), _d(3))
    assert [d["fecha"].day for d in out["dias"]] == [2, 3, 4, 5, 6]
    assert [d["total"] for d in out["dias"]] == [400, 0, 0, 0, 0]
    assert [d["movimiento"] for d in out["dias"]] == [True, False, False, False, False]
    assert [d["acumulado"] for d in out["dias"]] == [400, 400, 400, 400, 400]


def test_cobros_diarios_pago_1_2_3_por_ordinal_y_suman_el_total():
    pagos = [(_d(2), 100, False), (_d(2), 200, False), (_d(3), 300, False), (_d(3), 50, False), (_d(4), 70, True)]
    out = construir_cobros_diarios([_res(_d(2), [5000], pagos)], {}, 1.16, _d(4), _d(4))
    d2, d3, d4 = out["dias"]
    assert (d2["pago1"], d2["pago2"], d2["pago3"]) == (100, 200, 0)
    assert (d3["pago1"], d3["pago2"], d3["pago3"]) == (0, 0, 350)  # el 3.º y el 4.º caen en Pago 3
    assert d4["total"] == 0  # el cancelado no cuenta
    for d in out["dias"]:
        assert round(d["pago1"] + d["pago2"] + d["pago3"], 2) == d["total"]
    assert out["totales"]["total"] == 650


def test_cobros_diarios_sin_iva_y_diferencia_solo_con_poliza():
    out = construir_cobros_diarios([_res(_d(2), [2000], [(_d(2), 1160, False)])], {_d(2): 900.0}, 1.16, _d(3), _d(3))
    d2, d3 = out["dias"]
    assert d2["sin_iva"] == 1000 and d2["poliza"] == 900 and d2["diferencia"] == 100
    assert d3["poliza"] is None and d3["diferencia"] is None
    assert out["totales"]["poliza"] == 900 and out["totales"]["diferencia"] == 100 and out["totales"]["dias_con_poliza"] == 1


def test_cobros_diarios_reservas_al_dia_cambian_con_los_pagos():
    r = _res(_d(2), [1000, 1000], [(_d(4), 1000, False), (_d(5), 1000, False)])
    out = construir_cobros_diarios([r], {}, 1.16, _d(6), _d(6))
    res = {d["fecha"].day: {k: v for k, v in d["reservas"].items() if k != "tipos"} for d in out["dias"]}
    assert res[2] == {"pagadas": 0, "anticipos": 0, "sin_anticipo": 2, "cortesias": 0, "reservados": 2}
    assert res[4]["anticipos"] == 2 and res[4]["sin_anticipo"] == 0  # 1000 repartido: 500 y 500
    assert res[5] == {"pagadas": 2, "anticipos": 0, "sin_anticipo": 0, "cortesias": 0, "reservados": 2}


def test_cobros_diarios_cancelacion_quita_las_sillas_desde_su_fecha_y_cortesias():
    cancelada = _res(_d(2), [1000], cancelada=True, cancelado_en=_d(4))
    cortesia = _res(_d(3), [0])
    out = construir_cobros_diarios([cancelada, cortesia], {}, 1.16, _d(5), _d(5))
    res = {d["fecha"].day: d["reservas"] for d in out["dias"]}
    assert res[3]["reservados"] == 2 and res[3]["sin_anticipo"] == 1 and res[3]["cortesias"] == 1
    assert res[4]["reservados"] == 1 and res[4]["cortesias"] == 1  # ya cancelada el día 4


def test_cobros_diarios_hoy_y_por_cobrar():
    r = _res(_d(2), [1000, 1000], [(_d(3), 500, False)])
    out = construir_cobros_diarios([r], {}, 1.16, _d(9), _d(3))
    h = out["hoy"]
    assert h["fecha"] == _d(3) and h["es_hoy"] is True and h["cobrado_hoy"] == 500 and h["acumulado"] == 500
    assert h["por_cobrar"] == 1500 and h["reservas"]["reservados"] == 2
    assert construir_cobros_diarios([], {}, 1.16, None, _d(3))["dias"] == []


def test_resumen_cortesias_en_ocupacion_y_tarifas_suman_el_total():
    r = {
        "estado": "anticipo", "importe": 2000.0, "pagado": 500.0, "saldo": 1500.0,
        "sillas": [
            {"tipo": "adulto", "precio_aplicado": 1000.0, "preventa": True, "activa": True},
            {"tipo": "nino", "precio_aplicado": 500.0, "preventa": False, "activa": True},
            {"tipo": "cortesia", "precio_aplicado": 0.0, "preventa": False, "activa": True},
            {"tipo": "cortesia", "precio_aplicado": 0.0, "preventa": False, "activa": True},
        ],
    }
    res = construir_resumen([r], 100)
    assert (res["ocupacion"]["adultos"], res["ocupacion"]["ninos"], res["ocupacion"]["cortesias"]) == (1, 1, 2)
    assert res["ocupacion"]["ocupadas"] == 4 and res["ocupacion"]["disponibles"] == 96
    assert res["cortesias_tarifa"] == {"cantidad": 2, "importe": 0.0}
    en_tarifas = (
        res["preventa"]["adultos"]["cantidad"] + res["preventa"]["ninos"]["cantidad"]
        + res["normal"]["adultos"]["cantidad"] + res["normal"]["ninos"]["cantidad"]
        + res["cortesias_tarifa"]["cantidad"]
    )
    assert en_tarifas == res["reservas"]["total"] == 4  # preventa + normal + cortesías = boletos reservados


# --- un cobro con varias formas de pago es UN solo "Pago N" -------------------


def test_cobro_con_dos_formas_es_un_solo_pago_por_silla():
    sillas = [_s(1), _s(2), _s(3)]
    pagos = [
        {**_p(1, 837.5), "cobro_id": "c1", "forma_pago": "Efectivo"},
        {**_p(2, 1000.0), "cobro_id": "c1", "forma_pago": "Tarjeta"},
    ]
    r = repartir_pagos_por_silla(sillas, pagos)
    for i in (1, 2, 3):
        assert len(r[i]["pagos"]) == 1  # Pago 1 (no Pago 1 y Pago 2)
        assert r[i]["pagos"][0]["importe"] == pytest.approx(r[i]["pagado"])
        assert {x["forma_pago"] for x in r[i]["pagos"][0]["partes"]} == {"Efectivo", "Tarjeta"}
    assert sum(r[i]["pagado"] for i in (1, 2, 3)) == pytest.approx(1837.5)


def test_pagos_sin_cobro_id_siguen_siendo_pagos_distintos():
    r = repartir_pagos_por_silla([_s(1)], [{**_p(1, 300), "forma_pago": "Efectivo"}, {**_p(2, 200, dia=2), "forma_pago": "Tarjeta"}])
    assert len(r[1]["pagos"]) == 2


def test_cobros_diarios_cuenta_el_cobro_multiforma_como_pago_1():
    r = _res(_d(2), [3000], [(_d(2), 837.5, False), (_d(2), 1000.0, False), (_d(3), 500.0, False)])
    r["pagos"][0]["cobro_id"] = r["pagos"][1]["cobro_id"] = "c1"
    out = construir_cobros_diarios([r], {}, 1.16, _d(3), _d(3))
    dia2, dia3 = out["dias"][0], out["dias"][1]
    assert dia2["pago1"] == pytest.approx(1837.5) and dia2["pago2"] == 0
    assert dia3["pago2"] == pytest.approx(500.0)  # el siguiente cobro es el Pago 2


def test_cobros_diarios_muestra_el_tipo_de_boleto_vendido_cada_dia():
    r1 = _res(_d(2), [1000, 500, 0])
    for s, tipo in zip(r1["sillas"], ("adulto", "nino", "cortesia")):
        s["tipo"] = tipo
    r2 = _res(_d(3), [1000, 1000])
    for s in r2["sillas"]:
        s["tipo"] = "adulto"
    cancelada = _res(_d(3), [1000], cancelada=True, cancelado_en=_d(3))
    cancelada["sillas"][0]["tipo"] = "adulto"
    out = construir_cobros_diarios([r1, r2, cancelada], {}, 1.16, _d(3), _d(3))
    dia2, dia3 = out["dias"]
    assert dia2["vendidas"] == {"adulto": 1, "nino": 1, "cortesia": 1}
    assert dia3["vendidas"] == {"adulto": 2, "nino": 0, "cortesia": 0}  # la cancelada no cuenta
    assert dia3["reservas"]["tipos"] == {"adulto": 3, "nino": 1, "cortesia": 1}  # acumulado al día


def test_resumen_usa_el_estado_de_cada_silla_cuando_viene():
    sillas = [{"tipo": "adulto", "precio_aplicado": 2000, "preventa": True, "activa": True, "estado_pago": e} for e in ("pagada", "anticipo", "sin_pago")]
    res = construir_resumen([{"sillas": sillas, "importe": 6000, "pagado": 2500, "saldo": 3500, "estado": "anticipo"}], 100)
    assert (res["estado"]["pagadas"], res["estado"]["anticipos"], res["estado"]["sin_anticipo"]) == (1, 1, 1)


def test_resumen_sin_estado_por_silla_usa_el_de_la_reservacion():
    sillas = [{"tipo": "adulto", "precio_aplicado": 2000, "preventa": True, "activa": True} for _ in range(2)]
    res = construir_resumen([{"sillas": sillas, "importe": 4000, "pagado": 4000, "saldo": 0, "estado": "pagada"}], 100)
    assert res["estado"]["pagadas"] == 2


# --- Pagos por boleto de una edición anterior ---------------------------------


def test_resumir_pagos_historicos_anticipo_mas_liquidacion_es_un_boleto():
    boletos = [
        [(date(2025, 11, 5), 272.50), (date(2025, 12, 10), 817.50)],  # anticipo y liquidación
        [(date(2025, 12, 10), 1090.0)],  # pagado de contado
        [(date(2025, 12, 10), 1090.0)],
    ]
    out = resumir_pagos_historicos(boletos)
    assert out["boletos"] == 3 and out["cobrado"] == 272.50 + 817.50 + 2180
    nov5, dic10 = out["dias"][date(2025, 11, 5)], out["dias"][date(2025, 12, 10)]
    assert (nov5["reservados"], nov5["anticipos"], nov5["cobrado"]) == (1, 1, 272.50)
    # el 10/12 se reservaron 2 (los de contado); la liquidación es dinero, no una reserva nueva
    assert (dic10["reservados"], dic10["completos"], dic10["liquidaciones"], dic10["cobrado"]) == (2, 2, 1, 2997.50)


def test_resumir_pagos_historicos_lista_vacia():
    assert resumir_pagos_historicos([]) == {"dias": {}, "boletos": 0, "cobrado": 0.0}


def test_cobrado_por_tipo_reparte_cada_pago_entre_adulto_y_nino():
    r = _res(_d(2), [2000, 1000], [(_d(2), 1500, False), (_d(3), 1500, False)])
    r["sillas"][0]["tipo"], r["sillas"][1]["tipo"] = "adulto", "nino"
    out = construir_cobros_diarios([r], {}, 1.16, _d(3), _d(3))
    d2, d3 = out["dias"]
    # 1500 el día 2 se reparte proporcional al saldo (2000/1000) y el día 3 completa lo que falta
    assert d2["cobrado_por_tipo"]["adulto"] + d2["cobrado_por_tipo"]["nino"] == pytest.approx(1500)
    assert d2["cobrado_por_tipo"]["adulto"] == pytest.approx(1000) and d2["cobrado_por_tipo"]["nino"] == pytest.approx(500)
    assert d3["cobrado_por_tipo"]["adulto"] == pytest.approx(1000) and d3["cobrado_por_tipo"]["nino"] == pytest.approx(500)
    assert d2["cobrado_por_tipo"]["cortesia"] == 0
