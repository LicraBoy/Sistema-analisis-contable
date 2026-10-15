"""
Pagos por boleto de la edición 2025 de la Fiesta de Fin de Año (lista de boletos con su fecha y monto, tomada de la
captura que compartió el usuario). Sirve para el comparativo "día a día" de Resumen y de Cobros: cuántos boletos se
reservaron cada día y cuánto dinero entró.

Un boleto es una lista de pagos `(fecha, importe)`:
- un solo pago por el precio completo (1,090.00 en niños) = pagado de contado ese día;
- un pago menor (anticipo, p. ej. 272.50) seguido de otro con el resto (817.50) = anticipo y liquidación.
El boleto cuenta como RESERVADO el día de su primer pago.

⚠️ Niños: transcritos de una foto: son 42 boletos contra los 43 niños que dice el Resumen del Excel de 2025. Falta
confirmar con quien captura cuál es el renglón que no se alcanzó a leer (probablemente un 10/12/2025).
Adultos: ver `ADULTOS_2025_POR_DIA` (solo cantidad por día). Las cortesías no tienen fecha (se conocen solo en total).
"""

from datetime import date

Pago = tuple[date, float]
Boleto = list[Pago]

_NINO = 1090.0


def _completo(fecha: date, veces: int = 1) -> list[Boleto]:
    return [[(fecha, _NINO)] for _ in range(veces)]


def _anticipo(fecha: date, anticipo: float, liquidacion_fecha: date, resto: float) -> Boleto:
    return [(fecha, anticipo), (liquidacion_fecha, resto)]


_L10_12 = date(2025, 12, 10)

NINOS_2025: list[Boleto] = [
    *_completo(date(2025, 12, 18)),
    _anticipo(date(2025, 11, 5), 272.50, _L10_12, 817.50),
    *_completo(date(2025, 11, 7), 3),
    _anticipo(date(2025, 11, 11), 272.50, _L10_12, 817.50),
    *_completo(date(2025, 11, 25), 2),
    *_completo(date(2025, 11, 26)),
    *_completo(date(2025, 12, 4)),
    _anticipo(date(2025, 12, 9), 272.50, _L10_12, 817.50),
    *_completo(date(2025, 12, 9), 2),
    *_completo(_L10_12, 17),
    *_completo(date(2025, 12, 20), 4),
    *_completo(date(2025, 12, 21)),
    *_completo(date(2025, 12, 24)),
    *_completo(date(2025, 12, 25)),
    *_completo(date(2025, 12, 30)),
    *_completo(date(2025, 12, 31), 4),
]

# Adultos 2025: solo la CANTIDAD por día (no el dinero: la lista traía hasta 3 pagos por boleto, con montos y fechas que no
# se suman). Día del boleto = la fecha más temprana de sus pagos; se cuadró contra el histórico (12/10: +143 reservados
# = 123 adultos + 17 niños + cortesías; 09/12: +86 pagados = 90 adultos). Transcrito por OCR de la lista
# "pago 1 / pago 2 / pago 3" (552 filas): 547 con fecha; las 5 sin ninguna fecha son cortesías y no van aquí.
ADULTOS_2025_POR_DIA: list[tuple[date, int]] = [
    (date(2025, 10, 16), 6),
    (date(2025, 10, 18), 6),
    (date(2025, 10, 20), 4),
    (date(2025, 10, 23), 12),
    (date(2025, 10, 25), 10),
    (date(2025, 10, 28), 4),
    (date(2025, 11, 1), 4),
    (date(2025, 11, 4), 2),
    (date(2025, 11, 5), 6),
    (date(2025, 11, 6), 6),
    (date(2025, 11, 7), 35),
    (date(2025, 11, 9), 8),
    (date(2025, 11, 10), 4),
    (date(2025, 11, 11), 5),
    (date(2025, 11, 12), 1),
    (date(2025, 11, 13), 21),
    (date(2025, 11, 14), 4),
    (date(2025, 11, 15), 10),
    (date(2025, 11, 16), 6),
    (date(2025, 11, 18), 10),
    (date(2025, 11, 20), 1),
    (date(2025, 11, 22), 4),
    (date(2025, 11, 23), 5),
    (date(2025, 11, 24), 9),
    (date(2025, 11, 25), 16),
    (date(2025, 11, 26), 5),
    (date(2025, 11, 27), 7),
    (date(2025, 11, 29), 5),
    (date(2025, 12, 1), 24),
    (date(2025, 12, 2), 6),
    (date(2025, 12, 3), 21),
    (date(2025, 12, 4), 24),
    (date(2025, 12, 6), 6),
    (date(2025, 12, 7), 8),
    (date(2025, 12, 8), 29),
    (date(2025, 12, 9), 90),
    (date(2025, 12, 10), 123),
]

# Boletos de adulto sin monto (importe 0): solo cuentan como reservados ese día.
ADULTOS_2025: list[Boleto] = [[(f, 0.0)] for f, n in ADULTOS_2025_POR_DIA for _ in range(n)]

HISTORICO_PAGOS: dict[int, dict[str, list[Boleto]]] = {
    2025: {"nino": NINOS_2025, "adulto": ADULTOS_2025},
}

# Tipos de los que sí se conoce el dinero por boleto (adultos: solo cantidad).
TIPOS_CON_DINERO = {"nino"}

# Cuántos niños dice el Resumen del Excel de 2025 (para avisar si la lista no cuadra).
NINOS_ESPERADOS = {2025: 43}
