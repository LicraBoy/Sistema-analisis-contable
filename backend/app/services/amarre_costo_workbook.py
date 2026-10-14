"""
Amarre de Costo de Ventas — genera un clon del libro maestro original
(`CIERRE DE INVENTARIOS CORRECTO GENERAL AGOSTO 2026.xlsx`) con las 15
hojas: las 12 fuente (pegadas tal cual, cada una en su propia hoja con el
nombre real) más Amarre COSTO / 2DATOS ENTRYSAL / 4Resumen INV, escritas
como FÓRMULAS de Excel que referencian esas hojas — no valores ya
calculados por Python. Si el usuario edita una celda de una hoja fuente
pegada, el libro recalcula solo, igual que el archivo que ya usa.

Esto es posible sin volver a caer en "hay que reajustar la fórmula cada
mes a mano" porque las coordenadas de cada celda referenciada se ubican
por texto de etiqueta (`amarre_costo_parsing.py::localizar_*`), no a mano
— el archivo se regenera completo cada vez que el usuario exporta.

Simplificación deliberada frente al original: las tablas "Gran Total" de
los 4 almacenes NO reproducen la columna de código de cuenta con
`SUBSTITUTE`/`VLOOKUP`/`IFERROR` del libro real (esa parte es cosmética —
solo muestra el nombre bonito de la cuenta, no afecta ningún cálculo) —
aquí el concepto se escribe como texto plano. Lo que sí es fiel y en vivo:
qué celdas se suman para cada categoría y las fórmulas de Amarre COSTO /
2DATOS ENTRYSAL / 4Resumen INV.
"""

from io import BytesIO

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.views import Selection
from openpyxl.worksheet.worksheet import Worksheet

from app.models import AmarreCostoConsignacionRenglon, AmarreCostoPeriodo
from app.services.amarre_costo_parsing import (
    Celda,
    Grid,
    _es_total_nivel1,
    _texto,
    leer_filas_crudas,
    localizar_balanza_fila,
    localizar_entradas,
    localizar_ocurrencias_nivel1,
    localizar_salidas_almacen_general,
    localizar_salidas_mantenimiento,
)

# ── Nombres de hoja reales (idénticos al libro maestro original) ───────

HOJA_BALANZA = "1BALANZA"
# "Balanza 2" (opcional, tipo "balanza-2") solo se pega tal cual como una
# hoja más de consulta — a diferencia de 1BALANZA, ninguna fórmula de
# Amarre COSTO/2DATOS ENTRYSAL/4Resumen INV la referencia; la usan la
# comparación en pantalla (`amarre_costo_reportes.py::construir_
# comparacion_balanza_2`) y, aquí, solo para que quede visible en el libro.
HOJA_BALANZA_2 = "1BALANZA 2"
HOJA_ALM_GRAL = "3ALM GRAL"
HOJA_TIENDA = "3TIENDA"
HOJA_REST_BAR = "REST-BAR"
HOJA_CAFETERIA = "CAFETERIA 1"
HOJA_SAL_ALM_GRAL = "SAL ALMACEN GRAL"
HOJA_SAL_MTTO = "SAL MTTO"
HOJA_ENT_ALM_GRAL = "ENT ALMACEN GRAL"
HOJA_ENT_TIENDA = "ENT TIENDA"
HOJA_ENT_MTTO = "ENT MTT"
HOJA_ENT_CAFETERIA = "ENT CAFETERIA"
HOJA_ENT_REST = "ENT REST"
HOJA_AMARRE_COSTO = "Amarre COSTO"
HOJA_ENTRYSAL = "2DATOS ENTRYSAL"
HOJA_RESUMEN_INV = "4Resumen INV"

NOMBRE_HOJA_POR_TIPO: dict[str, str] = {
    "balanza": HOJA_BALANZA,
    "conteo-alm-gral": HOJA_ALM_GRAL,
    "conteo-tienda": HOJA_TIENDA,
    "conteo-rest-bar": HOJA_REST_BAR,
    "conteo-cafeteria": HOJA_CAFETERIA,
    "salidas-alm-gral": HOJA_SAL_ALM_GRAL,
    "salidas-mtto": HOJA_SAL_MTTO,
    "entradas-alm-gral": HOJA_ENT_ALM_GRAL,
    "entradas-tienda": HOJA_ENT_TIENDA,
    "entradas-mtto": HOJA_ENT_MTTO,
    "entradas-cafeteria": HOJA_ENT_CAFETERIA,
    "entradas-rest": HOJA_ENT_REST,
}

CUENTA_ALM_GRAL = "1007101"
CUENTA_TIENDA = "1007102"
CUENTA_RESTAURANT = "1007103.001"
CUENTA_BAR = "1007103.002"
CUENTA_CAFETERIA = "1007108"
CUENTA_TOTAL_INVENTARIOS = "1007"  # código global, usado en las validaciones cruzadas de ambas hojas

# Cuentas contables de la Póliza Contable — identificadores del catálogo de
# cuentas de la empresa, NO datos capturados; se confirmaron contra el
# libro real y no cambian mes a mes (a diferencia de todo lo demás en este
# archivo, aquí SÍ es correcto tener constantes fijas).
CUENTA_TARJ_LADATEL_ANTICIPO = "1201001"
CUENTA_TARJ_LADATEL_COSTO = "5001006"
CUENTA_COSTO_RESTAURANT = "5001-004-001"
CUENTA_COSTO_BAR = "5001-002-002"
CUENTA_COSTO_CAFETERIA = "5001-008"
CUENTA_COSTO_TIENDA = "5001-005"
CUENTA_ALIMENTOS_INV = "1007001"
CUENTA_COMEDOR_EMP = "6006-035"
CUENTA_ALIMENTOS_COMEDOR = "6006-035-001"

# (campo_modelo, etiqueta_bonita, tupla_de_categorias_novohit | None)
# None = sin mapeo automático confiable (validado contra agosto 2026) ->
# queda como celda de captura manual en el Excel, con una nota apuntando a
# la hoja pegada para que el usuario la ubique y la teclee (o escriba su
# propia fórmula ahí mismo, ya que la hoja fuente está en el mismo libro).
ALM_GRAL_CAMPOS: list[tuple[str, str, tuple[str, ...] | None]] = [
    ("alm_gral_alimentos", "Alimentos", ("ALIMENTOS",)),
    ("alm_gral_bebidas", "Bebidas", ("BEBIDAS",)),
    ("alm_gral_tabaqueria", "Tabaquería", ("TABAQUERIA",)),
    ("alm_gral_papeleria", "Papelería", ("PAPELERIA",)),
    # Confirmadas por el usuario y verificadas exactas contra el archivo real.
    ("alm_gral_higienicos", "Higiénicos y Suministros", ("SUMINISTROS", "ARTESANIAS")),
    ("alm_gral_medicinas", "Medicinas y Medicamentos", None),
    ("alm_gral_material_mantto", "Material para Mantto", ("EQUIPO DE OPERACION",)),
    ("alm_gral_stock_mantenimiento", "Stock Mantenimiento", ("STOCK MTO.",)),
    ("alm_gral_servicios", "Servicios", None),
    # Etiqueta real de Novohit para esta cuenta contable — ver
    # `amarre_costo_parsing.py::CATEGORIAS_ALM_GRAL` para la explicación.
    ("alm_gral_ropa_uniformes", "Ropa y Uniformes", ("SOUVENIRS  Y CAFE EN GRANO",)),
]
TIENDA_CAMPOS: list[tuple[str, str, tuple[str, ...] | None]] = [
    ("tienda_alimentos", "Alimentos", ("ALIMENTOS",)),
    ("tienda_bebidas", "Bebidas", ("BEBIDAS",)),
    ("tienda_tabaqueria", "Tabaquería", ("TABAQUERIA",)),
    ("tienda_periodicos", "Periódicos y Otros", None),
    ("tienda_higienicos", "Higiénicos y Sum", ("SUMINISTROS",)),
    ("tienda_medicinas", "Medicinas", ("MEDICINAS Y ARTS DE CURACION",)),
    ("tienda_ropa", "Ropa", ("ROPA",)),
    ("tienda_artesanias", "Artesanías", ("ARTESANIAS DIVERSAS GRAVADOS",)),
]
REST_BAR_CAMPOS: list[tuple[str, str, tuple[str, ...] | None]] = [
    ("restaurant_alimentos", "Alimentos", ("ALIMENTOS",)),
    ("bar_bebidas", "Bebidas", ("BEBIDAS",)),
]
CAFETERIA_CAMPOS: list[tuple[str, str, tuple[str, ...] | None]] = [
    # Cafetería no tiene cuenta de "Bebidas" propia — ese monto se registra
    # dentro de Alimentos (ver `amarre_costo_parsing.py::
    # CATEGORIAS_COMPUESTAS_CAFETERIA`); el +0.01 replica el ajuste de
    # redondeo confirmado en el libro maestro real (`AD426=...+0.01`).
    ("cafeteria_alimentos", "Alimentos", ("ALIMENTOS", "BEBIDAS")),
    ("cafeteria_souvenirs", "Souvenirs", ("ROPA",)),
]
AJUSTE_REDONDEO_CAFETERIA_ALIMENTOS_TEXTO = "+0.01"

# ── Estilo — misma paleta que el resto de exportaciones del sistema
# (`costeo_excel_export.py`: azul 1864AB banner, "Segoe UI", amarillo claro
# = captura manual, verde/rojo semáforo en validaciones para que las
# diferencias salten a la vista sin tener que leer cada número).
_FUENTE = "Segoe UI"
_FILL_BANNER = PatternFill(start_color="1864AB", end_color="1864AB", fill_type="solid")
_FONT_BANNER = Font(name=_FUENTE, size=13, bold=True, color="FFFFFF")
_FILL_HEADER = PatternFill(start_color="2F5FA8", end_color="2F5FA8", fill_type="solid")
_FONT_HEADER = Font(name=_FUENTE, size=10, bold=True, color="FFFFFF")
_FILL_SECCION = PatternFill(start_color="D9E2F3", end_color="D9E2F3", fill_type="solid")
_FONT_SECCION = Font(name=_FUENTE, size=11, bold=True, color="1864AB")
_FILL_MANUAL = PatternFill(start_color="FFF3BF", end_color="FFF3BF", fill_type="solid")
_FONT_MANUAL = Font(name=_FUENTE, color="9C5700", italic=True)
_FILL_ZEBRA = PatternFill(start_color="F2F5FA", end_color="F2F5FA", fill_type="solid")
_FILL_TOTAL = PatternFill(start_color="DCE6F7", end_color="DCE6F7", fill_type="solid")
_FILL_OK = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
_FONT_OK = Font(name=_FUENTE, color="006100")
_FILL_REVISAR = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
_FONT_REVISAR = Font(name=_FUENTE, color="9C0006")
_FONT_NEGRITA = Font(name=_FUENTE, bold=True)
_FONT_NORMAL = Font(name=_FUENTE, size=10)
_FORMATO_MONEDA = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)'
_THIN = Side(style="thin", color="C9D3E0")
_BORDE = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)
_COLOR_TAB_FUENTE = "B7C6E6"
_COLOR_TAB_GRAN_TOTAL = "FFD966"
_COLOR_TAB_RESULTADO = "2E7D32"


def _dir(hoja: str, celda: Celda) -> str:
    """(fila0, col0) -> "'Hoja'!AD38" (1-indexado, letra de columna real)."""
    fila, col = celda
    return f"'{hoja}'!{get_column_letter(col + 1)}{fila + 1}"


