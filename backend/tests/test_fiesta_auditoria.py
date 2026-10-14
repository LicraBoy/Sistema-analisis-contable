"""Auditoría de la Fiesta: clasificación de movimientos y serialización (funciones puras)."""

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.fiesta_auditoria import GRUPOS, clasificar, fila_a_dict, pares_de_grupo


def _b(**kw):
    base = dict(
        id=1, accion="pago", entidad="reservacion", entidad_id=21, usuario="Sofia", usuario_id=3,
        detalle="Luis Jose: $1,000.00 (Tarjeta)", reservacion_id=21, cliente="Luis Jose", mesa=12,
        antes=None, despues='{"importe": 1000.0}', ip="10.10.1.5", creado_en=datetime(2026, 10, 14, 15, 0, tzinfo=timezone.utc),
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_cobros_y_cancelaciones_se_clasifican():
    assert clasificar("pago", "reservacion") == ("cobros", "Cobro registrado")
    assert clasificar("editar_pago", "pago")[0] == "cobros"
    assert clasificar("cancelar_pago", "pago")[0] == "cancelaciones"
    assert clasificar("cancelar", "reservacion")[0] == "cancelaciones"


def test_actualizar_depende_de_la_entidad():
    assert clasificar("actualizar", "precios")[0] == "precios"
    assert clasificar("actualizar", "evento")[0] == "configuracion"
    assert clasificar("actualizar", "mesa")[0] == "configuracion"


def test_accion_desconocida_no_rompe():
    grupo, etiqueta = clasificar("algo_nuevo", "x")
    assert grupo == "configuracion" and etiqueta == "Algo nuevo"


def test_todos_los_grupos_tienen_acciones():
    for g in GRUPOS:
        assert pares_de_grupo(g), g


def test_fila_a_dict_parsea_json_y_separa_quien_autorizo():
    d = fila_a_dict(_b(detalle="mesa 3 silla 2: $2,450.00 → $1,000.00 · autorizó: supervisor1", antes='{"precio": 2450}'))
    assert d["autorizo"] == "supervisor1" and d["detalle"].endswith("$1,000.00")
    assert d["antes"] == {"precio": 2450} and d["despues"] == {"importe": 1000.0}
    assert d["etiqueta"] == "Cobro registrado" and d["grupo_etiqueta"] == "Cobros"
    assert d["cliente"] == "Luis Jose" and d["mesa"] == 12 and d["reservacion_id"] == 21


def test_fila_vieja_sin_campos_nuevos():
    d = fila_a_dict(_b(usuario_id=None, reservacion_id=None, cliente=None, mesa=None, antes=None, despues=None, ip=None))
    assert d["cliente"] == "" and d["antes"] is None and d["despues"] is None and d["ip"] == ""
