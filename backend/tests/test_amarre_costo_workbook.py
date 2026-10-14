"""
Tests de `amarre_costo_workbook.py` — genera el clon completo del libro
maestro contra los 12 archivos reales de agosto 2026 (`INVETARIOS/`, ya en
el repo) y verifica que las 15 hojas existen con los nombres correctos y
que las fórmulas de las hojas de resultado, evaluadas manualmente (sin
LibreOffice — mini-evaluador de fórmulas simples con +/-, referencias de
celda y SUM(rango), que es todo lo que este módulo genera), reproducen los
mismos valores ya validados en `test_amarre_costo_reportes.py`.
"""

import re
from pathlib import Path

import pytest
from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string, get_column_letter

from app.models import AmarreCostoPeriodo
from app.services.amarre_costo_workbook import NOMBRE_HOJA_POR_TIPO, _compactar_grid, generar_workbook_amarre_costo

CARPETA_MUESTRA = Path(__file__).resolve().parents[2] / "INVETARIOS"
requiere_muestras = pytest.mark.skipif(not CARPETA_MUESTRA.exists(), reason="Carpeta INVETARIOS/ no disponible en este entorno")

ARCHIVOS_REALES = {
    "balanza": "1balanza.xlsx",
    "conteo-alm-gral": "almacen general agosto 2026.xls",
    "conteo-tienda": "ALMACEN tienda la hacienda.xls",
    "conteo-rest-bar": "almacen restaurante.xls",
    "conteo-cafeteria": "almacen de cafeteria.xls",
    "salidas-alm-gral": "salidas de almacen general.xls",
    "salidas-mtto": "salidas de mantenimiento.xls",
    "entradas-alm-gral": "entradas de almacen general(para expottacion).xls",
    "entradas-tienda": "entradas de tienda la hacienda(para exportacion).xls",
    "entradas-mtto": "entradas de mantenimiento(para exportacion).xls",
    "entradas-cafeteria": "entradas de cafeteria(exportacion).xls",
    "entradas-rest": "entradas restaurant bar(para exportacion).xls",
}


def _generar_wb_agosto_2026():
    archivos_originales = {}
    for tipo, nombre in ARCHIVOS_REALES.items():
        contenido = (CARPETA_MUESTRA / nombre).read_bytes()
        archivos_originales[tipo] = (nombre, contenido)
    periodo = AmarreCostoPeriodo(periodo="2026-08", archivos_cargados="")
    excel_bytes = generar_workbook_amarre_costo(periodo, consignacion=[], archivos_originales=archivos_originales)
    return excel_bytes


# ── Mini-evaluador de fórmulas (solo +, -, SUM(rango), referencias de celda) ─

_CELDA_RE = re.compile(r"(?:'([^']+)'!)?([A-Z]+)(\d+)")
_SUM_RE = re.compile(r"SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)")