def _banner(ws: Worksheet, texto: str, ultima_columna: int = 10) -> None:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ultima_columna)
    celda = ws.cell(row=1, column=1, value=texto)
    celda.fill = _FILL_BANNER
    celda.font = _FONT_BANNER
    celda.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 26


def _celda_manual(ws: Worksheet, fila: int, col: int, valor: float | None, nota: str) -> None:
    celda = ws.cell(row=fila, column=col, value=valor if valor is not None else 0)
    celda.fill = _FILL_MANUAL
    celda.font = _FONT_MANUAL
    celda.number_format = _FORMATO_MONEDA
    celda.border = _BORDE
    celda.comment = _comentario(nota)


def _comentario(texto: str):
    from openpyxl.comments import Comment

    return Comment(texto, "Sistema de Análisis Contable")


def _aplicar_borde_rango(ws: Worksheet, fila_ini: int, fila_fin: int, col_ini: int, col_fin: int) -> None:
    for f in range(fila_ini, fila_fin + 1):
        for c in range(col_ini, col_fin + 1):
            ws.cell(row=f, column=c).border = _BORDE


def _aplicar_zebra(ws: Worksheet, fila_ini: int, fila_fin: int, col_ini: int, col_fin: int) -> None:
    """Alterna el fondo de las filas de datos (pares) para que sea más fácil seguir una fila con la vista."""
    for f in range(fila_ini, fila_fin + 1, 2):
        for c in range(col_ini, col_fin + 1):
            celda = ws.cell(row=f, column=c)
            if celda.fill.start_color.rgb in (None, "00000000"):
                celda.fill = _FILL_ZEBRA


def _semaforo(ws: Worksheet, rango: str, celda_formula: str) -> None:
    """
    Formato condicional verde/rojo: verde cuando |valor| < 1 (cuadra,
    tolerancia de redondeo), rojo cuando no — para que una diferencia real
    salte a la vista sin tener que leer cada celda de validación.
    """
    ws.conditional_formatting.add(
        rango, FormulaRule(formula=[f"ABS({celda_formula})<1"], fill=_FILL_OK, font=_FONT_OK)
    )
    ws.conditional_formatting.add(
        rango, FormulaRule(formula=[f"ABS({celda_formula})>=1"], fill=_FILL_REVISAR, font=_FONT_REVISAR)
    )


def _semaforo_texto(ws: Worksheet, rango: str) -> None:
    """Colorea en verde las celdas con texto 'OK' y en rojo las que digan 'REVISAR'."""
    ws.conditional_formatting.add(rango, CellIsRule(operator="equal", formula=['"OK"'], fill=_FILL_OK, font=_FONT_OK))
    ws.conditional_formatting.add(rango, CellIsRule(operator="equal", formula=['"REVISAR"'], fill=_FILL_REVISAR, font=_FONT_REVISAR))


# ── 1) Pegar cada archivo fuente tal cual en su propia hoja ─────────────


def _compactar_grid(filas: Grid) -> Grid:
    """
    Quita las celdas vacías de cada fila, dejando solo los valores reales
    pegados unos junto a otros (mismo orden izquierda-a-derecha del
    original). Ningún parser de este módulo depende de la posición exacta
    de columna (`_es_total_nivel1`/`_columna_numerica_en_fila`/
    `localizar_ocurrencias_nivel1` siempre recorren la fila completa
    buscando "la última celda con pinta de número" o "cualquier celda que
    empiece con TOTAL "), así que compactar es seguro — el objetivo es
    solo legibilidad: en el reporte Novohit real, "Costo" y "TOTAL Costo"
    caen a 20+ columnas de distancia por la indentación jerárquica
    (categoría/subcategoría/artículo), lo que hace casi imposible ubicar un
    dato a simple vista.
    """
    return [[v for v in fila if v not in ("", None)] for fila in filas]


def _pegar_hoja_cruda(wb: Workbook, nombre_hoja: str, filas: Grid, resaltar_totales: bool = False) -> Worksheet:
    """
    `resaltar_totales=True` (usado en los 4 conteos físicos) pinta en
    negrita + fondo distintivo cada fila "TOTAL <categoría>" de nivel 1 —
    son ~8-10 filas entre miles de artículos, y sin resaltarlas es
    prácticamente imposible ubicarlas a simple vista al revisar la hoja.
    """
    ws = wb.create_sheet(nombre_hoja)
    fila_encabezado_real = None
    for r, fila in enumerate(filas, start=1):
        es_encabezado = resaltar_totales and any(
            isinstance(v, str) and v.strip() in ("Cód.", "TOTAL Costo") for v in fila
        )
        if es_encabezado and fila_encabezado_real is None:
            fila_encabezado_real = r
        # IMPORTANTE: _es_total_nivel1 necesita el texto SIN .strip() — ver
        # el comentario de esa función en amarre_costo_parsing.py.
        es_total = resaltar_totales and not es_encabezado and any(
            _es_total_nivel1(_texto(v)) for v in fila if isinstance(v, str)
        )
        for c, valor in enumerate(fila, start=1):
            if valor == "" or valor is None:
                continue
            celda = ws.cell(row=r, column=c, value=valor)
            if es_encabezado:
                celda.font = _FONT_HEADER
                celda.fill = _FILL_HEADER
            elif es_total:
                celda.font = _FONT_NEGRITA
                celda.fill = _FILL_SECCION
            else:
                celda.font = _FONT_NORMAL
    ws.sheet_properties.tabColor = _COLOR_TAB_FUENTE
    ws.sheet_view.zoomScale = 90
    # Congela justo debajo del encabezado real de columnas (detectado por
    # "Cód."/"TOTAL Costo") para poder ubicarse aunque la hoja tenga miles
    # de filas de artículos; si no se detectó (hojas sin resaltar_totales),
    # congela la fila 1 tal cual.
    ws.freeze_panes = f"A{fila_encabezado_real + 1}" if fila_encabezado_real else "A2"
    if resaltar_totales and filas:
        for c in range(1, max(len(f) for f in filas) + 1):
            ws.column_dimensions[get_column_letter(c)].width = 22
    return ws


def _dar_diseno_balanza(ws: Worksheet) -> None:
    """
    Solo presentación de `1BALANZA` (no cambia ningún valor ni posición: las
    fórmulas de otras hojas la referencian por coordenada). Encabezado azul,
    jerarquía de cuentas por nivel (por longitud del código), montos como
    moneda alineados a la derecha, negativos en rojo y anchos legibles.
    """
    ws.sheet_properties.tabColor = _COLOR_TAB_RESULTADO
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 100
    ws.freeze_panes = None
    # Quitar el panel deja selecciones con pane="bottomLeft" huérfanas, que
    # Excel rechaza ("problema con el contenido"): se reinicia la selección.
    ws.sheet_view.selection = [Selection(activeCell="A1", sqref="A1")]

    ws.cell(row=1, column=1).font = Font(name=_FUENTE, size=14, bold=True, color="1864AB")
    ws.cell(row=2, column=1).font = Font(name=_FUENTE, size=12, bold=True)
    ws.cell(row=3, column=1).font = Font(name=_FUENTE, size=10, italic=True, color="5C6B82")
    for f in (1, 2, 3):
        ws.cell(row=f, column=7).font = Font(name=_FUENTE, size=9, color="5C6B82")
        ws.cell(row=f, column=7).alignment = Alignment(horizontal="right")

    fila_encabezado = 4
    for c in range(1, 8):
        celda = ws.cell(row=fila_encabezado, column=c)
        celda.font = _FONT_HEADER
        celda.fill = _FILL_HEADER
        celda.border = _BORDE
        celda.alignment = Alignment(horizontal="left" if c <= 2 else "center", vertical="center", wrap_text=True)
    ws.row_dimensions[fila_encabezado].height = 24

    nivel_fill = {
        1: PatternFill(start_color="1864AB", end_color="1864AB", fill_type="solid"),
        2: PatternFill(start_color="2F5FA8", end_color="2F5FA8", fill_type="solid"),
        4: _FILL_SECCION,
        7: _FILL_TOTAL,
    }
    for f in range(fila_encabezado + 1, ws.max_row + 1):
        codigo = ws.cell(row=f, column=1).value
        if codigo is None:
            continue
        texto = str(codigo).strip()
        nivel = None if "." in texto else len(texto)
        fuente = _FONT_NORMAL
        relleno = None
        if nivel in nivel_fill:
            relleno = nivel_fill[nivel]
            fuente = _FONT_HEADER if nivel in (1, 2) else _FONT_NEGRITA
        for c in range(1, 8):
            celda = ws.cell(row=f, column=c)
            celda.font = fuente
            if relleno is not None:
                celda.fill = relleno
            celda.border = Border(bottom=Side(style="hair", color="B7C6E6"))
            if c >= 3 and isinstance(celda.value, (int, float)):
                celda.number_format = '#,##0.00;[Red]-#,##0.00;"-"'
                celda.alignment = Alignment(horizontal="right")
        if nivel is None:  # cuentas de detalle: descripción con sangría
            ws.cell(row=f, column=2).alignment = Alignment(horizontal="left", indent=2)

    for col, ancho in zip("ABCDEFG", (16, 44, 18, 18, 18, 18, 18)):
        ws.column_dimensions[col].width = ancho


# ── 2) Tabla "Gran Total" con fórmulas, agregada debajo de cada conteo físico ─


def _agregar_gran_total_almacen(
    wb: Workbook,
    nombre_hoja: str,
    filas: Grid,
    campos: list[tuple[str, str, tuple[str, ...] | None]],
) -> dict[str, str]:
    """
    Escribe, debajo de los datos ya pegados, una tabla "Gran Total" con una
    fórmula por concepto (suma de las celdas donde el parser localizó cada
    categoría ese mes) y un "GRAN TOTAL" final. Regresa
    {campo_modelo: "'Hoja'!B<fila>"} para que Amarre COSTO/4Resumen INV
    referencien esa celda por fórmula.
    """
    ws = wb[nombre_hoja]
    ocurrencias = localizar_ocurrencias_nivel1(filas)

    fila_inicio = ws.max_row + 3
    ws.cell(row=fila_inicio, column=1, value="GRAN TOTAL POR CONCEPTO").font = _FONT_NEGRITA
    fila = fila_inicio + 1
    ws.cell(row=fila, column=1, value="Concepto").font = _FONT_HEADER
    ws.cell(row=fila, column=1).fill = _FILL_HEADER
    ws.cell(row=fila, column=2, value="Monto").font = _FONT_HEADER
    ws.cell(row=fila, column=2).fill = _FILL_HEADER
    fila += 1

    direcciones: dict[str, str] = {}
    primera_fila_datos = fila
    for campo, etiqueta, categorias in campos:
        ws.cell(row=fila, column=1, value=etiqueta)
        celda_monto = ws.cell(row=fila, column=2)
        celda_monto.number_format = _FORMATO_MONEDA

        celdas_origen: list[Celda] = []
        for nombre_categoria in categorias or ():
            celdas_origen.extend(ocurrencias.get(nombre_categoria, []))

        if celdas_origen:
            # VALUE(...) en cada celda, no solo una referencia directa: el
            # monto de las filas "TOTAL X" del reporte Novohit se guarda
            # como TEXTO ("16,189.85"), y una referencia sola a una celda de
            # texto (`=T37`) devuelve texto, no número — SUM() ignora en
            # silencio las celdas de texto, así que el GRAN TOTAL de abajo
            # se quedaba corto (bug real confirmado: solo sumaba las
            # categorías que combinan 2+ celdas con "+", porque el operador
            # `+` sí convierte texto-número implícitamente; una celda sola
            # no). VALUE() fuerza la conversión sin importar cuántas celdas
            # se sumen.
            formula = "=" + "+".join(f"VALUE({get_column_letter(c + 1)}{f + 1})" for f, c in celdas_origen)
            if nombre_hoja == HOJA_CAFETERIA and campo == "cafeteria_alimentos":
                # Ajuste de redondeo confirmado en el libro maestro real
                # (`AD426=...+0.01`) — solo aplica a esta celda, no generalizar.
                formula += AJUSTE_REDONDEO_CAFETERIA_ALIMENTOS_TEXTO
            celda_monto.value = formula
        else:
            _celda_manual(
                ws, fila, 2, None,
                f"Sin fuente automática confirmada para '{etiqueta}' — revisa la hoja pegada y captura el monto aquí, "
                "o escribe tu propia fórmula apuntando a la celda correcta.",
            )

        direcciones[campo] = _dir(nombre_hoja, (fila - 1, 1))
        fila += 1

    ws.cell(row=fila, column=1, value="GRAN TOTAL").font = _FONT_NEGRITA
    celda_total = ws.cell(row=fila, column=2, value=f"=SUM(B{primera_fila_datos}:B{fila - 1})")
    celda_total.font = _FONT_NEGRITA
    celda_total.number_format = _FORMATO_MONEDA
    for c in (1, 2):
        ws.cell(row=fila, column=c).fill = _FILL_TOTAL
    direcciones["__gran_total__"] = _dir(nombre_hoja, (fila - 1, 1))

    _aplicar_borde_rango(ws, fila_inicio + 1, fila, 1, 2)
    _aplicar_zebra(ws, primera_fila_datos, fila - 1, 1, 2)

    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 18
    return direcciones


