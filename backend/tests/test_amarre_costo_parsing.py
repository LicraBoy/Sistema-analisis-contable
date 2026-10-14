"""
Tests del parsing de Amarre de Costo de Ventas — construyen workbooks
sintéticos en memoria (openpyxl) para probar que los parsers ubican sus
totales por TEXTO de etiqueta, no por número de fila fijo (el requisito
central del módulo: el reporte real cambia de tamaño cada mes). Además,
valida los parsers contra los 12 archivos reales de agosto 2026 en
`INVETARIOS/` cuando están disponibles (fixtures de integración) — es la
única forma de blindar el parser contra la variabilidad real del reporte
Novohit.
"""

from io import BytesIO
from pathlib import Path

import pytest
from openpyxl import Workbook

from app.services.amarre_costo_parsing import (
    AJUSTE_REDONDEO_CAFETERIA_ALIMENTOS,
    CATEGORIAS_ALM_GRAL,
    CATEGORIAS_CAFETERIA,
    CATEGORIAS_COMPUESTAS_ALM_GRAL,
    CATEGORIAS_COMPUESTAS_CAFETERIA,
    CATEGORIAS_COMPUESTAS_TIENDA,
    CATEGORIAS_TIENDA,
    _a_numero,
    _es_total_nivel1,
    _totales_nivel1,
    buscar_en_balanza,
    parsear_balanza,
    parsear_conteo_fisico,
    parsear_entradas,
    parsear_salidas_almacen_general,
    parsear_salidas_mantenimiento,
)

CARPETA_MUESTRA = Path(__file__).resolve().parents[2] / "INVETARIOS"


def _leer_muestra(nombre: str) -> bytes:
    return (CARPETA_MUESTRA / nombre).read_bytes()


def _sin_muestras() -> bool:
    return not CARPETA_MUESTRA.exists()


requiere_muestras = pytest.mark.skipif(_sin_muestras(), reason="Carpeta INVETARIOS/ no disponible en este entorno")


