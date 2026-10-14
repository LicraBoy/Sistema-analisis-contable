"""
Regresión: aplicar un egreso (nota de crédito) sobre una factura PPD no debe
fabricar un Traslado IVA que no existe en el CFDI ni en la nota de crédito.

Caso real que motivó esta prueba (SIGMA FOODSERVICE COMERCIAL): el egreso se
restaba dos veces — una de DEBE(MONTO TOTAL DE LA FACTURA) y otra de
Total/Total MXN — lo que abría una diferencia artificial contra DEBE y
disparaba la recalculación de PPD, fabricando un IVA de $4,772.42 sobre una
factura cuyo Traslado IVA real es $0.00. Si alguien reintroduce esa resta
doble, el primer test de este archivo debe fallar.
"""

from datetime import date

import pytest

from app.api.pagos import _construir_filas_amarre
from app.models import CfdiIngreso, Pago
from app.models.pago import EstadoPago

UUID_SIGMA = "9e74be90-3b14-404e-9a62-7dc1c5ccdf3d"


def _datos_extra_cfdi(total: float, traslado_iva: float) -> dict:
    subtotal = total - traslado_iva
    return {
        "Emisor": "SIGMA FOODSERVICE COMERCIAL",
        "Método de pago": "PPD",
        "Total": total,
        "Total MXN": total,
        "Subtotal": subtotal,
        "Subtotal MXN": subtotal,
        "Total descuento": 0.0,
        "Total descuento MXN": 0.0,
        "Neto": subtotal,
        "Neto MXN": subtotal,
        "Traslado IVA": traslado_iva,
        "Traslado IVA MXN": traslado_iva,
        "Retención IVA": 0.0,
        "Retención IVA MXN": 0.0,
        "Retención ISR": 0.0,
        "Retención ISR MXN": 0.0,
        "Tipo cambio": 1.0,
    }


@pytest.mark.anyio
async def test_egreso_ppd_no_fabrica_iva_fantasma(db_session):
    ingreso = CfdiIngreso(
        uuid=UUID_SIGMA,
        rfc_emisor="CNO930113K12",
        nombre_emisor="SIGMA FOODSERVICE COMERCIAL",
        datos_extra=_datos_extra_cfdi(total=47200.00, traslado_iva=0.0),
    )
    pago = Pago(
        tipo_movimiento="Pago",
        fecha=date(2026, 8, 19),
        factura="8562535338",
        uuid=UUID_SIGMA,
        estado=EstadoPago.ENCONTRADO,
        # "8" = monto ya registrado por el usuario, neto de la nota de
        # crédito (47200.00 - 6299.98 = 40900.02) — como en el caso real.
        datos_extra={"8": "40900.02"},
    )
    db_session.add_all([ingreso, pago])
    await db_session.commit()

    egresos = [{
        "uuid": UUID_SIGMA,
        "Total": 6299.98,
        "Subtotal": 6299.98,
        "Neto": 6299.98,
        "Total descuento": 0.0,
        "Retención IVA": 0.0,
        "Retención ISR": 0.0,
        "Traslado IVA": 0.0,
    }]

    _, filas_amarre_principal, _, _, _, _, _, _ = await _construir_filas_amarre(
        db_session, egresos=egresos,
    )

    assert len(filas_amarre_principal) == 1
    fila = filas_amarre_principal[0]

    assert fila["DEBE(MONTO TOTAL DE LA FACTURA)"] == pytest.approx(40900.02), (
        "DEBE no debe tocarse por el egreso: ya viene neto de la nota de crédito"
    )
    assert fila["Total MXN"] == pytest.approx(40900.02), "Total MXN sí debe reducirse por el egreso"
    assert fila["Traslado IVA MXN"] == pytest.approx(0.0, abs=0.01), (
        "IVA fantasma detectado: el egreso no debe disparar una recalculación "
        "PPD que invente un Traslado IVA inexistente"
    )


@pytest.mark.anyio
async def test_ppd_genuino_sin_egresos_sigue_recalculando(db_session):
    """Un PPD real (pago parcial, sin egresos) debe seguir ajustando el IVA proporcionalmente."""
    uuid_ppd = "11111111-2222-3333-4444-555555555555"
    ingreso = CfdiIngreso(
        uuid=uuid_ppd,
        rfc_emisor="XXX010101ABC",
        nombre_emisor="PROVEEDOR DE PRUEBA",
        datos_extra=_datos_extra_cfdi(total=31950.00, traslado_iva=4406.90),
    )
    pago = Pago(
        tipo_movimiento="Pago",
        fecha=date(2026, 3, 27),
        factura="TEST-PPD",
        uuid=uuid_ppd,
        estado=EstadoPago.ENCONTRADO,
        datos_extra={"8": "25500"},  # parcialidad real, menor al Total
    )
    db_session.add_all([ingreso, pago])
    await db_session.commit()

    _, filas_amarre_principal, _, _, _, _, _, _ = await _construir_filas_amarre(
        db_session, egresos=None,
    )

    assert len(filas_amarre_principal) == 1
    fila = filas_amarre_principal[0]

    assert fila["DEBE(MONTO TOTAL DE LA FACTURA)"] == 25500
    assert fila["Total MXN"] == 25500, "el PPD debe recalcular Total MXN al monto realmente pagado"
    esperado = 25500 - 25500 / 1.16
    assert fila["Traslado IVA MXN"] == pytest.approx(esperado, abs=0.01)