# ── 3) 2DATOS ENTRYSAL ───────────────────────────────────────────────────


def _construir_hoja_entrysal(
    wb: Workbook,
    filas_sal_alm_gral: Grid,
    filas_sal_mtto: Grid,
    filas_ent: dict[str, Grid],
    filas_balanza: Grid,
) -> dict[str, str]:
    """
    Reconstruye 2DATOS ENTRYSAL con el layout y las filas EXACTAS del libro
    maestro real (confirmado celda por celda), incluidas las columnas de
    validación cruzada contra 1BALANZA (E20:E22, D35:D38, I30:K34) que la
    v2 no construía. Ubicando cada celda con
    `localizar_salidas_almacen_general`/`localizar_salidas_mantenimiento`/
    `localizar_entradas`/`localizar_balanza_fila` (mismo criterio "por
    etiqueta" del resto del módulo). Regresa las direcciones que Amarre
    COSTO necesita referenciar.
    """
    ws = wb.create_sheet(HOJA_ENTRYSAL)
    _banner(ws, "Datos de Entradas y Despachos — Amarre de Inventarios", ultima_columna=11)
    subtitulo = ws.cell(row=2, column=3, value="Información tomada de los almacenes (Entradas y Despachos) para el amarre de inventarios")
    subtitulo.font = Font(name=_FUENTE, size=10, italic=True, color="5C6B82")

    sal = localizar_salidas_almacen_general(filas_sal_alm_gral)
    celda_mtto = localizar_salidas_mantenimiento(filas_sal_mtto)

    direcciones: dict[str, str] = {}

    # ── Despachos/Salidas ────────────────────────────────────────────
    ws.cell(row=4, column=2, value="1 · DESPACHOS / SALIDAS")
    ws.cell(row=7, column=3, value="DESPACHOS DE:").font = _FONT_HEADER
    ws.cell(row=7, column=4, value="A GASTOS").font = _FONT_HEADER
    ws.cell(row=7, column=5, value="TOTAL").font = _FONT_HEADER

    ws.cell(row=8, column=3, value="ALMACEN GRAL")
    if sal["despacho_gasto"] and sal["despacho_centro_costo"]:
        formula = f"=VALUE({_dir(HOJA_SAL_ALM_GRAL, sal['despacho_gasto'])})-VALUE({_dir(HOJA_SAL_ALM_GRAL, sal['despacho_centro_costo'])})"
        ws.cell(row=8, column=4, value=formula).number_format = _FORMATO_MONEDA
    else:
        _celda_manual(ws, 8, 4, 0, "No se localizaron los totales de despacho en la hoja SAL ALMACEN GRAL — captura a mano.")
    # D8 = valor NETO mostrado en pantalla (Total General − Total Centro de
    # Costo, el "Despacho a Gasto" real). Amarre COSTO necesita el valor
    # CRUDO (Total General solo) para su propia fórmula (ver
    # `_construir_hoja_amarre_costo` — el término de Centro de Costo se
    # cancela algebraicamente ahí, no aquí), así que se expone aparte
    # apuntando directo a la hoja SAL ALMACEN GRAL pegada.
    direcciones["entrysal_despacho_gasto_neto"] = f"'{HOJA_ENTRYSAL}'!D8"
    direcciones["entrysal_despacho_gasto"] = (
        _dir(HOJA_SAL_ALM_GRAL, sal["despacho_gasto"]) if sal["despacho_gasto"] else "0"
    )

    ws.cell(row=9, column=3, value="MANTENIMIENTO")
    if celda_mtto:
        ws.cell(row=9, column=4, value=f"=VALUE({_dir(HOJA_SAL_MTTO, celda_mtto)})").number_format = _FORMATO_MONEDA
    else:
        _celda_manual(ws, 9, 4, 0, "No se localizó el total de despacho en la hoja SAL MTTO — captura a mano.")
    direcciones["entrysal_despacho_mtto"] = f"'{HOJA_ENTRYSAL}'!D9"
    ws.cell(row=9, column=5, value="=SUM(D8:D9)").number_format = _FORMATO_MONEDA

    ws.cell(row=11, column=3, value="DESP DE ALM GRAL A CENTROS DE COSTO").font = _FONT_NEGRITA
    etiquetas_departamento = [
        ("entrysal_cafeteria_alimentos", "CAFETERIA ALIM"),
        ("entrysal_cafeteria_bebidas", "CAFETERIA BEB"),
        ("entrysal_souvenirs_cafe", "SOUVENIR Y CAFÉ"),
        ("entrysal_carreta_alimentos", "LA CARRETA ALIM"),
        ("entrysal_carreta_bebidas", "LA CARRETA BEB"),
        ("entrysal_restaurant", "RESTAURANT"),
        ("entrysal_palapa_bar", "PALAPA BAR"),
        ("entrysal_tienda", "TIENDA"),
    ]
    fila = 12
    for campo, etiqueta in etiquetas_departamento:
        ws.cell(row=fila, column=3, value=etiqueta)
        celda_origen = sal["departamentos"].get(campo)
        if celda_origen:
            ws.cell(row=fila, column=4, value=f"=VALUE({_dir(HOJA_SAL_ALM_GRAL, celda_origen)})").number_format = _FORMATO_MONEDA
        else:
            _celda_manual(ws, fila, 4, 0, f"'{etiqueta}' no tiene su propia sección en SAL ALMACEN GRAL este mes — captura a mano si aplica.")
        direcciones[campo] = f"'{HOJA_ENTRYSAL}'!D{fila}"
        fila += 1
    fila_fin_departamentos = fila - 1  # 19
    ws.cell(row=fila_fin_departamentos, column=5, value=f"=SUM(D12:D{fila_fin_departamentos})").number_format = _FORMATO_MONEDA

    # ── Validación contra 1BALANZA (E20:E22) ────────────────────────
    ws.cell(row=20, column=3, value="Total S/Modulo Inv")
    ws.cell(row=20, column=5, value="=+E19+E9").number_format = _FORMATO_MONEDA
    ws.cell(row=20, column=6, value="=+E20-D9").number_format = _FORMATO_MONEDA
    ws.cell(row=21, column=3, value="VS/BALANZA")
    ws.cell(row=21, column=4, value=CUENTA_TOTAL_INVENTARIOS)
    f_bal = localizar_balanza_fila(filas_balanza, CUENTA_TOTAL_INVENTARIOS)
    if f_bal is not None:
        ws.cell(row=21, column=5, value=f"={_dir(HOJA_BALANZA, (f_bal, 4))}").number_format = _FORMATO_MONEDA
    else:
        _celda_manual(ws, 21, 5, 0, f"Cuenta {CUENTA_TOTAL_INVENTARIOS} no encontrada en 1BALANZA — captura a mano.")
    ws.cell(row=22, column=3, value="DIFERENCIA")
    ws.cell(row=22, column=5, value="=E20-E21").number_format = _FORMATO_MONEDA
    direcciones["entrysal_diferencia_balanza_dir"] = f"'{HOJA_ENTRYSAL}'!E22"

    # I9 = control cruzado: despacho de Mantenimiento vs. sus propias entradas (D32).
    ws.cell(row=9, column=9, value="DIFERENCIA")
    ws.cell(row=9, column=9, value="=D9-D32").number_format = _FORMATO_MONEDA

    # ── Entradas ─────────────────────────────────────────────────────
    ws.cell(row=25, column=2, value="2 · ENTRADAS")
    for c, texto in zip("DEFGHIJK", ["SUBTOTAL", "DESCTO", "IVA", "IEPS", "TOTAL s/reporte", "VALIDACION", "DIFERENCIA", "ESTATUS"]):
        celda = ws.cell(row=28, column=ord(c) - 64, value=texto)
        celda.font = _FONT_HEADER
        celda.fill = _FILL_HEADER
    ws.cell(row=28, column=3, value="ENTRADAS").font = _FONT_HEADER
    ws.cell(row=28, column=3).fill = _FILL_HEADER

    ent_config = [
        ("cafeteria", HOJA_ENT_CAFETERIA, "CAFETERIA", "ent_cafeteria"),
        ("alm_gral", HOJA_ENT_ALM_GRAL, "ALM GRAL", "ent_alm_gral"),
        ("mtto", HOJA_ENT_MTTO, "MANTTO", "ent_mtto"),
        ("rest", HOJA_ENT_REST, "RESTBAR", "ent_rest"),
        ("tienda", HOJA_ENT_TIENDA, "TIENDA", "ent_tienda"),
    ]
    fila = 30
    for _clave, nombre_hoja, etiqueta, prefijo_campo in ent_config:
        ws.cell(row=fila, column=3, value=etiqueta)
        ubicacion = localizar_entradas(filas_ent[nombre_hoja])
        columnas_destino = [("subtotal", 4), ("descuento", 5), ("iva", 6), ("total", 8)]
        for clave_valor, col_destino in columnas_destino:
            celda_origen = ubicacion.get(clave_valor) if ubicacion else None
            if celda_origen:
                ws.cell(row=fila, column=col_destino, value=f"=VALUE({_dir(nombre_hoja, celda_origen)})").number_format = _FORMATO_MONEDA
            else:
                _celda_manual(ws, fila, col_destino, 0, f"No se localizó '{clave_valor}' en {nombre_hoja} — captura a mano.")
            direcciones[f"{prefijo_campo}_{clave_valor}"] = f"'{HOJA_ENTRYSAL}'!{get_column_letter(col_destino)}{fila}"
        ws.cell(row=fila, column=7, value=0).number_format = _FORMATO_MONEDA  # IEPS: sin columna fuente en ninguna hoja ENT
        # Columnas de validación por fila: I=D-E+F+G (total esperado), J=H-I (diferencia), K=flag.
        ws.cell(row=fila, column=9, value=f"=D{fila}-E{fila}+F{fila}+G{fila}").number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=10, value=f"=+H{fila}-I{fila}").number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=11, value=f'=IF(ABS(J{fila})<1,"OK","REVISAR")')
        fila += 1
    fila_fin_entradas = fila - 1  # 34

    fila_sumas = 35
    for col in "DEFGHI":
        ws.cell(row=fila_sumas, column=ord(col) - 64, value=f"=SUM({col}30:{col}{fila_fin_entradas})").number_format = _FORMATO_MONEDA
    ws.cell(row=35, column=3, value="s/modulo inv")

    ws.cell(row=36, column=3, value="VS/BALANZA")
    if f_bal is not None:
        ws.cell(row=36, column=4, value=f"={_dir(HOJA_BALANZA, (f_bal, 3))}").number_format = _FORMATO_MONEDA
    else:
        _celda_manual(ws, 36, 4, 0, f"Cuenta {CUENTA_TOTAL_INVENTARIOS} no encontrada en 1BALANZA — captura a mano.")
    ws.cell(row=37, column=3, value="DIFERENCIA")
    ws.cell(row=37, column=4, value="=+D36-D35").number_format = _FORMATO_MONEDA
    ws.cell(row=37, column=7, value="=D35+F35").number_format = _FORMATO_MONEDA
    ws.cell(row=37, column=9, value="=+H35+E35-F35-G35").number_format = _FORMATO_MONEDA
    ws.cell(row=38, column=4, value="=+E22+D37").number_format = _FORMATO_MONEDA
    ws.cell(row=38, column=9, value="=+I37-D38").number_format = _FORMATO_MONEDA
    direcciones["entrysal_i37_dir"] = f"'{HOJA_ENTRYSAL}'!I37"

    # Rótulos en celdas que antes quedaban sin título (no tocan ninguna fórmula).
    ws.cell(row=9, column=8, value="DIF. vs ENT. MTTO").alignment = Alignment(horizontal="right")
    ws.cell(row=38, column=3, value="DIF. TOTAL")

    # ── Formato: bandas de sección, bordes, franjas, totales, semáforo ──
    for fila_banda in (4, 25):
        for c in range(2, 12):
            ws.cell(row=fila_banda, column=c).fill = _FILL_SECCION
        ws.cell(row=fila_banda, column=2).font = _FONT_SECCION
        ws.row_dimensions[fila_banda].height = 22

    for c in range(3, 6):  # encabezado de Despachos (C7:E7)
        ws.cell(row=7, column=c).fill = _FILL_HEADER
        ws.cell(row=7, column=c).alignment = Alignment(horizontal="center")
    for c in range(3, 5):  # sub-encabezado de centros de costo (fila 11)
        ws.cell(row=11, column=c).fill = _FILL_HEADER
        ws.cell(row=11, column=c).font = _FONT_HEADER
    ws.cell(row=11, column=4, value="MONTO").alignment = Alignment(horizontal="center")
    for f_encabezado in (7, 28):
        ws.row_dimensions[f_encabezado].height = 22
        for c in range(3, 12):
            celda = ws.cell(row=f_encabezado, column=c)
            if celda.value is not None:
                celda.alignment = Alignment(horizontal="center" if c > 3 else "left", vertical="center", wrap_text=True)

    _aplicar_borde_rango(ws, 7, 9, 3, 5)
    _aplicar_borde_rango(ws, 11, fila_fin_departamentos, 3, 5)
    _aplicar_zebra(ws, 12, fila_fin_departamentos, 3, 4)
    _aplicar_borde_rango(ws, 20, 22, 3, 6)
    _aplicar_borde_rango(ws, 28, fila_fin_entradas, 3, 11)
    _aplicar_zebra(ws, 30, fila_fin_entradas, 3, 11)
    _aplicar_borde_rango(ws, fila_sumas, 38, 3, 9)

    # Totales y bloques de validación en negrita con fondo de total.
    for fila_total, col_ini, col_fin in ((9, 3, 5), (fila_fin_departamentos, 3, 5), (fila_sumas, 3, 9), (22, 3, 5)):
        for c in range(col_ini, col_fin + 1):
            celda = ws.cell(row=fila_total, column=c)
            celda.fill = _FILL_TOTAL
            celda.font = _FONT_NEGRITA
    for fila_rotulo in (20, 21, 36, 37, 38):
        ws.cell(row=fila_rotulo, column=3).font = _FONT_NEGRITA if fila_rotulo in (37, 38) else _FONT_NORMAL

    # Números a la derecha, texto de etiquetas a la izquierda, fuente uniforme.
    for fila_datos in range(8, 39):
        for c in range(3, 12):
            celda = ws.cell(row=fila_datos, column=c)
            if celda.value is None or fila_datos in (28,):
                continue
            if c == 3 or (isinstance(celda.value, str) and not celda.value.startswith("=")):
                celda.alignment = Alignment(horizontal="left" if c == 3 else "center", vertical="center")
            else:
                celda.alignment = Alignment(horizontal="right", vertical="center")
            if celda.font == Font() or celda.font.name != _FUENTE:
                celda.font = _FONT_NEGRITA if celda.font.b else _FONT_NORMAL
    _semaforo(ws, "E22", "E22")
    _semaforo(ws, "D37", "D37")
    _semaforo(ws, "D38", "D38")
    _semaforo(ws, "I38", "I38")
    _semaforo(ws, "I9", "I9")
    _semaforo(ws, f"J30:J{fila_fin_entradas}", "J30")
    _semaforo_texto(ws, f"K30:K{fila_fin_entradas}")

    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = _COLOR_TAB_RESULTADO
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 4
    ws.column_dimensions["C"].width = 36
    for col in "DEFGHIJK":
        ws.column_dimensions[col].width = 17

    return direcciones