def _a_numero(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    texto = str(v).strip().replace("$", "").replace(",", "")
    return float(texto) if texto else 0.0


class _Evaluador:
    def __init__(self, wb):
        self.wb = wb
        self.cache = {}

    def valor(self, hoja, direccion):
        key = (hoja, direccion)
        if key in self.cache:
            return self.cache[key]
        v = self.wb[hoja][direccion].value
        resultado = self._evaluar(v[1:], hoja) if isinstance(v, str) and v.startswith("=") else _a_numero(v)
        self.cache[key] = resultado
        return resultado

    def _expandir_sum(self, m, hoja_actual):
        c1, c2 = column_index_from_string(m.group(1)), column_index_from_string(m.group(3))
        f1, f2 = int(m.group(2)), int(m.group(4))
        total = sum(self.valor(hoja_actual, f"{get_column_letter(c)}{f}") for c in range(c1, c2 + 1) for f in range(f1, f2 + 1))
        return f"({total})"

    def _evaluar(self, expr, hoja_actual):
        # VALUE(X) fuerza texto->número en Excel real; en este evaluador
        # `self.valor` ya coerciona vía `_a_numero` sin importar el tipo de
        # la celda, así que basta con quitar el nombre de la función.
        expr = expr.replace("VALUE(", "(")
        expr = _SUM_RE.sub(lambda m: self._expandir_sum(m, hoja_actual), expr)
        expr = _CELDA_RE.sub(lambda m: f"({self.valor(m.group(1) or hoja_actual, f'{m.group(2)}{m.group(3)}')})", expr)
        return eval(expr)  # noqa: S307 — expresión ya reducida a números y +/-, generada por nuestro propio código


def test_compactar_grid_quita_huecos_preserva_orden():
    filas = [
        ["", "", "5217", "", "", "", "CIGARROS", "", "", "10.0", "", "85.35"],
        ["", "", "", "", "", "", "", "", "", "", "", ""],
        ["", "TOTAL TABAQUERIA", "", "", "16189.85"],
    ]
    compactado = _compactar_grid(filas)
    assert compactado[0] == ["5217", "CIGARROS", "10.0", "85.35"]
    assert compactado[1] == []
    assert compactado[2] == ["TOTAL TABAQUERIA", "16189.85"]


@requiere_muestras
def test_workbook_tiene_las_15_hojas():
    wb = load_workbook_bytes(_generar_wb_agosto_2026())
    assert set(wb.sheetnames) == {
        "1BALANZA", "3ALM GRAL", "3TIENDA", "REST-BAR", "CAFETERIA 1",
        "SAL ALMACEN GRAL", "SAL MTTO",
        "ENT ALMACEN GRAL", "ENT TIENDA", "ENT MTT", "ENT CAFETERIA", "ENT REST",
        "Amarre COSTO", "2DATOS ENTRYSAL", "4Resumen INV",
    }
    assert set(NOMBRE_HOJA_POR_TIPO.values()) <= set(wb.sheetnames)


@requiere_muestras
def test_balanza_2_opcional_se_pega_como_hoja_visible_si_se_manda():
    """
    Regresión: pasar "balanza-2" en `archivos_originales` no debe romper la
    generación (`NOMBRE_HOJA_POR_TIPO` no tiene esa clave — antes lanzaba
    KeyError si el router la incluía) y debe quedar pegada, visible, sin
    afectar las otras 15 hojas.
    """
    archivos_originales = {}
    for tipo, nombre in ARCHIVOS_REALES.items():
        archivos_originales[tipo] = (nombre, (CARPETA_MUESTRA / nombre).read_bytes())
    archivos_originales["balanza-2"] = (
        ARCHIVOS_REALES["balanza"], (CARPETA_MUESTRA / ARCHIVOS_REALES["balanza"]).read_bytes(),
    )
    periodo = AmarreCostoPeriodo(periodo="2026-08", archivos_cargados="")
    excel_bytes = generar_workbook_amarre_costo(periodo, consignacion=[], archivos_originales=archivos_originales)

    wb = load_workbook_bytes(excel_bytes)
    assert "1BALANZA 2" in wb.sheetnames
    assert wb["1BALANZA 2"].sheet_state == "visible"
    # No se pierde ni se oculta ninguna de las 15 hojas de siempre.
    assert len(wb.sheetnames) == 16

    # El diccionario que recibió la función no se mutó (el router lo sigue
    # usando después de llamar aquí).
    assert "balanza-2" in archivos_originales

    # Columnas de comparación en 4Resumen INV: como aquí la "balanza 2" es el
    # mismo archivo que la balanza normal, K (Balanza 2) == E (Saldo
    # Contable) y L = K − G; L18 es la diferencia real conocida de Alm. Gral.
    ev = _Evaluador(wb)
    assert ev.valor("4Resumen INV", "K8") == pytest.approx(ev.valor("4Resumen INV", "E8"))
    assert ev.valor("4Resumen INV", "L18") == pytest.approx(73.10, abs=0.01)
    assert ev.valor("4Resumen INV", "L46") == pytest.approx(ev.valor("4Resumen INV", "K46") - ev.valor("4Resumen INV", "G46"))


@requiere_muestras
def test_xlsx_sin_selecciones_huerfanas_de_panel_y_reclasif_en_rojo():
    """Regresión: `selection pane=...` sin `<pane>` hace que Excel diga 'problema con el contenido'."""
    import io
    import zipfile

    datos = _generar_wb_agosto_2026()
    z = zipfile.ZipFile(io.BytesIO(datos))
    for nombre in z.namelist():
        if nombre.startswith("xl/worksheets/sheet"):
            xml = z.read(nombre).decode("utf-8")
            if "<pane " not in xml:
                assert "<selection pane=" not in xml, nombre

    wb = load_workbook_bytes(datos)
    assert wb["4Resumen INV"]["H8"].fill.start_color.rgb.endswith("FFC7CE")
    assert wb["4Resumen INV"]["H18"].fill.start_color.rgb.endswith("FFC7CE")


@requiere_muestras
def test_hoja_fuente_pegada_tiene_los_mismos_valores_que_el_original():
    """Round-trip: la hoja '1BALANZA' pegada trae el mismo saldo que el archivo original."""
    wb = load_workbook_bytes(_generar_wb_agosto_2026())
    ws = wb["1BALANZA"]
    encontrado = any(
        ws.cell(row=r, column=1).value == "1007101" and abs(_a_numero(ws.cell(row=r, column=3).value) - 2689006.89) < 0.01
        for r in range(1, ws.max_row + 1)
    )
    assert encontrado


@requiere_muestras
def test_formulas_amarre_costo_reproducen_valores_reales():
    """
    Mismo caso de regresión que `test_amarre_costo_reportes.py`, pero
    evaluando las FÓRMULAS de Excel del workbook generado (en las filas
    EXACTAS del libro maestro real, ej. Almacén General es la fila 19, no
    una fila inventada) — confirma que la fórmula escrita en la celda, no
    solo la lógica Python, reproduce el valor real conocido de agosto 2026.
    """
    excel_bytes = _generar_wb_agosto_2026()
    wb = load_workbook_bytes(excel_bytes, data_only=False)
    ev = _Evaluador(wb)

    assert ev.valor("Amarre COSTO", "C19") == pytest.approx(2689006.89)  # Inventario Inicial Almacén General
    assert ev.valor("Amarre COSTO", "D19") == pytest.approx(1509472.41)  # Entradas Almacén General
    assert ev.valor("Amarre COSTO", "E19") == pytest.approx(1708188.61, abs=0.01)  # Salidas/Traspasos (fórmula corregida)
    assert ev.valor("Amarre COSTO", "J20") == pytest.approx(153229.10, abs=0.01)  # Dif. a contabilizar Restaurant
    # Totales de fila 24 (antes faltaban I y J) — valores reales de agosto 2026
    assert ev.valor("Amarre COSTO", "I24") == pytest.approx(761863.73, abs=0.01)
    assert ev.valor("Amarre COSTO", "J24") == pytest.approx(424169.90, abs=0.05)
    assert ev.valor("2DATOS ENTRYSAL", "D8") == pytest.approx(946324.67, abs=0.01)  # Despacho a Gasto (D8 real)
    assert ev.valor("2DATOS ENTRYSAL", "D12") == pytest.approx(93245.75)  # Cafetería Alimentos (despacho)
    assert ev.valor("2DATOS ENTRYSAL", "E22") == pytest.approx(-0.09, abs=0.01)  # Diferencia vs. balanza (cercana a 0, valor real conocido)
    # 4Resumen INV, layout real celda por celda (valores de agosto 2026)
    assert ev.valor("4Resumen INV", "E8") == pytest.approx(1437336.39)  # búsqueda por código en balanza
    assert ev.valor("4Resumen INV", "G8") == pytest.approx(1437323.07)
    assert ev.valor("4Resumen INV", "E18") == pytest.approx(2490290.69)
    assert ev.valor("4Resumen INV", "G18") == pytest.approx(2490217.59)
    assert ev.valor("4Resumen INV", "H18") == pytest.approx(-73.10, abs=0.01)
    assert ev.valor("4Resumen INV", "G28") == pytest.approx(434554.94, abs=0.01)
    assert ev.valor("4Resumen INV", "G39") == pytest.approx(25818.47, abs=0.01)
    assert ev.valor("4Resumen INV", "E46") == pytest.approx(3560490.86)
    assert ev.valor("4Resumen INV", "H46") == pytest.approx(-424243.0, abs=0.05)
    # Validaciones cruzadas: deben dar 0 (dentro de redondeo)
    for celda in ("E51", "G51", "H51", "I46", "I18", "I39"):
        assert ev.valor("4Resumen INV", celda) == pytest.approx(0, abs=0.05), celda


@requiere_muestras
def test_gran_total_incluye_las_3_categorias_recalibradas():
    """
    Ropa y Uniformes, Higiénicos y Material para Mantto (Alm. Gral.),
    Artesanías e Higiénicos (Tienda) y Alimentos (Cafetería) ya no quedan
    en $0/captura manual. Las 3 hojas quedan con su Gran Total COMPLETO
    (todas sus categorías tienen mapeo) — incluye el caso de regresión más
    importante de esta sesión: antes del fix de `VALUE()`, `SUM()` ignoraba
    las categorías de una sola celda (Tabaquería/Papelería/Stock Mtto/Ropa
    y Uniformes) por venir como texto, así que el Gran Total de Almacén
    General solo contaba Alimentos+Bebidas.
    """
    excel_bytes = _generar_wb_agosto_2026()
    wb = load_workbook_bytes(excel_bytes, data_only=False)
    ev = _Evaluador(wb)

    gran_total_tienda = ev.valor("3TIENDA", f"B{wb['3TIENDA'].max_row}")
    assert gran_total_tienda == pytest.approx(434554.94, abs=0.01)

    gran_total_cafeteria = ev.valor("CAFETERIA 1", f"B{wb['CAFETERIA 1'].max_row}")
    assert gran_total_cafeteria == pytest.approx(25818.47, abs=0.01)

    gran_total_alm_gral = ev.valor("3ALM GRAL", f"B{wb['3ALM GRAL'].max_row}")
    assert gran_total_alm_gral == pytest.approx(2490217.59, abs=0.01)


@requiere_muestras
def test_poliza_contable_referencia_las_diferencias_correctas():
    """
    La hoja "PÓLIZA CONTABLE" (B61:E90, nueva) referencia J20:J23 de la
    tabla principal — no verifica que cuadre en 0 (D90) porque ese balance
    depende de las 3 categorías del conteo físico sin mapeo automático
    confirmado (ver `amarre_costo_parsing.py`, documentado ahí) — sí
    verifica que cada renglón de la póliza trae el valor correcto de su
    celda de origen.
    """
    excel_bytes = _generar_wb_agosto_2026()
    wb = load_workbook_bytes(excel_bytes, data_only=False)
    ev = _Evaluador(wb)

    assert ev.valor("Amarre COSTO", "D69") == ev.valor("Amarre COSTO", "J20")  # Costo Restaurant
    assert ev.valor("Amarre COSTO", "D70") == ev.valor("Amarre COSTO", "J21")  # Costo Bar
    assert ev.valor("Amarre COSTO", "D88") == pytest.approx(
        sum(ev.valor("Amarre COSTO", f"D{f}") for f in (65, 69, 70, 71, 72, 75, 78, 81, 82, 85))
    )


def load_workbook_bytes(contenido: bytes, data_only: bool = False):
    from io import BytesIO

    return load_workbook(BytesIO(contenido), data_only=data_only)
