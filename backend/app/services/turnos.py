"""
Clasificación de turno de comida (Desayuno/Comida/Cena) por hora del día.
Usado por Comandas Emitidas (que no trae su propio turno, solo `Hora` de
apertura de cuenta) — Recibos Emitidos, en cambio, ya trae su propio
`Turno` desde el POS y no pasa por aquí (ver `services/recibos_emitidos.py`).

Rangos confirmados con el usuario, sencillos de ajustar si cambian:
Desayuno 06:00–11:59, Comida 12:00–17:59, Cena 18:00–23:59. Una hora antes
de las 06:00 (madrugada) no cae en ningún rango — se clasifica como
"Sin Clasificar" en vez de fallar o descartar la fila, hasta que el usuario
decida qué hacer con esos casos (no se ha confirmado que existan en datos
reales todavía).
"""

from datetime import time

RANGOS_TURNO: list[tuple[str, time, time]] = [
    ("Desayuno", time(6, 0, 0), time(11, 59, 59)),
    ("Comida", time(12, 0, 0), time(17, 59, 59)),
    ("Cena", time(18, 0, 0), time(23, 59, 59)),
]

SIN_CLASIFICAR = "Sin Clasificar"


def clasificar_turno_por_hora(hora: time) -> str:
    for nombre, inicio, fin in RANGOS_TURNO:
        if inicio <= hora <= fin:
            return nombre
    return SIN_CLASIFICAR


# Turnos tal como los reporta el POS en Recibos Emitidos (confirmado contra
# archivo real: "DESAYUNO"/"COMIDA"/"CENA" en mayúsculas) -> nuestra propia
# capitalización, para que ambos archivos usen el mismo texto al filtrar en
# pantalla. Un valor que no aparezca aquí se deja tal cual (capitalizado),
# no se descarta ni se fuerza a "Sin Clasificar" — ese texto ya viene
# clasificado por el POS, distinto al caso de Comandas Emitidas de arriba.
_TURNOS_POS_CONOCIDOS = {
    "DESAYUNO": "Desayuno",
    "COMIDA": "Comida",
    "CENA": "Cena",
}


def normalizar_turno_pos(turno_crudo: str | None) -> str:
    if not turno_crudo:
        return SIN_CLASIFICAR
    texto = str(turno_crudo).strip()
    return _TURNOS_POS_CONOCIDOS.get(texto.upper(), texto.title())