# ── 4) Amarre COSTO ──────────────────────────────────────────────────────


def _construir_hoja_amarre_costo(
    wb: Workbook,
    periodo: AmarreCostoPeriodo,
    consignacion: list[AmarreCostoConsignacionRenglon],
    balanza_filas: Grid,
    direcciones_gran_total: dict[str, dict[str, str]],
    direcciones_entrysal: dict[str, str],
) -> dict[str, str]:
    """
    Reconstruye "Amarre COSTO" con el layout y las filas EXACTAS del libro
    maestro real (confirmado celda por celda, dos veces en la misma
    sesión): tabla principal (fila 17 encabezados, 18-25 los 6 centros +
    Tarj. Ladatel), bloque "INVENTARIO FINAL (UEPS)" (G33:G40) +
    "CONTABILIZADO" (I33:J41), Mercancía en Consignación (46:56), y la
    hoja "PÓLIZA CONTABLE: COSTO DE VENTAS" completa (61:90) — el asiento
    contable final que debe cuadrar en 0 (D90).
    """
    ws = wb.create_sheet(HOJA_AMARRE_COSTO)
    _banner(ws, f"Amarre de Costo de Ventas — {periodo.periodo}", ultima_columna=11)

    ws.cell(row=14, column=2, value=f"DETERMINACION DEL COSTO DE VENTAS {periodo.periodo}").font = _FONT_NEGRITA

    encabezados = {
        3: "INVENTARIO INICIAL", 4: "(+) ENTRADAS ALMACEN", 5: "(-)TRASPASOS DEL ALM",
        6: "INVENTARIO EN LIBROS", 7: "(-) INVENTARIO FINAL", 8: "DIFERENCIA AL COSTO DE VENTAS",
        9: "COSTO CONTABILIZADO", 10: "DIF A CONTABILIZAR", 11: "CTA CONTAB",
    }
    for col, texto in encabezados.items():
        celda = ws.cell(row=17, column=col, value=texto)
        celda.font = _FONT_HEADER
        celda.fill = _FILL_HEADER

    def _fila_balanza(codigo: str) -> int | None:
        return localizar_balanza_fila(balanza_filas, codigo)

    direcciones: dict[str, str] = {}

    # ── Fila 18: Mantenimiento — sin cuenta propia de inventario inicial ──
    ws.cell(row=18, column=2, value="MANTENIMIENTO")
    ws.cell(row=18, column=3, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=18, column=4, value=f"={direcciones_entrysal['ent_mtto_subtotal']}").number_format = _FORMATO_MONEDA
    ws.cell(row=18, column=5, value="=D18").number_format = _FORMATO_MONEDA

    # ── Fila 19: Almacén General — las salidas SUYAS son un egreso (se
    # restan): despacho a gasto crudo + despacho mtto − entradas mtto (ver
    # `amarre_costo_reportes.py::_linea_alm_gral` para la derivación
    # algebraica completa, ya validada contra el libro real). ──────────
    ws.cell(row=19, column=2, value="ALM GENERAL")
    f_inicial = _fila_balanza(CUENTA_ALM_GRAL)
    if f_inicial is not None:
        ws.cell(row=19, column=3, value=f"={_dir(HOJA_BALANZA, (f_inicial, 2))}").number_format = _FORMATO_MONEDA
    else:
        _celda_manual(ws, 19, 3, periodo.inv_inicial_alm_gral, f"Cuenta {CUENTA_ALM_GRAL} no encontrada en 1BALANZA (saldo $0 el mes pasado) — captura a mano.")
    ws.cell(row=19, column=4, value=f"={direcciones_entrysal['ent_alm_gral_subtotal']}").number_format = _FORMATO_MONEDA
    formula_salidas = (
        f"={direcciones_entrysal['entrysal_despacho_gasto']}"
        f"+{direcciones_entrysal['entrysal_despacho_mtto']}"
        f"-{direcciones_entrysal['ent_mtto_subtotal']}"
    )
    ws.cell(row=19, column=5, value=formula_salidas).number_format = _FORMATO_MONEDA
    ws.cell(row=19, column=6, value="=C19+D19-E19").number_format = _FORMATO_MONEDA
    ws.cell(row=19, column=7, value="=+G34").number_format = _FORMATO_MONEDA
    ws.cell(row=19, column=8, value="=+C19+D19-E19-G19").number_format = _FORMATO_MONEDA

    # ── Filas 20-23: satélites — lo traspasado desde Almacén General es un
    # INGRESO para ellos (se suma), confirmado con el libro real. ──────
    satelites = [
        (20, "RESTAURANT", CUENTA_RESTAURANT, "ent_rest_subtotal", ("entrysal_restaurant", "entrysal_carreta_alimentos"), "G35", CUENTA_COSTO_RESTAURANT),
        (21, "BAR", CUENTA_BAR, None, ("entrysal_palapa_bar", "entrysal_carreta_bebidas"), "G36", CUENTA_COSTO_BAR),
        (22, "CAFETERIA", CUENTA_CAFETERIA, "ent_cafeteria_subtotal", ("entrysal_cafeteria_alimentos", "entrysal_cafeteria_bebidas", "entrysal_souvenirs_cafe"), "G37", CUENTA_COSTO_CAFETERIA),
    ]
    for fila, nombre, cuenta, campo_entradas, campos_traspaso, ref_inv_final, cuenta_contab in satelites:
        ws.cell(row=fila, column=2, value=nombre)
        f_inicial = _fila_balanza(cuenta)
        if f_inicial is not None:
            ws.cell(row=fila, column=3, value=f"={_dir(HOJA_BALANZA, (f_inicial, 2))}").number_format = _FORMATO_MONEDA
        else:
            _celda_manual(ws, fila, 3, 0, f"Cuenta {cuenta} no encontrada en 1BALANZA — captura a mano.")
        if campo_entradas:
            ws.cell(row=fila, column=4, value=f"={direcciones_entrysal[campo_entradas]}").number_format = _FORMATO_MONEDA
        else:
            ws.cell(row=fila, column=4, value=0).number_format = _FORMATO_MONEDA
        traspasos_validos = [direcciones_entrysal[c] for c in campos_traspaso if direcciones_entrysal.get(c)]
        ws.cell(row=fila, column=5, value="=" + "+".join(traspasos_validos) if traspasos_validos else 0).number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=6, value=f"=C{fila}+D{fila}+E{fila}").number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=7, value=f"=+{ref_inv_final}").number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=8, value=f"=+C{fila}+D{fila}+E{fila}-G{fila}").number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=9, value=f"=+E{fila}").number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=10, value=f"=+H{fila}-I{fila}").number_format = _FORMATO_MONEDA
        ws.cell(row=fila, column=11, value=cuenta_contab)

    # Fila 23: Tienda — mismo patrón que los satélites de arriba, con la
    # peculiaridad real de que D23 resta D25 (Tarjetas Ladatel).
    ws.cell(row=23, column=2, value="TIENDA")
    f_inicial = _fila_balanza(CUENTA_TIENDA)
    if f_inicial is not None:
        ws.cell(row=23, column=3, value=f"={_dir(HOJA_BALANZA, (f_inicial, 2))}").number_format = _FORMATO_MONEDA
    else:
        _celda_manual(ws, 23, 3, 0, f"Cuenta {CUENTA_TIENDA} no encontrada en 1BALANZA — captura a mano.")
    ws.cell(row=23, column=4, value=f"={direcciones_entrysal['ent_tienda_subtotal']}-D25").number_format = _FORMATO_MONEDA
    ws.cell(row=23, column=5, value=f"={direcciones_entrysal['entrysal_tienda']}").number_format = _FORMATO_MONEDA
    ws.cell(row=23, column=6, value="=C23+D23+E23").number_format = _FORMATO_MONEDA
    ws.cell(row=23, column=7, value="=+G38").number_format = _FORMATO_MONEDA
    ws.cell(row=23, column=8, value="=+C23+D23+E23-G23").number_format = _FORMATO_MONEDA
    ws.cell(row=23, column=9, value="=+E23").number_format = _FORMATO_MONEDA
    ws.cell(row=23, column=10, value="=+H23-I23").number_format = _FORMATO_MONEDA
    ws.cell(row=23, column=11, value=CUENTA_COSTO_TIENDA)

    # Fila 24: totales de la sección.
    # Antes solo llegaba hasta H: faltaban I (Costo Contabilizado) y J (Dif a
    # Contabilizar); J24 además alimenta K40 e I41 más abajo.
    for col in range(3, 11):
        letra = get_column_letter(col)
        fila_inicio_suma = 19 if col in (6, 8, 9) else 18  # F/H/I suman 19:23 (Mantenimiento no aplica), como el original
        celda = ws.cell(row=24, column=col, value=f"=SUM({letra}{fila_inicio_suma}:{letra}23)")
        celda.font = _FONT_NEGRITA
        celda.number_format = _FORMATO_MONEDA
    ws.cell(row=24, column=2, value="TOTAL").font = _FONT_NEGRITA

    # Fila 25: Tarjetas Ladatel.
    ws.cell(row=25, column=2, value="TARJ. LADATEL")
    ws.cell(row=25, column=3, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=25, column=4, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=25, column=5, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=25, column=7, value="=G56").number_format = _FORMATO_MONEDA
    ws.cell(row=25, column=8, value="=+C25+D25-G25").number_format = _FORMATO_MONEDA

    # ── G33:G41 "INVENTARIO FINAL (UEPS)" + I33:J41 "CONTABILIZADO" ────
    ws.cell(row=33, column=7, value="INVENTARIO FINAL (UEPS)").font = _FONT_NEGRITA
    ws.cell(row=33, column=9, value="CONTABILIZADO").font = _FONT_NEGRITA
    ws.cell(row=33, column=10, value="DIF A CONTABILIZAR").font = _FONT_NEGRITA

    ws.cell(row=34, column=4, value="ALMACEN GRAL")
    ws.cell(row=34, column=7, value=f"={direcciones_gran_total[HOJA_ALM_GRAL]['__gran_total__']}").number_format = _FORMATO_MONEDA
    f_total_inv = localizar_balanza_fila(balanza_filas, CUENTA_TOTAL_INVENTARIOS)
    if f_total_inv is not None:
        ws.cell(row=34, column=9, value=f"={_dir(HOJA_BALANZA, (f_total_inv, 6))}").number_format = _FORMATO_MONEDA
    else:
        _celda_manual(ws, 34, 9, 0, f"Cuenta {CUENTA_TOTAL_INVENTARIOS} no encontrada en 1BALANZA — captura a mano.")
    ws.cell(row=34, column=10, value="=+G40-I34").number_format = _FORMATO_MONEDA

    ws.cell(row=35, column=4, value="RESTAURANT")
    ws.cell(row=35, column=7, value=f"={direcciones_gran_total[HOJA_REST_BAR]['restaurant_alimentos']}").number_format = _FORMATO_MONEDA
    ws.cell(row=35, column=9, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=35, column=10, value=0).number_format = _FORMATO_MONEDA

    ws.cell(row=36, column=4, value="BAR")
    ws.cell(row=36, column=7, value=f"={direcciones_gran_total[HOJA_REST_BAR]['bar_bebidas']}").number_format = _FORMATO_MONEDA
    ws.cell(row=36, column=9, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=36, column=10, value=0).number_format = _FORMATO_MONEDA

    ws.cell(row=37, column=4, value="CAFETERIA")
    ws.cell(row=37, column=7, value=f"={direcciones_gran_total[HOJA_CAFETERIA]['__gran_total__']}").number_format = _FORMATO_MONEDA

    ws.cell(row=38, column=4, value="TIENDA - TARJETAS")
    ws.cell(row=38, column=7, value=f"={direcciones_gran_total[HOJA_TIENDA]['__gran_total__']}").number_format = _FORMATO_MONEDA
    ws.cell(row=38, column=9, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=38, column=10, value=0).number_format = _FORMATO_MONEDA

    ws.cell(row=39, column=4, value="MANTENIMIENTO")
    _celda_manual(ws, 39, 7, periodo.inv_final_mantenimiento, "Inventario final de Mantenimiento — sin fuente en ningún reporte, captura manual.")

    ws.cell(row=40, column=4, value="total INVENTARIOS").font = _FONT_NEGRITA
    ws.cell(row=40, column=7, value="=SUM(G34:G39)").font = _FONT_NEGRITA
    ws.cell(row=40, column=7).number_format = _FORMATO_MONEDA
    ws.cell(row=40, column=9, value="=SUM(I34:I39)").number_format = _FORMATO_MONEDA
    ws.cell(row=40, column=10, value="=G40-I40").number_format = _FORMATO_MONEDA
    ws.cell(row=40, column=11, value="=+J24+J40").number_format = _FORMATO_MONEDA
    ws.cell(row=41, column=9, value="=+G40+J24+H19").number_format = _FORMATO_MONEDA

    direcciones["inv_final_mantenimiento_dir"] = f"'{HOJA_AMARRE_COSTO}'!G39"
    direcciones["inv_final_alm_gral_dir"] = f"'{HOJA_AMARRE_COSTO}'!G34"
    direcciones["inventario_final_total_dir"] = f"'{HOJA_AMARRE_COSTO}'!G40"

    # ── C46:G59 Mercancía en Consignación / No Forma Parte del Inventario ──
    ws.cell(row=46, column=3, value="AQUÍ VAMOS A REGISTRAR LO QUE NO PERTENECE A INVENTARIOS").font = _FONT_NEGRITA
    fila = 47
    fila_primer_renglon = fila
    for renglon in consignacion:
        ws.cell(row=fila, column=3, value=renglon.concepto)
        celda = ws.cell(row=fila, column=7, value=renglon.monto)
        celda.fill = _FILL_MANUAL
        celda.font = _FONT_MANUAL
        celda.number_format = _FORMATO_MONEDA
        fila += 1
    fila_ultimo_renglon = max(fila - 1, fila_primer_renglon)
    ws.cell(row=56, column=4, value="A DESCONTAR DEL INV").font = _FONT_NEGRITA
    rango_suma = f"G{fila_primer_renglon}:G{fila_ultimo_renglon}" if consignacion else "G47:G47"
    celda_g56 = ws.cell(row=56, column=7, value=f"=SUM({rango_suma})")
    celda_g56.font = _FONT_NEGRITA
    celda_g56.number_format = _FORMATO_MONEDA
    direcciones["consignacion_total_dir"] = f"'{HOJA_AMARRE_COSTO}'!G56"
    direcciones["consignacion_rango_dir"] = f"'{HOJA_AMARRE_COSTO}'!{rango_suma}"

    # ── B61:E90 PÓLIZA CONTABLE: COSTO DE VENTAS ────────────────────────
    ws.merge_cells(start_row=61, start_column=2, end_row=61, end_column=5)
    banner_poliza = ws.cell(row=61, column=2, value=f"POLIZA CONTABLE: COSTO DE VENTAS MES {periodo.periodo}")
    banner_poliza.font = _FONT_NEGRITA
    for col, texto in zip("BCDE", ["CUENTA", "CONCEPTO", "CARGO", "ABONO"]):
        celda = ws.cell(row=62, column=ord(col) - 64, value=texto)
        celda.font = _FONT_HEADER
        celda.fill = _FILL_HEADER

    ws.cell(row=64, column=2, value=CUENTA_TARJ_LADATEL_ANTICIPO)
    ws.cell(row=64, column=3, value="PAG. ANT. TARJ LAD")
    ws.cell(row=64, column=5, value="=+H25/1.05/1.16").number_format = _FORMATO_MONEDA
    ws.cell(row=65, column=2, value=CUENTA_TARJ_LADATEL_COSTO)
    ws.cell(row=65, column=3, value="COSTO TARJ. LAD.")
    ws.cell(row=65, column=4, value="=+E64").number_format = _FORMATO_MONEDA
    ws.cell(row=66, column=3, value="Reg Costo Tarj ladatel pte mes")

    ws.cell(row=69, column=2, value=CUENTA_COSTO_RESTAURANT)
    ws.cell(row=69, column=3, value="COSTO RESTAURANT")
    ws.cell(row=69, column=4, value="=+J20").number_format = _FORMATO_MONEDA
    ws.cell(row=70, column=2, value=CUENTA_COSTO_BAR)
    ws.cell(row=70, column=3, value="COSTO BAR")
    ws.cell(row=70, column=4, value="=+J21").number_format = _FORMATO_MONEDA
    ws.cell(row=71, column=2, value=CUENTA_COSTO_CAFETERIA)
    ws.cell(row=71, column=3, value="COSTO CAFETERIA")
    ws.cell(row=71, column=4, value="=J22").number_format = _FORMATO_MONEDA
    ws.cell(row=72, column=2, value=CUENTA_COSTO_TIENDA)
    ws.cell(row=72, column=3, value="COSTO DE TIENDA")
    ws.cell(row=72, column=4, value="=+J23-D81").number_format = _FORMATO_MONEDA
    ws.cell(row=73, column=3, value="Consumo de Inventarios")

    ws.cell(row=75, column=2, value=CUENTA_ALIMENTOS_INV)
    ws.cell(row=75, column=3, value="ALIMENTOS (INV)")
    ws.cell(row=75, column=4, value="=+J40").number_format = _FORMATO_MONEDA
    ws.cell(row=76, column=3, value="Consumo de Inventarios")

    ws.cell(row=78, column=2, value=CUENTA_COSTO_RESTAURANT)
    ws.cell(row=78, column=3, value="COSTO RESTAURANT")
    ws.cell(row=78, column=4, value="=-K40").number_format = _FORMATO_MONEDA
    ws.cell(row=79, column=3, value="Compl Inv Caffenio")

    ws.cell(row=81, column=2, value=CUENTA_COMEDOR_EMP)
    ws.cell(row=81, column=3, value="COMEDOR EMP")
    _celda_manual(ws, 81, 4, 0, "Ajuste de Comedor de Empleados — sin fuente automática, capturar solo cuando aplique.")
    ws.cell(row=82, column=2, value=CUENTA_ALIMENTOS_COMEDOR)
    ws.cell(row=82, column=3, value="ALIMENTOS COMEDOR")
    _celda_manual(ws, 82, 4, 0, "Ajuste de Alimentos Comedor — sin fuente automática, capturar solo cuando aplique.")
    ws.cell(row=83, column=3, value="Correcc Salidas Alm")

    ws.cell(row=85, column=2, value=CUENTA_COSTO_RESTAURANT)
    ws.cell(row=85, column=3, value="COSTO RESTAURANT")
    _celda_manual(ws, 85, 4, 0, "Corrección de Salidas de Almacén — sin fuente automática, capturar solo cuando aplique.")

    ws.cell(row=88, column=3, value="SUMAS IGUALES").font = _FONT_NEGRITA
    celda_d88 = ws.cell(row=88, column=4, value="=SUM(D65:D87)")
    celda_d88.font = _FONT_NEGRITA
    celda_d88.number_format = _FORMATO_MONEDA
    celda_e88 = ws.cell(row=88, column=5, value="=SUM(E64:E87)")
    celda_e88.font = _FONT_NEGRITA
    celda_e88.number_format = _FORMATO_MONEDA

    celda_d90 = ws.cell(row=90, column=4, value="=+D88-E88")
    celda_d90.font = Font(name=_FUENTE, size=12, bold=True)
    celda_d90.number_format = _FORMATO_MONEDA
    celda_d90.comment = _comentario("Debe ser 0 — la póliza cuadra en partida doble (cargos = abonos). Si no da 0, revisa los ajustes manuales de las filas 81, 82 y 85.")
    ws.cell(row=90, column=3, value="DEBE CUADRAR EN 0 →").font = _FONT_NEGRITA

    # ── Formato: bordes, franjas, secciones y semáforo verde/rojo ──────
    ws.cell(row=14, column=2).fill = _FILL_SECCION
    ws.cell(row=14, column=2).font = _FONT_SECCION
    ws.merge_cells(start_row=14, start_column=2, end_row=14, end_column=11)

    _aplicar_borde_rango(ws, 17, 25, 2, 11)
    _aplicar_zebra(ws, 18, 23, 2, 11)
    for c in range(2, 12):
        ws.cell(row=24, column=c).fill = _FILL_TOTAL

    ws.cell(row=33, column=7).fill = _FILL_SECCION
    ws.cell(row=33, column=9).fill = _FILL_SECCION
    ws.cell(row=33, column=10).fill = _FILL_SECCION
    _aplicar_borde_rango(ws, 34, 40, 4, 10)
    _aplicar_zebra(ws, 34, 39, 4, 10)
    for c in range(4, 11):
        ws.cell(row=40, column=c).fill = _FILL_TOTAL

    ws.cell(row=46, column=3).fill = _FILL_SECCION
    ws.cell(row=46, column=3).font = _FONT_SECCION
    ws.merge_cells(start_row=46, start_column=3, end_row=46, end_column=7)
    _aplicar_borde_rango(ws, 47, 56, 3, 7)
    _aplicar_zebra(ws, 47, fila_ultimo_renglon, 3, 7)
    for c in range(3, 8):
        ws.cell(row=56, column=c).fill = _FILL_TOTAL

    ws.cell(row=61, column=2).fill = _FILL_BANNER
    ws.cell(row=61, column=2).font = _FONT_BANNER
    _aplicar_borde_rango(ws, 62, 88, 2, 5)
    _aplicar_zebra(ws, 64, 87, 2, 5)
    for c in range(2, 6):
        ws.cell(row=88, column=c).fill = _FILL_TOTAL

    _semaforo(ws, "D90", "D90")

    # ── Rediseño visual (solo presentación: ninguna fórmula/dirección cambia) ──
    _aplicar_diseno_amarre_costo(ws, fila_ultimo_renglon)

    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = _COLOR_TAB_RESULTADO

    for col, ancho in zip("ABCDEFGHIJK", (3, 22, 32, 19, 19, 19, 19, 19, 19, 19, 16)):
        ws.column_dimensions[col].width = ancho

    return direcciones


