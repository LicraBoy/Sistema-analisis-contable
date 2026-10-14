"""
Helpers puros de aritmética de fechas para "periodo anterior", compartidos
por los routers de Análisis y Profundidad (`resumen_ejecutivo.py`,
`ranking_productos.py`, `oportunidades_comerciales.py`, `alertas_riesgo.py`).

Antes cada router calculaba su "periodo anterior" contando días (misma
cantidad de días, inmediatamente antes) — funcionaba bien con un rango
arbitrario, pero desde que el frontend siempre manda un mes calendario
completo esa cuenta ya no cae en el mes calendario anterior (ej. 30 días
atrás desde el 1 de septiembre cae en el 2 de agosto, no en el 1). Este
módulo corrige ese caso sin perder el comportamiento anterior para cualquier
otro rango (incluidos los que ya usan los tests existentes).
"""

import calendar
from datetime import date, timedelta


def es_mes_calendario_completo(fecha_desde: date, fecha_hasta: date) -> bool:
    """`fecha_desde`/`fecha_hasta` son exactamente el primer y último día del mismo mes calendario."""
    ultimo_dia = calendar.monthrange(fecha_desde.year, fecha_desde.month)[1]
    return fecha_desde.day == 1 and fecha_hasta == date(fecha_desde.year, fecha_desde.month, ultimo_dia)


def periodo_anterior(fecha_desde: date, fecha_hasta: date) -> tuple[date, date]:
    """
    Si el rango es un mes calendario completo, regresa el mes calendario
    inmediatamente anterior (respeta meses de distinta longitud: de marzo
    completo cae en febrero completo, no en "los mismos 31 días antes").
    Si no, conserva el criterio original: misma cantidad de días,
    inmediatamente antes de `fecha_desde`.
    """
    if es_mes_calendario_completo(fecha_desde, fecha_hasta):
        ultimo_dia_anterior = fecha_desde - timedelta(days=1)
        return ultimo_dia_anterior.replace(day=1), ultimo_dia_anterior

    dias_rango = (fecha_hasta - fecha_desde).days + 1
    fecha_hasta_anterior = fecha_desde - timedelta(days=1)
    fecha_desde_anterior = fecha_hasta_anterior - timedelta(days=dias_rango - 1)
    return fecha_desde_anterior, fecha_hasta_anterior


def mismo_periodo_anio_anterior(fecha_desde: date, fecha_hasta: date) -> tuple[date, date]:
    """Mismo rango, un año antes. El único caso irregular (29 de febrero) cae en 28 en vez de tronar."""

    def _un_anio_antes(f: date) -> date:
        try:
            return f.replace(year=f.year - 1)
        except ValueError:
            return f.replace(year=f.year - 1, day=28)

    return _un_anio_antes(fecha_desde), _un_anio_antes(fecha_hasta)
