"""
Regresión para services/rangos_fecha.py — protege el cálculo de "periodo
anterior" que ahora comparten resumen_ejecutivo.py, ranking_productos.py,
oportunidades_comerciales.py y alertas_riesgo.py:

- Un mes calendario completo cae en el mes calendario anterior, no en
  "los mismos N días antes" (que antes desalineaba el rango).
- Un rango arbitrario (no mes completo) conserva el criterio original de
  conteo de días, sin romper nada que ya dependa de eso.
- Casos de borde: enero -> diciembre del año anterior; meses de distinta
  longitud; 29 de febrero al comparar contra el año anterior.
"""

from datetime import date

from app.services.rangos_fecha import (
    es_mes_calendario_completo,
    mismo_periodo_anio_anterior,
    periodo_anterior,
)


def test_es_mes_calendario_completo_true_para_mes_exacto():
    assert es_mes_calendario_completo(date(2026, 9, 1), date(2026, 9, 30)) is True


def test_es_mes_calendario_completo_false_para_rango_arbitrario():
    assert es_mes_calendario_completo(date(2026, 9, 5), date(2026, 9, 30)) is False
    assert es_mes_calendario_completo(date(2026, 9, 1), date(2026, 9, 29)) is False


def test_periodo_anterior_mes_completo_cae_en_mes_calendario_anterior():
    desde, hasta = periodo_anterior(date(2026, 9, 1), date(2026, 9, 30))
    assert (desde, hasta) == (date(2026, 8, 1), date(2026, 8, 31))


def test_periodo_anterior_enero_cae_en_diciembre_del_anio_pasado():
    desde, hasta = periodo_anterior(date(2026, 1, 1), date(2026, 1, 31))
    assert (desde, hasta) == (date(2025, 12, 1), date(2025, 12, 31))


def test_periodo_anterior_marzo_31_dias_cae_en_febrero_28_dias():
    desde, hasta = periodo_anterior(date(2026, 3, 1), date(2026, 3, 31))
    assert (desde, hasta) == (date(2026, 2, 1), date(2026, 2, 28))


def test_periodo_anterior_rango_arbitrario_usa_conteo_de_dias():
    # Rango de 1 día (no un mes completo) -> mismo criterio de antes.
    desde, hasta = periodo_anterior(date(2026, 9, 10), date(2026, 9, 10))
    assert (desde, hasta) == (date(2026, 9, 9), date(2026, 9, 9))


def test_mismo_periodo_anio_anterior_resta_un_anio():
    desde, hasta = mismo_periodo_anio_anterior(date(2026, 9, 1), date(2026, 9, 30))
    assert (desde, hasta) == (date(2025, 9, 1), date(2025, 9, 30))


def test_mismo_periodo_anio_anterior_29_febrero_cae_en_28():
    desde, hasta = mismo_periodo_anio_anterior(date(2028, 2, 29), date(2028, 2, 29))
    assert (desde, hasta) == (date(2027, 2, 28), date(2027, 2, 28))