def _aplicar_diseno_amarre_costo(ws: Worksheet, fila_ultimo_renglon: int) -> None:
    """
    Rediseño de `Amarre COSTO`: tarjetas de resumen rápido arriba (rellenan el
    hueco de las filas 3-12 con referencias a celdas que ya existen), bandas
    de sección con título, encabezados centrados y con ajuste de texto,
    números alineados a la derecha y glosas de la póliza en gris cursiva.
    """
    centro = Alignment(horizontal="center", vertical="center", wrap_text=True)
    derecha = Alignment(horizontal="right", vertical="center")
    izquierda = Alignment(horizontal="left", vertical="center")

    def _banda(fila: int, col_ini: int, col_fin: int, texto: str | None = None) -> None:
        for c in range(col_ini, col_fin + 1):
            ws.cell(row=fila, column=c).fill = _FILL_SECCION
        if texto is not None:
            celda = ws.cell(row=fila, column=col_ini, value=texto)
            celda.font = _FONT_SECCION
            celda.alignment = izquierda
        ws.row_dimensions[fila].height = 22

    def _encabezado(fila: int, col_ini: int, col_fin: int) -> None:
        for c in range(col_ini, col_fin + 1):
            celda = ws.cell(row=fila, column=c)
            celda.fill = _FILL_HEADER
            celda.font = _FONT_HEADER
            celda.alignment = centro

    # Subtítulo bajo el banner
    ws.cell(row=2, column=2, value="Resumen del costo de ventas del mes, inventario final y póliza contable").font = Font(
        name=_FUENTE, size=10, italic=True, color="5C6B82"
    )

    # ── Resumen rápido (tarjetas, filas 4-7) ──
    _banda(3, 2, 11, "RESUMEN RÁPIDO")
    tarjetas = [
        (2, 3, "DIF. AL COSTO DE VENTAS", "=H24"),
        (4, 5, "COSTO CONTABILIZADO", "=I24"),
        (6, 7, "DIF. A CONTABILIZAR", "=J24"),
        (8, 9, "INVENTARIO FINAL TOTAL", "=G40"),
        (10, 11, "PÓLIZA (DEBE SER 0)", "=D90"),
    ]
    for col_ini, col_fin, titulo, formula in tarjetas:
        ws.merge_cells(start_row=4, start_column=col_ini, end_row=4, end_column=col_fin)
        ws.merge_cells(start_row=5, start_column=col_ini, end_row=6, end_column=col_fin)
        encabezado = ws.cell(row=4, column=col_ini, value=titulo)
        encabezado.font = _FONT_HEADER
        encabezado.fill = _FILL_HEADER
        encabezado.alignment = centro
        valor = ws.cell(row=5, column=col_ini, value=formula)
        valor.font = Font(name=_FUENTE, size=16, bold=True, color="1864AB")
        valor.number_format = _FORMATO_MONEDA
        valor.alignment = Alignment(horizontal="center", vertical="center")
        for f in range(4, 7):
            for c in range(col_ini, col_fin + 1):
                ws.cell(row=f, column=c).border = _BORDE
                if f > 4:
                    ws.cell(row=f, column=c).fill = _FILL_TOTAL
    ws.row_dimensions[4].height = 24
    ws.row_dimensions[5].height = 20
    ws.row_dimensions[6].height = 20
    _semaforo(ws, "J5", "J5")  # la póliza cuadra si |D90| < 1

    # ── Tabla principal (fila 14 título, 17 encabezado, 18-25 datos) ──
    ws.cell(row=14, column=2).alignment = izquierda
    ws.row_dimensions[14].height = 24
    ws.row_dimensions[17].height = 36
    _encabezado(17, 2, 11)
    ws.cell(row=17, column=2, value="CENTRO DE COSTO")
    ws.cell(row=17, column=2).alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    for f in range(18, 26):
        ws.cell(row=f, column=2).font = _FONT_NEGRITA
        ws.cell(row=f, column=2).alignment = izquierda
        for c in range(3, 11):
            ws.cell(row=f, column=c).alignment = derecha
        ws.cell(row=f, column=11).alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[f].height = 19
    ws.row_dimensions[24].height = 22

    # ── Inventario final / Contabilizado (filas 33-41) ──
    _banda(32, 4, 10, "INVENTARIO FINAL Y CONTABILIZADO")
    ws.cell(row=33, column=4, value="ALMACÉN")
    _encabezado(33, 4, 10)
    ws.cell(row=33, column=5).value = None
    ws.merge_cells(start_row=33, start_column=4, end_row=33, end_column=6)
    for f in range(34, 42):
        ws.cell(row=f, column=4).alignment = izquierda
        for c in range(7, 11):
            ws.cell(row=f, column=c).alignment = derecha
    ws.cell(row=41, column=9).font = _FONT_NEGRITA
    ws.cell(row=41, column=8, value="Ajuste control").font = Font(name=_FUENTE, size=9, italic=True, color="5C6B82")
    ws.cell(row=41, column=8).alignment = derecha

    # ── Consignación (filas 46-56) ──
    _banda(45, 3, 7, "MERCANCÍA EN CONSIGNACIÓN / NO FORMA PARTE DEL INVENTARIO")
    ws.cell(row=46, column=3, value="Registrar aquí lo que no pertenece a inventarios (concepto y monto)").font = Font(
        name=_FUENTE, size=10, italic=True, color="5C6B82"
    )
    ws.cell(row=46, column=3).fill = _FILL_ZEBRA
    ws.cell(row=46, column=3).alignment = izquierda
    for f in range(47, 57):
        ws.cell(row=f, column=7).alignment = derecha

    # ── Póliza (filas 61-90) ──
    ws.merge_cells(start_row=61, start_column=2, end_row=61, end_column=5)
    ws.cell(row=61, column=2).alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[61].height = 24
    _encabezado(62, 2, 5)
    ws.row_dimensions[62].height = 22
    for f in range(63, 91):
        ws.cell(row=f, column=2).alignment = izquierda
        for c in (4, 5):
            ws.cell(row=f, column=c).alignment = derecha
            if f != 89:
                ws.cell(row=f, column=c).number_format = _FORMATO_MONEDA
    for f in (66, 73, 76, 79, 83):  # glosas del asiento
        for c in range(2, 6):
            ws.cell(row=f, column=c).font = Font(name=_FUENTE, size=9, italic=True, color="5C6B82")
    _aplicar_borde_rango(ws, 89, 90, 2, 5)
    for c in range(2, 6):
        ws.cell(row=90, column=c).fill = _FILL_TOTAL
    ws.row_dimensions[90].height = 24