def _workbook_bytes(filas: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for fila in filas:
        ws.append(fila)
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ── Utilidades de texto/número ──────────────────────────────────────────


def test_a_numero_texto_con_comas():
    assert _a_numero("1,234.56") == 1234.56
    assert _a_numero("$1,234.56") == 1234.56
    assert _a_numero(None) == 0.0
    assert _a_numero("") == 0.0
    assert _a_numero(42.5) == 42.5


def test_es_total_nivel1_distingue_por_espacio_no_rompible():
    assert _es_total_nivel1("TOTAL TABAQUERIA") is True
    assert _es_total_nivel1("\xa0TOTAL CIGARROS\xa0") is False
    assert _es_total_nivel1("ALGO MAS") is False


def test_totales_nivel1_no_confunde_subcategoria_duplicada_con_categoria():
    """
    Caso de regresión de un bug real: si el texto se le pasa a
    `_es_total_nivel1` ya con `.strip()` aplicado, el espacio-no-rompible
    que distingue subcategoría de categoría se pierde y se suman ambas por
    error. Aquí "TOTAL EQUIPO" aparece 2 veces: una subcategoría (con
    \\xa0, no debe contar) y una categoría real (sin \\xa0, sí debe
    contar) — el resultado debe ser SOLO el de la categoría real.
    """
    filas: list[list] = [[""] * 31 for _ in range(10)]
    filas[2][19] = "\xa0TOTAL EQUIPO\xa0"  # subcategoría — no debe contar
    filas[2][29] = "999.00"
    filas[5][19] = "TOTAL EQUIPO"  # categoría real — sí debe contar
    filas[5][29] = "100.00"
    resultado = _totales_nivel1(filas)
    assert resultado["EQUIPO"] == pytest.approx(100.00)


# ── Conteo físico: no depende del número de fila ────────────────────────


def _conteo_fisico_sintetico(fila_tabaqueria: int) -> bytes:
    filas: list[list] = [[""] * 31 for _ in range(fila_tabaqueria + 5)]
    filas[fila_tabaqueria][19] = "TOTAL TABAQUERIA"
    filas[fila_tabaqueria][29] = "16,189.85"
    filas[fila_tabaqueria + 2][19] = "TOTAL ALIMENTOS"
    filas[fila_tabaqueria + 2][29] = "1,000.00"
    filas[fila_tabaqueria + 3][19] = "TOTAL ALIMENTOS"  # segunda ocurrencia: debe sumarse, no reemplazar
    filas[fila_tabaqueria + 3][29] = "500.00"
    return _workbook_bytes(filas)


def test_conteo_fisico_no_depende_de_numero_de_fila():
    """
    Mismo contenido, filas totalmente distintas entre 'meses' — el
    resultado no debe cambiar (requisito central: el reporte real cambia de
    tamaño cada mes según cuántos artículos se contaron).
    """
    resultado_mes1 = parsear_conteo_fisico(
        _conteo_fisico_sintetico(fila_tabaqueria=10), "mes1.xlsx", CATEGORIAS_ALM_GRAL, CATEGORIAS_COMPUESTAS_ALM_GRAL
    )
    resultado_mes2 = parsear_conteo_fisico(
        _conteo_fisico_sintetico(fila_tabaqueria=500), "mes2.xlsx", CATEGORIAS_ALM_GRAL, CATEGORIAS_COMPUESTAS_ALM_GRAL
    )
    assert resultado_mes1 == resultado_mes2
    assert resultado_mes1["tabaqueria"] == 16189.85


def test_conteo_fisico_suma_ocurrencias_repetidas_de_una_categoria():
    resultado = parsear_conteo_fisico(
        _conteo_fisico_sintetico(fila_tabaqueria=10), "mes.xlsx", CATEGORIAS_ALM_GRAL, CATEGORIAS_COMPUESTAS_ALM_GRAL
    )
    assert resultado["alimentos"] == 1500.0  # 1,000.00 + 500.00, no solo la última


def test_conteo_fisico_categoria_ausente_no_falla():
    """Cafetería sin línea de 'Bebidas': el parser no debe fallar, solo omitir esa categoría."""
    filas = [[""] * 31 for _ in range(5)]
    filas[2][19] = "TOTAL ALIMENTOS"
    filas[2][29] = "20,000.00"
    resultado = parsear_conteo_fisico(_workbook_bytes(filas), "cafeteria.xlsx", {"ALIMENTOS": "alimentos"}, None)
    assert resultado == {"alimentos": 20000.0}


# ── Balanza ──────────────────────────────────────────────────────────────


def test_parsear_balanza_cuenta_en_cero_no_lanza():
    filas = [
        ["Código Cuenta", "Descripción", "Saldo Ant", "Débitos Mes", "Créditos Mes", "Saldo Mes", "Saldo Actual"],
        ["1007101", "ALM GENERAL", 2689006.89, 0, 0, 0, 1978902.80],
    ]
    balanza = parsear_balanza(_workbook_bytes(filas), "balanza.xlsx")
    assert buscar_en_balanza("1007101", balanza, "saldo_anterior") == 2689006.89
    # Cuenta ausente (saldo $0, no aparece en el reporte) -> respaldo, no excepción.
    assert buscar_en_balanza("9999999", balanza, "saldo_anterior", respaldo=0.0) == 0.0


# ── Entradas ────────────────────────────────────────────────────────────


def test_parsear_entradas_toma_las_ultimas_4_columnas_numericas():
    filas = [[""] * 16 for _ in range(3)]
    filas[2][10] = "TOTAL GENERAL DE ENTRADAS"
    filas[2][11] = 1509472.41
    filas[2][12] = 0.0
    filas[2][13] = 133460.21
    filas[2][14] = 1642932.62
    resultado = parsear_entradas(_workbook_bytes(filas), "entradas.xlsx")
    assert resultado == {"subtotal": 1509472.41, "descuento": 0.0, "iva": 133460.21, "total": 1642932.62}


def test_parsear_entradas_sin_etiqueta_regresa_ceros():
    resultado = parsear_entradas(_workbook_bytes([["nada aquí"]]), "vacio.xlsx")
    assert resultado == {"subtotal": 0.0, "descuento": 0.0, "iva": 0.0, "total": 0.0}


# ── Integración contra archivos reales (agosto 2026) ────────────────────


@requiere_muestras
def test_balanza_real():
    balanza = parsear_balanza(_leer_muestra("1balanza.xlsx"), "1balanza.xlsx")
    assert buscar_en_balanza("1007101", balanza, "saldo_anterior") == pytest.approx(2689006.89)
    assert buscar_en_balanza("1007103.001", balanza, "saldo_anterior") == pytest.approx(108316.84)


@requiere_muestras
def test_conteo_alm_gral_real():
    resultado = parsear_conteo_fisico(
        _leer_muestra("almacen general agosto 2026.xls"), "almacen general agosto 2026.xls",
        CATEGORIAS_ALM_GRAL, CATEGORIAS_COMPUESTAS_ALM_GRAL,
    )
    assert resultado["tabaqueria"] == pytest.approx(16189.85)
    assert resultado["papeleria"] == pytest.approx(77288.81)
    assert resultado["stock_mantenimiento"] == pytest.approx(59006.55)
    assert resultado["alimentos"] == pytest.approx(1437323.07)
    assert resultado["bebidas"] == pytest.approx(389094.52)
    # "Ropa y Uniformes" se alimenta de la etiqueta Novohit "SOUVENIRS  Y
    # CAFE EN GRANO" (no de "ROPA ALMACEN") — ver CATEGORIAS_ALM_GRAL.
    assert resultado["ropa_uniformes"] == pytest.approx(27003.39)
    # Ambas dependen del fix del bug de nivel 1 (ver
    # test_totales_nivel1_no_confunde_subcategoria_duplicada_con_categoria):
    # sin el fix, "EQUIPO DE OPERACION" sumaba sus 7 ocurrencias (6 de ellas
    # subcategoría) y daba 68,715.41 en vez de 9,603.45.
    assert resultado["material_mantto"] == pytest.approx(9603.45)
    assert resultado["higienicos"] == pytest.approx(474707.95)


@requiere_muestras
def test_conteo_tienda_artesanias_usa_etiqueta_especifica():
    """
    'ARTESANIAS' a secas aparece más de una vez en el reporte (suma de
    más); la etiqueta específica 'ARTESANIAS DIVERSAS GRAVADOS' es la que
    reproduce el monto real de la cuenta contable.
    """
    resultado = parsear_conteo_fisico(
        _leer_muestra("ALMACEN tienda la hacienda.xls"), "ALMACEN tienda la hacienda.xls",
        CATEGORIAS_TIENDA, CATEGORIAS_COMPUESTAS_TIENDA,
    )
    assert resultado["artesanias"] == pytest.approx(24969.34)


@requiere_muestras
def test_conteo_cafeteria_alimentos_incluye_bebidas_y_ajuste():
    """
    Cafetería no tiene cuenta de 'Bebidas' propia: ese monto se registra
    dentro de 'Alimentos', más un ajuste de redondeo de +0.01 confirmado
    en el libro maestro real (`AD426=AD321+AD391+AD417+0.01`).
    """
    resultado = parsear_conteo_fisico(
        _leer_muestra("almacen de cafeteria.xls"), "almacen de cafeteria.xls",
        CATEGORIAS_CAFETERIA, CATEGORIAS_COMPUESTAS_CAFETERIA,
    )
    alimentos_con_ajuste = resultado["alimentos"] + AJUSTE_REDONDEO_CAFETERIA_ALIMENTOS
    assert alimentos_con_ajuste == pytest.approx(20989.47)
    assert resultado["souvenirs"] == pytest.approx(4829.0)


@requiere_muestras
def test_salidas_almacen_general_real():
    resultado = parsear_salidas_almacen_general(
        _leer_muestra("salidas de almacen general.xls"), "salidas de almacen general.xls"
    )
    assert resultado["despacho_gasto"] == pytest.approx(1708188.40)
    assert resultado["despacho_centro_costo"] == pytest.approx(761863.73)
    assert resultado["entrysal_restaurant"] == pytest.approx(324344.77)
    assert resultado["entrysal_souvenirs_cafe"] == pytest.approx(1111.76)


@requiere_muestras
def test_salidas_mantenimiento_real():
    assert parsear_salidas_mantenimiento(
        _leer_muestra("salidas de mantenimiento.xls"), "salidas de mantenimiento.xls"
    ) == pytest.approx(725226.35)


@requiere_muestras
def test_entradas_real():
    resultado = parsear_entradas(
        _leer_muestra("entradas de almacen general(para expottacion).xls"),
        "entradas de almacen general(para expottacion).xls",
    )
    assert resultado == {
        "subtotal": pytest.approx(1509472.41),
        "descuento": pytest.approx(0.0),
        "iva": pytest.approx(133460.21),
        "total": pytest.approx(1642932.62),
    }
