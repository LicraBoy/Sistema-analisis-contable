"""
Histórico de la edición 2025 de la Fiesta de Fin de Año, tomado de la hoja Cobros del Excel
(`docs/CROQUIS RESERV FIN DE AÑO 2026.xlsx`, bloque "RESERVAS 2025"): sillas acumuladas al cierre de cada
día que se capturó. Sirve para el comparativo "contra el año pasado" de Ventas. Solo son CANTIDADES de sillas
(no montos) y la serie es parcial: el comparativo usa la última fila anterior al mismo mes/día.

Orden de cada fila: (fecha, reservados, pagados, anticipos, sin_anticipo, cortesias).
Filas omitidas por captura incompleta en el Excel (reservados menor que el día previo): 2025-11-07
"""

from datetime import date

HISTORICO_2025: list[tuple[date, int, int, int, int, int]] = [
    (date(2025, 10, 16), 135, 0, 6, 129, 0),
    (date(2025, 10, 19), 142, 0, 10, 131, 1),
    (date(2025, 10, 20), 152, 10, 6, 135, 1),
    (date(2025, 10, 21), 152, 10, 6, 135, 1),
    (date(2025, 11, 6), 191, 25, 36, 130, 0),
    (date(2025, 11, 10), 259, 35, 78, 146, 0),
    (date(2025, 11, 11), 259, 35, 78, 146, 0),
    (date(2025, 11, 12), 265, 35, 99, 131, 0),
    (date(2025, 11, 13), 272, 35, 106, 131, 0),
    (date(2025, 11, 14), 276, 35, 110, 131, 0),
    (date(2025, 11, 15), 286, 45, 110, 131, 0),
    (date(2025, 11, 16), 289, 48, 110, 131, 0),
    (date(2025, 11, 17), 298, 50, 108, 140, 0),
    (date(2025, 11, 18), 309, 61, 108, 140, 0),
    (date(2025, 11, 19), 309, 61, 108, 140, 0),
    (date(2025, 11, 20), 321, 62, 108, 151, 0),
    (date(2025, 11, 23), 333, 75, 108, 150, 0),
    (date(2025, 11, 24), 337, 80, 108, 149, 0),
    (date(2025, 11, 26), 352, 96, 116, 140, 0),
    (date(2025, 11, 27), 359, 97, 122, 140, 0),
    (date(2025, 11, 28), 359, 97, 122, 140, 0),
    (date(2025, 12, 4), 403, 155, 113, 135, 0),
    (date(2025, 12, 7), 405, 169, 101, 135, 0),
    (date(2025, 12, 8), 434, 198, 101, 135, 0),
    (date(2025, 12, 9), 445, 284, 25, 136, 0),
    (date(2025, 12, 10), 588, 331, 0, 257, 0),
    (date(2025, 12, 15), 578, 375, 1, 202, 0),
    (date(2025, 12, 18), 584, 385, 1, 198, 0),
    (date(2025, 12, 20), 601, 390, 10, 201, 0),
    (date(2025, 12, 21), 614, 398, 12, 204, 0),
    (date(2025, 12, 22), 614, 398, 12, 204, 0),
    (date(2025, 12, 26), 645, 406, 21, 218, 0),
    (date(2025, 12, 28), 614, 445, 25, 144, 0),
    (date(2025, 12, 29), 647, 472, 13, 162, 0),
    (date(2025, 12, 30), 635, 595, 0, 0, 40),
    (date(2025, 12, 31), 636, 596, 0, 0, 40),
]

HISTORICO: dict[int, list[tuple[date, int, int, int, int, int]]] = {2025: HISTORICO_2025}