# ── 5) 4Resumen INV ──────────────────────────────────────────────────────


def _resumen_fila_concepto(
    ws: Worksheet,
    fila: int,
    codigo: str,
    nombre: str,
    direccion_gran_total: str | None,
    balanza_filas: Grid,
    e_fijo_cero: bool = False,
) -> None:
    """
    Un renglón de 4Resumen INV: A = código con punto, B = con guion, C =
    concepto, E = Saldo Actual en 1BALANZA (0 si la cuenta no aparece — el
    `IFERROR(...,0)` del original), G = Gran Total físico, H = G−E.
    """
    ws.cell(row=fila, column=1, value=codigo)
    ws.cell(row=fila, column=2, value=_codigo_con_guion(codigo))
    ws.cell(row=fila, column=3, value=nombre)
    f = None if e_fijo_cero else localizar_balanza_fila(balanza_filas, codigo)
    if f is not None:
        ws.cell(row=fila, column=5, value=f"={_dir(HOJA_BALANZA, (f, 6))}").number_format = _FORMATO_MONEDA
    else:
        ws.cell(row=fila, column=5, value=0).number_format = _FORMATO_MONEDA
    if direccion_gran_total:
        ws.cell(row=fila, column=7, value=f"={direccion_gran_total}").number_format = _FORMATO_MONEDA
    else:
        ws.cell(row=fila, column=7, value=0).number_format = _FORMATO_MONEDA
    ws.cell(row=fila, column=8, value=f"=G{fila}-E{fila}").number_format = _FORMATO_MONEDA


