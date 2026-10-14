"""
Venta neta canónica de Recibos Emitidos (Restaurante, "Análisis y Profundidad").

Definición contable acordada con el usuario (contraloría): **venta neta =
subtotal − descuento, solo de cuentas comerciales (`tipo` HOTEL)**, sin IVA
(`tax`) ni propina. Antes los paneles sumaban `total`, que incluye IVA y
propina (≈12% cada uno) y también cuentas que no son venta real:
- `tipo = CORTESIA` (cortesías y consumos de departamento),
- `tipo = AL COSTO` (consumo a costo),
- cuentas HOTEL cuyo `segmento` es consumo interno (`CONS ...`/`COSTO ...`).

Verificado con datos reales: `total = subtotal + tax + propina − descuento`
(residuo exacto). Servicio puro (sin DB); recibe modelos ya cargados.

`TUSOSA` (segmento de ~$0.7M en 4 meses) se deja como comercial: no se sabe
si es parte relacionada, así que el resumen lo desglosa en `por_segmento`
para que contraloría lo confirme, sin clasificarlo por suposición.
"""

from collections import defaultdict

COMERCIAL = "comercial"
CORTESIA = "cortesia"
AL_COSTO = "al_costo"
CONSUMO_INTERNO = "consumo_interno"
OTRO = "otro"

_PREFIJOS_CONSUMO_INTERNO = ("CONS", "COSTO")


def clasificar_recibo(recibo) -> str:
    tipo = (recibo.tipo or "").strip().upper()
    if tipo == "CORTESIA":
        return CORTESIA
    if tipo == "AL COSTO":
        return AL_COSTO
    if tipo != "HOTEL":
        return OTRO
    segmento = (recibo.segmento or "").strip().upper()
    if segmento.startswith(_PREFIJOS_CONSUMO_INTERNO):
        return CONSUMO_INTERNO
    return COMERCIAL


def monto_neto(recibo) -> float:
    """Subtotal menos descuento: la base sin IVA ni propina de una cuenta."""
    return recibo.subtotal - recibo.descuento


def venta_neta_de(recibos: list) -> float:
    return round(sum(monto_neto(r) for r in recibos if clasificar_recibo(r) == COMERCIAL), 2)


def resumir_ventas(recibos: list) -> dict:
    """
    Desglose completo para contraloría. Todo en pesos sin IVA ni propina salvo
    `iva`/`propina` (que se reportan aparte). Los montos no comerciales son
    `subtotal − descuento` de esas cuentas (a precio de lista menos descuento).
    """
    monto = {COMERCIAL: 0.0, CORTESIA: 0.0, AL_COSTO: 0.0, CONSUMO_INTERNO: 0.0, OTRO: 0.0}
    cuentas = {clave: 0 for clave in monto}
    iva = propina = descuento = 0.0
    cuentas_con_descuento = 0
    por_segmento: dict[str, float] = defaultdict(float)

    for r in recibos:
        categoria = clasificar_recibo(r)
        monto[categoria] += monto_neto(r)
        cuentas[categoria] += 1
        if categoria == COMERCIAL:
            iva += r.tax
            propina += r.propina
            descuento += r.descuento
            if r.descuento > 0:
                cuentas_con_descuento += 1
            por_segmento[(r.segmento or "Sin segmento").strip()] += monto_neto(r)

    venta_neta = round(monto[COMERCIAL], 2)
    return {
        "venta_neta": venta_neta,
        "cuentas_comerciales": cuentas[COMERCIAL],
        "iva": round(iva, 2),
        "propina": round(propina, 2),
        "propina_pct_venta_neta": round(propina / venta_neta * 100, 1) if venta_neta else None,
        "descuento": round(descuento, 2),
        "cuentas_con_descuento": cuentas_con_descuento,
        "descuento_pct_venta_bruta": (
            round(descuento / (venta_neta + descuento) * 100, 1) if (venta_neta + descuento) else None
        ),
        "no_comercial": {
            "cortesia": {"monto": round(monto[CORTESIA], 2), "cuentas": cuentas[CORTESIA]},
            "al_costo": {"monto": round(monto[AL_COSTO], 2), "cuentas": cuentas[AL_COSTO]},
            "consumo_interno": {"monto": round(monto[CONSUMO_INTERNO], 2), "cuentas": cuentas[CONSUMO_INTERNO]},
            "otro": {"monto": round(monto[OTRO], 2), "cuentas": cuentas[OTRO]},
        },
        "por_segmento": [
            {"segmento": segmento, "venta_neta": round(valor, 2)}
            for segmento, valor in sorted(por_segmento.items(), key=lambda kv: -kv[1])
        ],
    }