def _codigo_con_guion(codigo: str) -> str:
    """1007101.001 -> 1007-101-001 (solo visual, igual que la columna B del original)."""
    base, _, sufijo = codigo.partition(".")
    return f"{base[:4]}-{base[4:]}-{sufijo}"


# (fila, código, nombre, campo del Gran Total | None, E fijo en 0)
_RESUMEN_ALM_GRAL = [
    (8, "1007101.001", "ALIMENTOS", "alm_gral_alimentos", False),
    (9, "1007101.002", "BEBIDAS", "alm_gral_bebidas", False),
    (10, "1007101.003", "TABAQUERIA", "alm_gral_tabaqueria", False),
    (11, "1007101.004", "PAPELERIA", "alm_gral_papeleria", False),
    (12, "1007101.005", "HIGIENICOS Y SUMINISTROS Y ART", "alm_gral_higienicos", False),
    (13, "1007101.006", "MEDICINAS Y MEDICAMENTOS", "alm_gral_medicinas", True),
    (14, "1007101.007", "MATERIAL PARA MANTTO", "alm_gral_material_mantto", False),
    (15, "1007101.008", "STOCK MANTENIMIENTO", "alm_gral_stock_mantenimiento", False),
    (16, "1007101.009", "SERVICIOS", "alm_gral_servicios", True),
    (17, "1007101.010", "ROPA Y UNIFORMES", "alm_gral_ropa_uniformes", False),
]
_RESUMEN_TIENDA = [
    (20, "1007102.001", "ALIMENTOS", "tienda_alimentos", False),
    (21, "1007102.002", "BEBIDAS", "tienda_bebidas", False),
    (22, "1007102.003", "TABAQUERIA", "tienda_tabaqueria", False),
    (23, "1007102.004", "PERIODICOS Y OTROS", "tienda_periodicos", False),
    (24, "1007102.005", "HIGIENICOS Y SUM", "tienda_higienicos", False),
    (25, "1007102.006", "MED Y MEDIC", "tienda_medicinas", False),
    (26, "1007102.007", "ROPA", "tienda_ropa", False),
    (27, "1007102.008", "ARTESANIAS", "tienda_artesanias", False),
]
_RESUMEN_CAFETERIA = [
    (36, "1007108.003", "SOUVENIRS CAFETERIA", "cafeteria_souvenirs", False),
    (37, "1007108.002", "BEBIDAS", None, False),  # sin sección en el reporte: G fijo en 0
    (38, "1007108.001", "ALIMENTOS", "cafeteria_alimentos", False),
]
_RESUMEN_REST_BAR = [
    (42, "1007103.001", "ALIMENTOS REST", "restaurant_alimentos", False),
    (43, "1007103.002", "BEBIDAS BAR", "bar_bebidas", False),
]


def _construir_hoja_resumen_inv(
    wb: Workbook,
    balanza_filas: Grid,
    direcciones_gran_total: dict[str, dict[str, str]],
    direcciones_amarre_costo: dict[str, str],
    resumen_lavanderia: float | None,
    balanza_2_filas: Grid | None = None,
) -> None:
    """
    Si viene `balanza_2_filas` (la hoja `1BALANZA 2` pegada), agrega las
    columnas K "BALANZA 2" (Saldo Actual de esa balanza, ubicado por código
    de cuenta) y L "DIF vs BAL. 2" (= K − G, Saldo Real) por concepto.

    Reconstruye "4Resumen INV" con el layout EXACTO del libro real
    (diccionario celda por celda confirmado): detalle por concepto contable
    de los 4 bloques (Alm. Gral. 8-17, Tienda 20-27 + extras 29-33,
    Cafetería 36-38, Rest-Bar 42-43), subtotales por bloque y el bloque de
    validación cruzada contra Amarre COSTO (filas 45-51, todo debe dar 0).
    """
    ws = wb.create_sheet(HOJA_RESUMEN_INV)
    for c in range(1, 10):
        ws.cell(row=1, column=c).fill = _FILL_BANNER
    ws.cell(row=1, column=2, value="En este reporte se captura los montos de los inventarios reales (por rubros) de cierre de mes").font = _FONT_BANNER
    ws.row_dimensions[1].height = 28
    ws.cell(row=2, column=2, value="Verde = cuadra (diferencia menor a $1) · Rojo = revisar · Amarillo = captura manual").font = Font(name=_FUENTE, size=9, italic=True, color="666666")

    # Encabezado de 3 filas (4-6) con el mismo azul en todas las columnas.
    for c in range(1, 10):
        for f in (4, 5, 6):
            ws.cell(row=f, column=c).fill = _FILL_HEADER
            ws.cell(row=f, column=c).font = _FONT_HEADER
            ws.cell(row=f, column=c).alignment = Alignment(horizontal="center", vertical="center")
    for col, texto in ((2, "RESUMEN DE INVENTARIOS"), (5, "SALDO CONTABLE"), (7, "SALDO REAL"), (8, "RECLASIF"), (9, "VS AMARRE")):
        ws.cell(row=4, column=col, value=texto)
    for col, texto in ((2, "CTA GLOBAL"), (5, "(1007)"), (7, "REPORTES")):
        ws.cell(row=5, column=col, value=texto)
    ws.cell(row=6, column=7, value="S/EXISTENCIA")

    def _bloque(filas_def, hoja_gt: str, titulo_fila: int, titulo_codigo: str | None, titulo: str, fila_total: int, color: str):
        # Cada almacén con su propio color de título para distinguir los
        # 4 bloques de un vistazo.
        relleno_bloque = PatternFill(start_color=color, end_color=color, fill_type="solid")
        fuente_bloque = Font(name=_FUENTE, size=11, bold=True, color="FFFFFF")
        ws.cell(row=titulo_fila, column=2, value=titulo)
        for c in range(1, 10):
            ws.cell(row=titulo_fila, column=c).fill = relleno_bloque
            ws.cell(row=titulo_fila, column=c).font = fuente_bloque
        ws.row_dimensions[titulo_fila].height = 20
        if titulo_codigo:
            ws.cell(row=titulo_fila, column=1, value=titulo_codigo)
        primera = filas_def[0][0]
        for fila, codigo, nombre, campo, e_cero in filas_def:
            direccion = direcciones_gran_total[hoja_gt][campo] if campo else None
            _resumen_fila_concepto(ws, fila, codigo, nombre, direccion, balanza_filas, e_cero)
        ultima = filas_def[-1][0]
        for col in "EGH":
            c = ord(col) - 64
            celda = ws.cell(row=fila_total, column=c, value=f"=SUM({col}{primera}:{col}{ultima})")
            celda.font = _FONT_NEGRITA
            celda.number_format = _FORMATO_MONEDA
            celda.fill = _FILL_TOTAL
        _aplicar_borde_rango(ws, primera, fila_total, 1, 8)
        _aplicar_zebra(ws, primera, ultima, 1, 8)

    _bloque(_RESUMEN_ALM_GRAL, HOJA_ALM_GRAL, 7, "1007101", "ALM GENERAL", 18, "1864AB")
    _bloque(_RESUMEN_TIENDA, HOJA_TIENDA, 19, "1007102", "TIENDA", 28, "2E7D32")
    _bloque(_RESUMEN_CAFETERIA, HOJA_CAFETERIA, 35, None, "CAFETERIA", 39, "B45F06")
    _bloque(_RESUMEN_REST_BAR, HOJA_REST_BAR, 41, "1007103", "REST-BAR", 44, "7B1FA2")

    # ── Extras de Tienda (29-33) ─────────────────────────────────────
    ws.cell(row=29, column=3, value="TARJETAS LADATEL")
    _celda_manual(ws, 29, 7, 0, "Sin fuente en los reportes (en el original siempre es 0) — captura manual si aplica.")
    ws.cell(row=30, column=3, value="FICHAS DE LAVANDERIA")
    _celda_manual(ws, 30, 7, resumen_lavanderia, "Sin fuente en ningún reporte — captura manual.")
    ws.cell(row=31, column=3, value="MERC EN CONSIG")
    ws.cell(row=31, column=7, value=f"=SUM({direcciones_amarre_costo['consignacion_rango_dir']})").number_format = _FORMATO_MONEDA
    ws.cell(row=32, column=7, value="=SUM(G28:G31)").number_format = _FORMATO_MONEDA
    ws.cell(row=33, column=7, value=f"=+'{HOJA_AMARRE_COSTO}'!G38+'{HOJA_AMARRE_COSTO}'!G56").number_format = _FORMATO_MONEDA
    _aplicar_borde_rango(ws, 29, 33, 3, 7)

    # ── Totales y validación (45-51) ─────────────────────────────────
    ws.cell(row=45, column=9, value="VALIDACION").font = _FONT_NEGRITA
    ws.cell(row=46, column=3, value="TOTAL SUMAS").font = _FONT_NEGRITA
    ws.cell(row=46, column=5, value="=E18+E28+E44+E39")
    ws.cell(row=46, column=6, value="=F18+F28+F44+F17+F39")
    ws.cell(row=46, column=7, value="=G18+G28+G44+G39")
    ws.cell(row=46, column=8, value="=H18+H28+H44+H39")
    ws.cell(row=46, column=9, value="=+G46-H46-E46")

    ws.cell(row=47, column=2, value=CUENTA_TOTAL_INVENTARIOS)
    ws.cell(row=47, column=3, value="TOTAL INVENTARIOS").font = _FONT_NEGRITA
    f_total = localizar_balanza_fila(balanza_filas, CUENTA_TOTAL_INVENTARIOS)
    if f_total is not None:
        ws.cell(row=47, column=5, value=f"={_dir(HOJA_BALANZA, (f_total, 6))}")
    else:
        _celda_manual(ws, 47, 5, 0, f"Cuenta {CUENTA_TOTAL_INVENTARIOS} no encontrada en 1BALANZA — captura a mano.")
    ws.cell(row=47, column=7, value=f"=+'{HOJA_AMARRE_COSTO}'!G40")

    ws.cell(row=48, column=3, value="COSTO /CONSUMO DE INVENTARIOS").font = _FONT_NEGRITA
    ws.cell(row=48, column=8, value="=+H5-H46")
    ws.cell(row=49, column=8, value="=+H48-G51")

    ws.cell(row=51, column=3, value="DIFERENCIA VS REPORTE DEL AMARRE").font = _FONT_NEGRITA
    ws.cell(row=51, column=5, value="=+E47-E46")
    ws.cell(row=51, column=7, value="=G47-G46")
    ws.cell(row=51, column=8, value=f"=H48+'{HOJA_AMARRE_COSTO}'!D75")

    # Comparaciones contra Amarre COSTO por bloque (columna I).
    ws.cell(row=18, column=9, value=f"=H18+'{HOJA_AMARRE_COSTO}'!H19")
    ws.cell(row=28, column=9, value=f"=H28+'{HOJA_AMARRE_COSTO}'!J23")
    ws.cell(row=39, column=9, value=f"=H39+'{HOJA_AMARRE_COSTO}'!J22")

    for f in (46, 47, 48, 49, 51):
        for c in (5, 6, 7, 8, 9):
            ws.cell(row=f, column=c).number_format = _FORMATO_MONEDA
    for c in range(3, 10):
        ws.cell(row=46, column=c).fill = _FILL_TOTAL
    for f in (18, 28, 39):
        ws.cell(row=f, column=9).number_format = _FORMATO_MONEDA
    _aplicar_borde_rango(ws, 46, 51, 3, 9)
    for rango in ("E51", "G51", "H51", "I46", "I18", "I28", "I39"):
        _semaforo(ws, rango, rango)

    # ── Comparación contra Balanza 2 (columnas K y L, solo si se subió) ──
    if balanza_2_filas is not None:
        for f_enc, texto in ((4, "BALANZA 2"), (5, "SALDO ACTUAL"), (6, "vs SALDO REAL")):
            ws.cell(row=f_enc, column=11, value=texto)
        ws.cell(row=4, column=12, value="DIF vs BAL. 2")
        ws.cell(row=5, column=12, value="(Bal. 2 − Real)")
        for c in (11, 12):
            for f_enc in (4, 5, 6):
                celda = ws.cell(row=f_enc, column=c)
                celda.fill = _FILL_HEADER
                celda.font = _FONT_HEADER
                celda.alignment = Alignment(horizontal="center", vertical="center")

        def _fila_b2(fila: int, codigo: str) -> None:
            f_b2 = localizar_balanza_fila(balanza_2_filas, codigo)
            if f_b2 is not None:
                ws.cell(row=fila, column=11, value=f"={_dir(HOJA_BALANZA_2, (f_b2, 6))}")
            else:
                ws.cell(row=fila, column=11, value=0)  # cuenta ausente = $0, como IFERROR en el original
            ws.cell(row=fila, column=12, value=f"=K{fila}-G{fila}")

        for defs, fila_total in (
            (_RESUMEN_ALM_GRAL, 18), (_RESUMEN_TIENDA, 28), (_RESUMEN_CAFETERIA, 39), (_RESUMEN_REST_BAR, 44),
        ):
            for fila, codigo, *_ in defs:
                _fila_b2(fila, codigo)
            primera, ultima = defs[0][0], defs[-1][0]
            ws.cell(row=fila_total, column=11, value=f"=SUM(K{primera}:K{ultima})")
            ws.cell(row=fila_total, column=12, value=f"=K{fila_total}-G{fila_total}")
            for c in (11, 12):
                ws.cell(row=fila_total, column=c).fill = _FILL_TOTAL
                ws.cell(row=fila_total, column=c).font = _FONT_NEGRITA
        ws.cell(row=46, column=11, value="=K18+K28+K44+K39")
        ws.cell(row=46, column=12, value="=K46-G46")
        for c in (11, 12):
            ws.cell(row=46, column=c).fill = _FILL_TOTAL
            ws.cell(row=46, column=c).font = _FONT_NEGRITA

        filas_datos = [d[0] for defs in (_RESUMEN_ALM_GRAL, _RESUMEN_TIENDA, _RESUMEN_CAFETERIA, _RESUMEN_REST_BAR) for d in defs]
        for fila in filas_datos + [18, 28, 39, 44, 46]:
            for c in (11, 12):
                ws.cell(row=fila, column=c).number_format = _FORMATO_MONEDA
                ws.cell(row=fila, column=c).border = _BORDE
                ws.cell(row=fila, column=c).alignment = Alignment(horizontal="right")
        for fila in filas_datos + [18, 28, 39, 44, 46]:
            _semaforo(ws, f"L{fila}", f"L{fila}")
        ws.column_dimensions["J"].width = 3
        ws.column_dimensions["K"].width = 18
        ws.column_dimensions["L"].width = 18

    # Columna RECLASIF (H): celda con fondo rojo claro (los semáforos
    # condicionales de H51 siguen mandando sobre este color cuando aplican).
    for f in range(8, 52):
        celda = ws.cell(row=f, column=8)
        if celda.value is not None:
            celda.fill = _FILL_REVISAR
            celda.font = Font(name=_FUENTE, size=celda.font.sz or 10, bold=bool(celda.font.b))

    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = _COLOR_TAB_RESULTADO
    for col, ancho in zip("ABCDEFGHI", (13, 15, 34, 3, 18, 12, 18, 18, 16)):
        ws.column_dimensions[col].width = ancho


# ── Orquestador ───────────────────────────────────────────────────────


def generar_workbook_amarre_costo(
    periodo: AmarreCostoPeriodo,
    consignacion: list[AmarreCostoConsignacionRenglon],
    archivos_originales: dict[str, tuple[str, bytes]],
) -> bytes:
    """
    `archivos_originales`: {tipo: (nombre_original, contenido)} — debe traer
    los 12 tipos (ver `TIPOS_VALIDOS`); el router valida esto antes de
    llamar aquí y regresa un 400 claro si falta alguno. Opcionalmente puede
    traer también "balanza-2" (`api/amarre_costo.py::TIPOS_OPCIONALES`) —
    se pega como hoja `1BALANZA 2`, visible, sin fórmulas propias; se
    ignora si no viene.
    """
    wb = Workbook()
    wb.remove(wb.active)  # hoja default vacía

    # Los 4 conteos físicos (los "archivos de almacén" que el usuario sube)
    # se compactan antes de pegar: el reporte Novohit real dispersa sus
    # columnas por la indentación jerárquica (categoría/subcategoría/
    # artículo), dejando decenas de columnas vacías entre "Costo" y "TOTAL
    # Costo" — casi imposible de leer a simple vista. Se usa el MISMO grid
    # compactado tanto para pegar la hoja como para localizar las
    # categorías (`_agregar_gran_total_almacen` abajo), así las coordenadas
    # de las fórmulas siempre coinciden con lo que se ve en la hoja.
    TIPOS_CONTEO_FISICO = {"conteo-alm-gral", "conteo-tienda", "conteo-rest-bar", "conteo-cafeteria"}

    # "balanza-2" es opcional y no tiene hoja fija en NOMBRE_HOJA_POR_TIPO
    # (no alimenta ninguna fórmula de los 3 reportes) — se pega aparte, solo
    # si el periodo la trae, y no entra al loop genérico de abajo (no muta
    # el dict que recibimos: el router puede seguir usándolo después).
    archivo_balanza_2 = archivos_originales.get("balanza-2")
    archivos_originales = {t: v for t, v in archivos_originales.items() if t != "balanza-2"}

    filas_por_tipo: dict[str, Grid] = {}
    for tipo, (nombre_original, contenido) in archivos_originales.items():
        filas = leer_filas_crudas(contenido, nombre_original)
        es_conteo_fisico = tipo in TIPOS_CONTEO_FISICO
        if es_conteo_fisico:
            filas = _compactar_grid(filas)
        filas_por_tipo[tipo] = filas
        _pegar_hoja_cruda(wb, NOMBRE_HOJA_POR_TIPO[tipo], filas, resaltar_totales=es_conteo_fisico)

    direcciones_gran_total: dict[str, dict[str, str]] = {
        HOJA_ALM_GRAL: _agregar_gran_total_almacen(wb, HOJA_ALM_GRAL, filas_por_tipo["conteo-alm-gral"], ALM_GRAL_CAMPOS),
        HOJA_TIENDA: _agregar_gran_total_almacen(wb, HOJA_TIENDA, filas_por_tipo["conteo-tienda"], TIENDA_CAMPOS),
        HOJA_REST_BAR: _agregar_gran_total_almacen(wb, HOJA_REST_BAR, filas_por_tipo["conteo-rest-bar"], REST_BAR_CAMPOS),
        HOJA_CAFETERIA: _agregar_gran_total_almacen(wb, HOJA_CAFETERIA, filas_por_tipo["conteo-cafeteria"], CAFETERIA_CAMPOS),
    }

    direcciones_entrysal = _construir_hoja_entrysal(
        wb,
        filas_por_tipo["salidas-alm-gral"],
        filas_por_tipo["salidas-mtto"],
        {
            HOJA_ENT_CAFETERIA: filas_por_tipo["entradas-cafeteria"],
            HOJA_ENT_ALM_GRAL: filas_por_tipo["entradas-alm-gral"],
            HOJA_ENT_MTTO: filas_por_tipo["entradas-mtto"],
            HOJA_ENT_REST: filas_por_tipo["entradas-rest"],
            HOJA_ENT_TIENDA: filas_por_tipo["entradas-tienda"],
        },
        filas_por_tipo["balanza"],
    )

    direcciones_amarre_costo = _construir_hoja_amarre_costo(
        wb, periodo, consignacion, filas_por_tipo["balanza"], direcciones_gran_total, direcciones_entrysal,
    )

    # "Balanza 2" (opcional): se pega tal cual, con el mismo diseño que
    # 1BALANZA, y queda visible junto a ella — pero solo si el periodo la
    # trae. Se pega ANTES de construir 4Resumen INV porque esa hoja agrega
    # columnas de comparación (K/L) con fórmulas que apuntan a esta hoja.
    filas_balanza_2: Grid | None = None
    if archivo_balanza_2 is not None:
        nombre_original, contenido = archivo_balanza_2
        filas_balanza_2 = leer_filas_crudas(contenido, nombre_original)
        _pegar_hoja_cruda(wb, HOJA_BALANZA_2, filas_balanza_2, resaltar_totales=False)
        _dar_diseno_balanza(wb[HOJA_BALANZA_2])

    _construir_hoja_resumen_inv(
        wb, filas_por_tipo["balanza"], direcciones_gran_total, direcciones_amarre_costo, periodo.resumen_lavanderia,
        balanza_2_filas=filas_balanza_2,
    )

    # Orden de hojas: las 3 principales + la(s) balanza(s) primero y
    # visibles; el resto (fuentes pegadas) va después y OCULTO — siguen ahí
    # porque las fórmulas las referencian (Mostrar hojas ocultas en Excel
    # las revela).
    visibles = [HOJA_AMARRE_COSTO, HOJA_ENTRYSAL, HOJA_RESUMEN_INV, HOJA_BALANZA]
    if archivo_balanza_2 is not None:
        visibles.append(HOJA_BALANZA_2)
    ocultas = [
        HOJA_ALM_GRAL, HOJA_TIENDA, HOJA_REST_BAR, HOJA_CAFETERIA,
        HOJA_SAL_ALM_GRAL, HOJA_SAL_MTTO,
        HOJA_ENT_ALM_GRAL, HOJA_ENT_TIENDA, HOJA_ENT_MTTO, HOJA_ENT_CAFETERIA, HOJA_ENT_REST,
    ]
    wb._sheets = [wb[nombre] for nombre in visibles + ocultas]  # noqa: SLF001 — openpyxl no expone un reorder público
    for nombre in ocultas:
        wb[nombre].sheet_state = "hidden"
    _dar_diseno_balanza(wb[HOJA_BALANZA])
    wb.active = 0
    for hoja in wb.worksheets:
        hoja.sheet_view.tabSelected = hoja.title == HOJA_AMARRE_COSTO

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
