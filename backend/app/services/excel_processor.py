"""
Servicio de procesamiento de archivos Excel — lectura, validación y exportación.

Utiliza pandas + openpyxl para leer y escribir archivos Excel (.xlsx).
"""

import logging
from datetime import date
from io import BytesIO
from pathlib import Path

import pandas as pd

import re

logger = logging.getLogger(__name__)


def _valor_json_seguro(v):
    """
    Convierte un valor de celda de pandas (numpy.int64, pandas.Timestamp,
    NaN, etc.) a un tipo nativo de Python serializable en JSON y escribible
    en Excel sin problema.
    """
    if pd.isna(v):
        return None
    if isinstance(v, (int, float, str, bool)):
        return v
    if hasattr(v, "item"):
        return v.item()
    return str(v)


async def leer_excel_ingresos(file_content: bytes) -> pd.DataFrame:
    """
    Leer un archivo Excel de Ingresos Recibidos.
    """
    import zipfile
    try:
        df = pd.read_excel(BytesIO(file_content))
    except zipfile.BadZipFile:
        # Fallback para .xls si pd.read_excel intenta usar openpyxl por defecto y falla
        df = pd.read_excel(BytesIO(file_content), engine="xlrd")
    return df

async def leer_uuids_cancelados(file_content: bytes) -> list[dict]:
    """
    Leer un Excel de UUID cancelados: busca la columna cuyo encabezado sea
    "UUID" (sin importar la posición) y devuelve, por cada renglón válido,
    un dict con TODAS las columnas originales del archivo (para no perder
    información), más el valor de UUID normalizado (minúsculas, sin
    espacios) bajo la clave "UUID".
    """
    import zipfile
    try:
        df = pd.read_excel(BytesIO(file_content))
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), engine="xlrd")

    df.columns = df.columns.astype(str).str.strip()

    columna_uuid = None
    for columna in df.columns:
        if str(columna).strip().upper() == "UUID":
            columna_uuid = columna
            break

    if not columna_uuid:
        raise ValueError("No se encontró la columna UUID en el archivo de cancelados")

    filas = []
    for _, row in df.iterrows():
        valor_uuid = row.get(columna_uuid)
        if pd.isna(valor_uuid) or not str(valor_uuid).strip():
            continue
        fila = {k: _valor_json_seguro(v) for k, v in row.items() if k != columna_uuid}
        fila["UUID"] = str(valor_uuid).strip().lower()
        filas.append(fila)
    return filas


_CAMPOS_EGRESO = ["Subtotal", "Total descuento", "Neto", "Retención IVA", "Retención ISR", "Traslado IVA", "Total"]


async def leer_egresos(file_content: bytes) -> list[dict]:
    """
    Leer un Excel de Egresos (notas de crédito). Cada fila trae una columna
    "Tipos de relación y UUIDs relacionados" con JSON del estilo
    '[{"@TipoRelacion": "07", "CfdiRelacionado": [{"@UUID": "..."}]}]'
    (o "{}" si no aplica). Por cada UUID relacionado encontrado se devuelve
    un dict con ese uuid, TODAS las columnas originales del renglón, y los
    7 montos de _CAMPOS_EGRESO ya forzados a float (0.0 si faltan/NaN).
    """
    import json
    import zipfile

    try:
        df = pd.read_excel(BytesIO(file_content))
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), engine="xlrd")

    df.columns = df.columns.astype(str).str.strip()

    columna_relacion = None
    for columna in df.columns:
        if str(columna).strip().upper() == "TIPOS DE RELACIÓN Y UUIDS RELACIONADOS":
            columna_relacion = columna
            break

    if not columna_relacion:
        raise ValueError("No se encontró la columna 'Tipos de relación y UUIDs relacionados' en el archivo de egresos")

    resultado = []
    for _, row in df.iterrows():
        valor_relacion = row.get(columna_relacion)
        if pd.isna(valor_relacion) or not str(valor_relacion).strip():
            continue
        try:
            relaciones = json.loads(str(valor_relacion))
        except (ValueError, TypeError):
            continue
        if not isinstance(relaciones, list):
            continue

        uuids_relacionados = set()
        for relacion in relaciones:
            if not isinstance(relacion, dict):
                continue
            for cfdi in relacion.get("CfdiRelacionado", []) or []:
                if isinstance(cfdi, dict) and cfdi.get("@UUID"):
                    uuids_relacionados.add(str(cfdi["@UUID"]).strip().lower())

        # Si la fila relaciona más de un UUID a la vez (ej. una nota de
        # crédito que cubre varias facturas), es ambigua cuánto le
        # corresponde a cada una — se ignora por completo, no se reparte.
        if len(uuids_relacionados) != 1:
            continue

        montos = {}
        for campo in _CAMPOS_EGRESO:
            valor = row.get(campo)
            montos[campo] = float(valor) if pd.notna(valor) else 0.0

        # Se conservan TODAS las columnas originales del renglón (para no
        # perder información del archivo), y encima se sobreescriben los 7
        # montos ya forzados a float — así los cálculos existentes que leen
        # _CAMPOS_EGRESO no cambian de comportamiento.
        fila_completa = {k: _valor_json_seguro(v) for k, v in row.items()}
        for uuid_val in uuids_relacionados:
            resultado.append({"uuid": uuid_val, **fila_completa, **montos})

    return resultado


async def leer_egresos_todas_filas(file_content: bytes) -> list[dict]:
    """
    Todas las filas del archivo de Egresos, sin filtrar por UUID relacionado.
    Solo sirve para el volcado de la hoja Egresos del reporte; la aplicación a
    facturas sigue usando leer_egresos (que descarta filas sin UUID único).
    """
    import zipfile

    try:
        df = pd.read_excel(BytesIO(file_content))
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), engine="xlrd")

    df.columns = df.columns.astype(str).str.strip()
    return [
        {str(k): _valor_json_seguro(v) for k, v in row.items()}
        for _, row in df.iterrows()
    ]


async def leer_excel_pagos(file_content: bytes) -> pd.DataFrame:
    import openpyxl
    import zipfile

    try:
        wb = openpyxl.load_workbook(BytesIO(file_content), data_only=True)
        ws = wb.active

        merged_ranges = list(ws.merged_cells.ranges)
        for merged_range in merged_ranges:
            min_col, min_row, max_col, max_row = merged_range.bounds
            top_left_value = ws.cell(row=min_row, column=min_col).value
            ws.unmerge_cells(str(merged_range))
            for row in range(min_row, max_row + 1):
                for col in range(min_col, max_col + 1):
                    ws.cell(row=row, column=col).value = top_left_value

        clean_buffer = BytesIO()
        wb.save(clean_buffer)
        clean_buffer.seek(0)
        
        df = pd.read_excel(clean_buffer, header=None)
        
        print("\n=== DEBUG (.xlsx) ===", flush=True)
        print(df.head(5).to_string(), flush=True)
        print("=====================\n", flush=True)
        
        return df
    
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), header=None)
        if not df.empty and 0 in df.columns:
            df[0] = df[0].ffill()
        
        print("\n=== DEBUG (.xls) ===", flush=True)
        print(df.head(5).to_string(), flush=True)
        print("====================\n", flush=True)
        
        return df


from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

async def exportar_resultados_excel(
    datos: list[dict],
    nombre_hoja: str = "Resultados",
) -> bytes:
    """
    Generar un archivo Excel con los resultados del análisis.
    Pinta de rojo ('#FF0000') el fondo y blanco el texto de las filas 'NO SE PAGO'.
    """
    df = pd.DataFrame(datos)
    buffer = BytesIO()
    
    # Use context manager to write to Excel buffer
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=nombre_hoja)
        workbook = writer.book
        worksheet = writer.sheets[nombre_hoja]
        
        red_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")
        white_font = Font(color="FFFFFF", bold=True)
        
        # Encontrar la columna de L o estado para aplicar rojo
        # datos[] tiene la estructura de dict original
        for row_idx, row_data in enumerate(datos, start=2): # +2 by header and 1-based index
            # Asumimos que hay una columna 'uuid' o 'L' donde ponemos 'NO SE PAGO'
            # En pandas, la clave es 'uuid' o el nombre exacto usado.
            # Verificamos si en la data original cualquier valor es "NO SE PAGO"
            is_no_pago = any(str(val).strip().upper() == "NO SE PAGO" for val in row_data.values())
            if is_no_pago:
                for col_idx in range(1, len(row_data) + 1):
                    cell = worksheet.cell(row=row_idx, column=col_idx)
                    cell.fill = red_fill
                    cell.font = white_font

    return buffer.getvalue()


_HEADER_FILL = PatternFill(start_color="1864AB", end_color="1864AB", fill_type="solid")
_HEADER_FONT = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
_ZEBRA_FILL = PatternFill(start_color="F1F5FB", end_color="F1F5FB", fill_type="solid")
_TOTAL_FILL = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
_COLUMNA_SUMADA_FILL = PatternFill(start_color="EAF7EC", end_color="EAF7EC", fill_type="solid")
_EGRESO_FILL = PatternFill(start_color="FFE0B2", end_color="FFE0B2", fill_type="solid")
_PPD_FILL = PatternFill(start_color="D0BFFF", end_color="D0BFFF", fill_type="solid")
_HEADER_SUMADA_FILL = PatternFill(start_color="2F9E44", end_color="2F9E44", fill_type="solid")
_NUM_FORMAT = '#,##0.00'
_COLUMNAS_NUMERICAS_AMARRE = [
    "DEBE(MONTO TOTAL DE LA FACTURA)",
    "Total",
    "Total MXN",
    "Subtotal",
    "Subtotal MXN",
    "Total descuento",
    "Total descuento MXN",
    "Neto",
    "Neto MXN",
    "Traslado IVA",
    "Traslado IVA MXN",
    "Traslado IEPS",
    "Traslado IEPS MXN",
    "Traslados ISR",
    "Traslado ISR MXN",
    "Retención IVA",
    "Retención IVA MXN",
    "Retención IEPS",
    "Retención IEPS MXN",
    "Retención ISR",
    "Retención ISR MXN",
    "IVA RET 10%",
    "IVA RET 4%",
    "ISR RET 10%",
    "ISR RET 1.25 %",
    "TASA 16%",
    "TASA 0%",
    "EXCENTO",
]
_THIN_BORDER = Border(
    left=Side(style='thin', color='E0E0E0'),
    right=Side(style='thin', color='E0E0E0'),
    top=Side(style='thin', color='E0E0E0'),
    bottom=Side(style='thin', color='E0E0E0'),
)


_MESES_ES = {
    1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL", 5: "MAYO", 6: "JUNIO",
    7: "JULIO", 8: "AGOSTO", 9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE",
}


def _titulo_periodo(fecha_desde: date | None, fecha_hasta: date | None, modulo: str) -> str:
    """
    Título identificando de qué mes/periodo es el reporte y de qué módulo
    sale — se inserta como primera fila de cada hoja, para que se entienda
    de un vistazo sin tener que abrir el archivo de origen.
    """
    if fecha_desde and fecha_hasta and fecha_desde.year == fecha_hasta.year and fecha_desde.month == fecha_hasta.month:
        return f"REPORTE DEL MES DE {_MESES_ES[fecha_desde.month]} {fecha_desde.year} — TOMADO DE {modulo}"
    if fecha_desde or fecha_hasta:
        desde_txt = fecha_desde.isoformat() if fecha_desde else "el inicio"
        hasta_txt = fecha_hasta.isoformat() if fecha_hasta else "hoy"
        return f"REPORTE DEL {desde_txt} AL {hasta_txt} — TOMADO DE {modulo}"
    return f"REPORTE — TODOS LOS PERIODOS — TOMADO DE {modulo}"


def _insertar_titulo_hoja(ws, titulo: str) -> None:
    """
    Inserta una fila de título al principio de la hoja, como ÚLTIMO paso de
    su construcción. OJO: ws.insert_rows(1) mueve las CELDAS una fila hacia
    abajo, pero NO actualiza el TEXTO de las fórmulas ya escritas (ej.
    "=SUM(D22:D28)") — el texto se queda igual aunque los datos que
    referencia ahora estén una fila más abajo. Por eso, después de insertar,
    se recorren todas las fórmulas de la hoja y se incrementa en 1 cada
    referencia de fila que contengan.
    """
    ws.insert_rows(1)
    for fila_ws in ws.iter_rows():
        for celda in fila_ws:
            if isinstance(celda.value, str) and celda.value.startswith("="):
                celda.value = re.sub(r"([A-Za-z]+)(\d+)", lambda m: f"{m.group(1)}{int(m.group(2)) + 1}", celda.value)

    celda = ws.cell(row=1, column=1, value=titulo)
    celda.font = Font(name="Segoe UI", size=11, bold=True, color="1864AB")
    if ws.freeze_panes:
        col_letra = "".join(ch for ch in ws.freeze_panes if ch.isalpha())
        fila_num = int("".join(ch for ch in ws.freeze_panes if ch.isdigit()))
        ws.freeze_panes = f"{col_letra}{fila_num + 1}"
    else:
        ws.freeze_panes = "A2"


def _aplicar_diseno_hoja(ws, num_columnas: int, num_filas: int) -> None:
    """
    Aplica encabezado, bordes, zebra striping, alineación de números,
    auto-ancho de columnas y freeze panes a una hoja ya poblada por
    pandas (fila 1 = encabezado, filas 2..N = datos).
    """
    for col_idx in range(1, num_columnas + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 24

    for row_idx in range(2, num_filas + 2):
        ws.row_dimensions[row_idx].height = 18
        for col_idx in range(1, num_columnas + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.border = _THIN_BORDER
            if cell.font is None or cell.font.name != "Segoe UI":
                cell.font = Font(name="Segoe UI", size=9)
            if row_idx % 2 == 0 and cell.fill.fgColor.rgb in (None, "00000000"):
                cell.fill = _ZEBRA_FILL
            if isinstance(cell.value, (int, float)):
                cell.alignment = Alignment(horizontal="right")

    for col_idx in range(1, num_columnas + 1):
        col_letter = get_column_letter(col_idx)
        max_len = max(
            (len(str(ws.cell(row=r, column=col_idx).value or "")) for r in range(1, num_filas + 2)),
            default=0,
        )
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    ws.freeze_panes = "A2"


def _aplicar_totales_y_comparativo_amarre(
    ws,
    columnas: list[str],
    num_filas_principal: int,
    num_filas_banco: int,
) -> None:
    """
    En la hoja Amarre: resalta en verde claro las columnas monetarias que se
    suman, les aplica formato numérico alineado a la derecha, agrega una fila
    de TOTAL (con SUM y fondo verde) y una tabla comparativo (DEBE vs Total
    MXN, fila por fila) al final de las columnas.
    """
    num_filas = num_filas_principal + num_filas_banco
    primera_fila = 2
    ultima_fila = num_filas + 1
    fila_total = num_filas + 2

    indices_numericos: dict[str, int] = {}
    for nombre in _COLUMNAS_NUMERICAS_AMARRE:
        if nombre in columnas:
            indices_numericos[nombre] = columnas.index(nombre) + 1

    for col_idx in indices_numericos.values():
        cabecera = ws.cell(row=1, column=col_idx)
        cabecera.fill = _HEADER_SUMADA_FILL

    right_align = Alignment(horizontal="right")
    for col_idx in indices_numericos.values():
        for row_idx in range(primera_fila, ultima_fila + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.number_format = _NUM_FORMAT
            cell.alignment = right_align
            # Toda la columna se tiñe de verde claro, de inicio a fin,
            # incluyendo las filas de banco.
            cell.fill = _COLUMNA_SUMADA_FILL

    ws.cell(row=fila_total, column=1, value="TOTAL").font = Font(name="Segoe UI", size=9, bold=True)
    for col_idx in indices_numericos.values():
        col_letter = get_column_letter(col_idx)
        cell = ws.cell(row=fila_total, column=col_idx, value=f"=SUM({col_letter}{primera_fila}:{col_letter}{ultima_fila})")
        cell.number_format = _NUM_FORMAT
        cell.alignment = right_align
        cell.font = Font(name="Segoe UI", size=9, bold=True)
        cell.fill = _TOTAL_FILL
        cell.border = _THIN_BORDER

    col_debe = indices_numericos.get("DEBE(MONTO TOTAL DE LA FACTURA)")
    col_total_mxn = indices_numericos.get("Total MXN")
    if col_debe is None or col_total_mxn is None:
        return

    col_inicio_comp = len(columnas) + 2  # deja 1 columna en blanco como separador
    encabezados_comp = ["DEBE(MONTO TOTAL DE LA FACTURA)", "Total MXN", "COMPARATIVO"]
    for offset, titulo in enumerate(encabezados_comp):
        cell = ws.cell(row=1, column=col_inicio_comp + offset, value=titulo)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    letra_debe = get_column_letter(col_debe)
    letra_total_mxn = get_column_letter(col_total_mxn)
    letra_comp_debe = get_column_letter(col_inicio_comp)
    letra_comp_total = get_column_letter(col_inicio_comp + 1)

    for row_idx in range(primera_fila, ultima_fila + 1):
        cell_debe = ws.cell(row=row_idx, column=col_inicio_comp, value=f"={letra_debe}{row_idx}")
        cell_total = ws.cell(row=row_idx, column=col_inicio_comp + 1, value=f"={letra_total_mxn}{row_idx}")
        cell_comp = ws.cell(
            row=row_idx,
            column=col_inicio_comp + 2,
            value=f'=IFERROR({letra_comp_debe}{row_idx}-{letra_comp_total}{row_idx},"")',
        )
        for cell in (cell_debe, cell_total, cell_comp):
            cell.number_format = _NUM_FORMAT
            cell.alignment = right_align
            cell.border = _THIN_BORDER

    for offset in range(3):
        col_idx = col_inicio_comp + offset
        col_letter = get_column_letter(col_idx)
        cell = ws.cell(row=fila_total, column=col_idx, value=f"=SUM({col_letter}{primera_fila}:{col_letter}{ultima_fila})")
        cell.number_format = _NUM_FORMAT
        cell.alignment = right_align
        cell.font = Font(name="Segoe UI", size=9, bold=True)
        cell.fill = _TOTAL_FILL
        cell.border = _THIN_BORDER

    for offset in range(3):
        col_idx = col_inicio_comp + offset
        col_letter = get_column_letter(col_idx)
        max_len = max(len(encabezados_comp[offset]), 12)
        ws.column_dimensions[col_letter].width = max_len + 3


def _parse_float(valor) -> float | None:
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip()
    if not texto:
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def _calcular_valores_hacienda(subtotal: float, descuento: float, tax: float) -> tuple[float, float, float]:
    """
    Replica en Python las fórmulas de Hacienda que Datos_Combinados escribe
    como fórmulas de Excel (Cálculo Hacienda, INGTASA 0 p2, Subtotal Tienda,
    Desfiltro, suma), para poder calcular en valores planos (no fórmulas)
    lo que le corresponde a INGTASA 0 / DESC TASA 0 / SUBTASA 0 en
    Segunda_Limpieza. Devuelve (subtotal_tienda, desfiltro, suma).
    """
    calculo_hacienda = tax / 0.16
    diferencia = subtotal - descuento - calculo_hacienda
    ingtasa0_p2 = 0.0 if diferencia <= 0.2 else diferencia
    subtotal_tienda = calculo_hacienda + descuento
    desfiltro = descuento if (0 <= tax <= 0.2) else 0.0
    suma = desfiltro + ingtasa0_p2
    return subtotal_tienda, desfiltro, suma


_COLUMNAS_DIFERENCIAS = [
    "DEBE(MONTO TOTAL DE LA FACTURA)",
    "Total MXN",
    "COMPARATIVO",
    "Fecha expedición",
    "UUID (L)",
    "Emisor",
]


def _construir_filas_diferencias(filas_amarre_todas: list[dict]) -> list[dict]:
    """
    Filtra las filas de Amarre cuya diferencia |DEBE - Total MXN| es mayor a
    $1 (se ignoran diferencias de centavos), ordenadas de mayor a menor
    magnitud.
    """
    filas_diferencias = []
    for fila in filas_amarre_todas:
        debe = _parse_float(fila.get("DEBE(MONTO TOTAL DE LA FACTURA)"))
        total_mxn = _parse_float(fila.get("Total MXN"))
        if debe is None or total_mxn is None:
            continue
        comparativo = debe - total_mxn
        if abs(comparativo) <= 1:
            continue
        filas_diferencias.append({
            "DEBE(MONTO TOTAL DE LA FACTURA)": debe,
            "Total MXN": total_mxn,
            "COMPARATIVO": comparativo,
            "Fecha expedición": fila.get("Fecha expedición", ""),
            "UUID (L)": fila.get("UUID (L)", ""),
            "Emisor": fila.get("Emisor", ""),
        })

    filas_diferencias.sort(key=lambda f: abs(f["COMPARATIVO"]), reverse=True)
    return filas_diferencias


def _escribir_hoja_diferencias(writer, filas_diferencias: list[dict]) -> None:
    """
    Escribe la hoja 'Diferencias' con las filas cuya discrepancia DEBE vs
    Total MXN supera $1, con el mismo diseño que el resto del reporte.
    """
    if filas_diferencias:
        df_diferencias = pd.DataFrame(filas_diferencias, columns=_COLUMNAS_DIFERENCIAS)
    else:
        df_diferencias = pd.DataFrame(columns=_COLUMNAS_DIFERENCIAS)

    df_diferencias.to_excel(writer, index=False, sheet_name='Diferencias')
    ws = writer.sheets['Diferencias']
    _aplicar_diseno_hoja(ws, len(_COLUMNAS_DIFERENCIAS), len(filas_diferencias))

    # Insertar una fila de título arriba del encabezado, igual que ya tienen
    # las demás secciones de esta hoja (cancelados, egresos, PPD).
    ws.insert_rows(1)
    titulo_cell = ws.cell(row=1, column=1, value="DIFERENCIAS (DEBE vs TOTAL MXN)")
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")
    ws.freeze_panes = "A3"

    right_align = Alignment(horizontal="right")
    columnas_numericas = ["DEBE(MONTO TOTAL DE LA FACTURA)", "Total MXN", "COMPARATIVO"]
    for nombre in columnas_numericas:
        col_idx = _COLUMNAS_DIFERENCIAS.index(nombre) + 1
        for row_idx in range(3, len(filas_diferencias) + 3):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.number_format = _NUM_FORMAT
            cell.alignment = right_align


_COLUMNAS_CANCELADOS = [
    "Emisor",
    "Factura (F)",
    "Fecha expedición",
    "UUID",
    "Subtotal",
    "Total descuento",
    "Neto",
    "Retención IVA",
    "Retención ISR",
    "Traslado IVA",
    "Total",
    "Total MXN",
]
_COLUMNAS_CANCELADOS_NUMERICAS = {
    "Subtotal", "Total descuento", "Neto", "Retención IVA", "Retención ISR", "Traslado IVA", "Total", "Total MXN",
}


def _escribir_seccion_cancelados(ws, fila_inicio: int, filas_canceladas: list[dict]) -> None:
    """
    Escribe, debajo de la tabla de Diferencias en la misma hoja, un bloque
    con las facturas que se excluyeron del Amarre por venir en el archivo
    de UUID cancelados.
    """
    titulo_cell = ws.cell(row=fila_inicio, column=1, value="UUID CANCELADOS")
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")

    fila_header = fila_inicio + 1
    for col_idx, nombre in enumerate(_COLUMNAS_CANCELADOS, start=1):
        cell = ws.cell(row=fila_header, column=col_idx, value=nombre)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    right_align = Alignment(horizontal="right")

    def _valores_de(fila: dict) -> list:
        uuid_val = fila.get("UUID (L)") or fila.get("UUID") or ""
        return [
            fila.get("Emisor", ""),
            fila.get("Factura (F)", ""),
            fila.get("Fecha expedición", ""),
            uuid_val,
            fila.get("Subtotal", ""),
            fila.get("Total descuento", ""),
            fila.get("Neto", ""),
            fila.get("Retención IVA", ""),
            fila.get("Retención ISR", ""),
            fila.get("Traslado IVA", ""),
            fila.get("Total", ""),
            fila.get("Total MXN", ""),
        ]

    filas_valores = []
    for offset, fila in enumerate(filas_canceladas):
        row_idx = fila_header + 1 + offset
        valores = _valores_de(fila)
        filas_valores.append(valores)
        for col_idx, (nombre, valor) in enumerate(zip(_COLUMNAS_CANCELADOS, valores), start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=valor)
            cell.border = _THIN_BORDER
            if nombre in _COLUMNAS_CANCELADOS_NUMERICAS:
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align

    for col_idx, nombre in enumerate(_COLUMNAS_CANCELADOS, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = max([len(nombre)] + [len(str(valores[col_idx - 1])) for valores in filas_valores])
        ancho_actual = ws.column_dimensions[col_letter].width or 0
        ws.column_dimensions[col_letter].width = max(ancho_actual, max_len + 3, 12)


_COLUMNAS_EGRESOS = [
    "Emisor",
    "Factura (F)",
    "UUID",
    "Subtotal",
    "Total descuento",
    "Neto",
    "Retención IVA",
    "Retención ISR",
    "Traslado IVA",
    "Total",
]


def _escribir_seccion_egresos(ws, fila_inicio: int, filas_con_egresos: list[dict]) -> None:
    """
    Escribe, debajo de la tabla de Diferencias (y de la sección de
    cancelados si existe), un bloque con las facturas del Amarre a las que
    se les aplicó un egreso, mostrando sus montos ANTES de la resta.
    """
    titulo_cell = ws.cell(row=fila_inicio, column=1, value="UUID CON EGRESOS APLICADOS")
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")

    fila_header = fila_inicio + 1
    for col_idx, nombre in enumerate(_COLUMNAS_EGRESOS, start=1):
        cell = ws.cell(row=fila_header, column=col_idx, value=nombre)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    right_align = Alignment(horizontal="right")
    columnas_numericas = {"Subtotal", "Total descuento", "Neto", "Retención IVA", "Retención ISR", "Traslado IVA", "Total"}
    filas_valores = []
    for offset, fila in enumerate(filas_con_egresos):
        row_idx = fila_header + 1 + offset
        valores = [fila.get(nombre, "") for nombre in _COLUMNAS_EGRESOS]
        filas_valores.append(valores)
        for col_idx, (nombre, valor) in enumerate(zip(_COLUMNAS_EGRESOS, valores), start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=valor)
            cell.border = _THIN_BORDER
            if nombre in columnas_numericas:
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align

    for col_idx, nombre in enumerate(_COLUMNAS_EGRESOS, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = max([len(nombre)] + [len(str(valores[col_idx - 1])) for valores in filas_valores])
        ancho_actual = ws.column_dimensions[col_letter].width or 0
        ws.column_dimensions[col_letter].width = max(ancho_actual, max_len + 3, 12)


def _escribir_seccion_generica(
    ws, fila_inicio: int, titulo: str, columnas: list[str], filas: list[dict], columna_total: str | None = None
) -> int:
    """
    Escribe, debajo de lo que ya haya en la hoja Diferencias, un bloque
    genérico (título + encabezado + filas) a partir de dicts con claves
    arbitrarias — mismo estilo visual que las secciones específicas
    (cancelados/egresos/PPD) pero sin columnas fijas. Si se indica
    columna_total, agrega una fila TOTAL con SUM() de esa columna (solo si
    hay filas). Devuelve la fila siguiente disponible después de este bloque.
    """
    titulo_cell = ws.cell(row=fila_inicio, column=1, value=titulo)
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")

    fila_header = fila_inicio + 1
    for col_idx, nombre in enumerate(columnas, start=1):
        cell = ws.cell(row=fila_header, column=col_idx, value=nombre)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for offset, fila in enumerate(filas):
        row_idx = fila_header + 1 + offset
        for col_idx, nombre in enumerate(columnas, start=1):
            ws.cell(row=row_idx, column=col_idx, value=fila.get(nombre, "")).border = _THIN_BORDER

    fila_actual = fila_header + len(filas)
    if columna_total and filas:
        fila_actual += 1
        col_idx_total = columnas.index(columna_total) + 1
        col_letter = get_column_letter(col_idx_total)
        primera_fila_datos = fila_header + 1
        ws.cell(row=fila_actual, column=1, value="TOTAL").font = Font(name="Segoe UI", size=9, bold=True)
        cell_total = ws.cell(
            row=fila_actual, column=col_idx_total,
            value=f"=SUM({col_letter}{primera_fila_datos}:{col_letter}{fila_header + len(filas)})",
        )
        cell_total.number_format = _NUM_FORMAT
        cell_total.alignment = Alignment(horizontal="right")
        cell_total.font = Font(name="Segoe UI", size=9, bold=True)
        cell_total.fill = _TOTAL_FILL
        cell_total.border = _THIN_BORDER

    return fila_actual + 2  # +1 fila en blanco de separación, +1 para la siguiente sección


_COLUMNAS_PPD_AJUSTADOS = [
    "Emisor",
    "Factura (F)",
    "Fecha expedición",
    "UUID",
    "DEBE(MONTO TOTAL DE LA FACTURA)",
    "Total",
    "Total MXN",
    "Subtotal",
    "Subtotal MXN",
    "Total descuento",
    "Total descuento MXN",
    "Neto",
    "Neto MXN",
    "Traslado IVA",
    "Traslado IVA MXN",
]
_COLUMNAS_PPD_NUMERICAS = {
    "DEBE(MONTO TOTAL DE LA FACTURA)", "Total", "Total MXN", "Subtotal", "Subtotal MXN",
    "Total descuento", "Total descuento MXN", "Neto", "Neto MXN", "Traslado IVA", "Traslado IVA MXN",
}


_COLUMNAS_POSIBLE_CRUCE = [
    "Emisor", "Factura (F)", "Fecha expedición", "UUID", "NUMERO DE CHEQUE",
    "DEBE(MONTO TOTAL DE LA FACTURA)", "Total MXN",
]
_COLUMNAS_POSIBLE_CRUCE_NUMERICAS = {"DEBE(MONTO TOTAL DE LA FACTURA)", "Total MXN"}


def _escribir_seccion_posible_cruce(ws, fila_inicio: int, filas_posible_cruce: list[dict]) -> None:
    """
    Escribe, debajo de las demás secciones de Diferencias, los pagos PPD que
    NO se recalcularon porque se detectó un posible cruce: 2 pagos con el
    mismo NUMERO DE CHEQUE cuyo DEBE coincide, al revés, con el Total MXN
    del otro — probablemente 2 pagos completos mal emparejados en el
    archivo de origen, no pagos parciales reales. Requiere revisión manual.
    """
    titulo_cell = ws.cell(row=fila_inicio, column=1, value="POSIBLE CRUCE DE UUID ENTRE PAGOS (MISMO CHEQUE)")
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")

    fila_header = fila_inicio + 1
    for col_idx, nombre in enumerate(_COLUMNAS_POSIBLE_CRUCE, start=1):
        cell = ws.cell(row=fila_header, column=col_idx, value=nombre)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    right_align = Alignment(horizontal="right")
    filas_valores = []
    for offset, fila in enumerate(filas_posible_cruce):
        row_idx = fila_header + 1 + offset
        valores = [fila.get(nombre, "") for nombre in _COLUMNAS_POSIBLE_CRUCE]
        filas_valores.append(valores)
        for col_idx, (nombre, valor) in enumerate(zip(_COLUMNAS_POSIBLE_CRUCE, valores), start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=valor)
            cell.border = _THIN_BORDER
            if nombre in _COLUMNAS_POSIBLE_CRUCE_NUMERICAS:
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align

    for col_idx, nombre in enumerate(_COLUMNAS_POSIBLE_CRUCE, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = max([len(nombre)] + [len(str(valores[col_idx - 1])) for valores in filas_valores])
        ancho_actual = ws.column_dimensions[col_letter].width or 0
        ws.column_dimensions[col_letter].width = max(ancho_actual, max_len + 3, 12)


def _escribir_seccion_ppd_ajustados(ws, fila_inicio: int, filas_ppd_ajustadas: list[dict]) -> None:
    """
    Escribe, debajo de las demás secciones de Diferencias, un bloque con los
    montos ORIGINALES (antes del recálculo) de las facturas PPD cuya
    diferencia DEBE vs Total MXN se corrigió automáticamente — evidencia de
    qué traía cada factura antes del ajuste.
    """
    titulo_cell = ws.cell(row=fila_inicio, column=1, value="PAGOS PARCIALES (PPD) AJUSTADOS")
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")

    fila_header = fila_inicio + 1
    for col_idx, nombre in enumerate(_COLUMNAS_PPD_AJUSTADOS, start=1):
        cell = ws.cell(row=fila_header, column=col_idx, value=nombre)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    right_align = Alignment(horizontal="right")
    filas_valores = []
    for offset, fila in enumerate(filas_ppd_ajustadas):
        row_idx = fila_header + 1 + offset
        valores = [fila.get(nombre, "") for nombre in _COLUMNAS_PPD_AJUSTADOS]
        filas_valores.append(valores)
        for col_idx, (nombre, valor) in enumerate(zip(_COLUMNAS_PPD_AJUSTADOS, valores), start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=valor)
            cell.border = _THIN_BORDER
            if nombre in _COLUMNAS_PPD_NUMERICAS:
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align

    for col_idx, nombre in enumerate(_COLUMNAS_PPD_AJUSTADOS, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = max([len(nombre)] + [len(str(valores[col_idx - 1])) for valores in filas_valores])
        ancho_actual = ws.column_dimensions[col_letter].width or 0
        ws.column_dimensions[col_letter].width = max(ancho_actual, max_len + 3, 12)


async def generar_reporte_pagos_excel(
    filas_pagos: list[dict],
    filas_amarre_principal: list[dict],
    filas_amarre_banco: list[dict],
    filas_canceladas: list[dict] | None = None,
    filas_con_egresos: list[dict] | None = None,
    filas_ppd_ajustadas: list[dict] | None = None,
    filas_posible_cruce: list[dict] | None = None,
    filas_ingresos_todos: list[dict] | None = None,
    filas_cancelados_todos: list[dict] | None = None,
    filas_egresos_todos: list[dict] | None = None,
    resultados_conciliacion_retenciones: list[tuple[str, dict]] | None = None,
    filas_comparacion_iva_acreditable: list[dict] | None = None,
    filas_detalle_iva_acreditable: list[dict] | None = None,
    filas_diferencia_retenciones: list[dict] | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> bytes:
    """
    Genera un solo Excel con varias hojas:
    - 'Pagos': mismo reporte de siempre, con fondo rojo en filas 'NO SE PAGO'.
    - 'Amarre': Pagos unidos a su CFDI de Ingresos por UUID, con los Ingresos
      sin pago emitidos por un banco al final, resaltados en amarillo.
    - 'Diferencias': ver _escribir_hoja_diferencias y sus sub-secciones.
    - 'Ingresos Recibidos', 'Cancelados', 'Egresos': volcado completo (sin
      filtrar por si cruzaron o no con Amarre) de esas 3 fuentes, para que el
      usuario pueda analizarlas directamente en el mismo Excel.
    - Por cada (nombre_columna, resultado) en resultados_conciliacion_retenciones
      (ver conciliacion_retenciones.py conciliar_retencion), se agrega la hoja
      'Conciliado {nombre_columna}' y 2 sub-secciones más en 'Diferencias'
      (lo que no cruzó de cada lado) — una vez por cada retención conciliada
      (IVA RET 10%, IVA RET 4%, ISR RET 10%, ISR RET 1.25 %).
    - Si se pasa filas_comparacion_iva_acreditable (ver conciliacion_retenciones.py
      conciliar_iva_acreditable), se agrega la hoja 'IVA Acreditable' con la
      tabla comparativa Traslado IVA MXN (Amarre) vs IVA acreditable
      (archivo) por proveedor, con fila de TOTAL. Si además se pasa
      filas_detalle_iva_acreditable, se agrega 'IVA Acreditable (Archivo)'
      con el archivo de origen ya filtrado al mismo periodo, para verificar
      la comparación contra el archivo tal cual se subió.
    - Si se pasa filas_diferencia_retenciones, se agrega la hoja 'Diferencia
      de Retenciones': un resumen de 1 fila por cada retención subida (total
      Amarre vs total del archivo y su diferencia), independiente de las
      hojas 'Conciliado {retención}' (que van por factura).
    - 'Pre-DIOT': siempre que Amarre tenga datos, agrupa por RFC+Emisor y
      suma Campo 8 (tasa 16%) / Campo 21 (tasa 0%) / Campo 22 (exentos) /
      Campo 23 (IVA retenido) + Total — ver _construir_filas_pre_diot.
    Todas las hojas llevan encabezado, bordes, zebra striping, auto-ancho de
    columnas y freeze panes, y una fila de título arriba identificando el
    mes/periodo del reporte y de qué módulo sale (fecha_desde/fecha_hasta).
    """
    df_pagos = pd.DataFrame(filas_pagos)
    filas_amarre_todas = filas_amarre_principal + filas_amarre_banco
    df_amarre = pd.DataFrame(filas_amarre_todas).fillna("")

    # pandas ordena las columnas por primera aparición entre todas las filas,
    # no por el orden de inserción del diccionario: si una fila "corta" (sin
    # Ingreso cruzado) es la primera en traer estas 4 claves, quedan pegadas
    # justo después de esa fila corta en vez de al final. Se reordenan a mano
    # para que siempre queden al final, como pide la especificación.
    _COLUMNAS_IVA_ISR_AL_FINAL = [
        "IVA RET 10%", "IVA RET 4%", "ISR RET 10%", "ISR RET 1.25 %",
        "TASA 16%", "TASA 0%", "EXCENTO",
    ]
    columnas_iva_isr_presentes = [c for c in _COLUMNAS_IVA_ISR_AL_FINAL if c in df_amarre.columns]
    if columnas_iva_isr_presentes:
        otras_columnas = [c for c in df_amarre.columns if c not in columnas_iva_isr_presentes]
        df_amarre = df_amarre[otras_columnas + columnas_iva_isr_presentes]

    # _resolver_columnas_amarre (más abajo, para las fórmulas en vivo de
    # Pre-DIOT) exige que estas columnas existan en Amarre — pandas solo las
    # crea si ALGUNA fila trajo esa clave (ej. "Retención IVA MXN" no existe
    # si ningún proveedor tuvo retención ese periodo). Se agregan vacías
    # aquí, ANTES de escribir la hoja Amarre, para que la columna sea real
    # en el archivo exportado (sumar una columna vacía con SUMIF da 0, igual
    # que hoy en Python).
    for columna_requerida in _COLUMNAS_AMARRE_REQUERIDAS_PRE_DIOT:
        if columna_requerida not in df_amarre.columns:
            df_amarre[columna_requerida] = ""

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        # ── Hoja Pagos ──
        df_pagos.to_excel(writer, index=False, sheet_name='Pagos')
        ws_pagos = writer.sheets['Pagos']
        _aplicar_diseno_hoja(ws_pagos, len(df_pagos.columns), len(filas_pagos))

        red_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")
        white_font = Font(name="Segoe UI", size=9, color="FFFFFF", bold=True)
        for row_idx, row_data in enumerate(filas_pagos, start=2):
            if any(str(v).strip().upper() == "NO SE PAGO" for v in row_data.values()):
                for col_idx in range(1, len(row_data) + 1):
                    cell = ws_pagos.cell(row=row_idx, column=col_idx)
                    cell.fill = red_fill
                    cell.font = white_font

        _insertar_titulo_hoja(ws_pagos, _titulo_periodo(fecha_desde, fecha_hasta, "CUENTAS X PAGAR"))

        # ── Hoja Amarre: una sola tabla; las filas de banco solo se resaltan ──
        df_amarre.to_excel(writer, index=False, sheet_name='Amarre')
        ws_amarre = writer.sheets['Amarre']
        _aplicar_diseno_hoja(ws_amarre, len(df_amarre.columns), len(filas_amarre_todas))

        if filas_amarre_banco:
            yellow_fill = PatternFill(start_color="FFF9C4", end_color="FFF9C4", fill_type="solid")
            red_fill_nota_credito = PatternFill(start_color="FFCDD2", end_color="FFCDD2", fill_type="solid")
            primera_fila_banco = len(filas_amarre_principal) + 2  # +1 encabezado, +1 base-1
            for offset, fila_banco in enumerate(filas_amarre_banco):
                r = primera_fila_banco + offset
                es_nota_credito = any(
                    (_parse_float(fila_banco.get(campo)) or 0) < 0
                    for campo in ("Total MXN", "Traslado IVA MXN")
                )
                fill = red_fill_nota_credito if es_nota_credito else yellow_fill
                for c in range(1, len(df_amarre.columns) + 1):
                    ws_amarre.cell(row=r, column=c).fill = fill

        if filas_con_egresos:
            columnas_amarre = list(df_amarre.columns)
            cols_uuid_amarre = [
                columnas_amarre.index(nombre_col) + 1
                for nombre_col in ("UUID (L)", "UUID")
                if nombre_col in columnas_amarre
            ]
            if cols_uuid_amarre:
                uuids_con_egreso = {str(f.get("UUID", "")).strip().lower() for f in filas_con_egresos}
                for r in range(2, len(filas_amarre_todas) + 2):
                    uuid_val = next(
                        (
                            str(ws_amarre.cell(row=r, column=col).value).strip().lower()
                            for col in cols_uuid_amarre
                            if ws_amarre.cell(row=r, column=col).value
                        ),
                        "",
                    )
                    if uuid_val in uuids_con_egreso:
                        for c in range(1, len(columnas_amarre) + 1):
                            ws_amarre.cell(row=r, column=c).fill = _EGRESO_FILL

        if filas_ppd_ajustadas:
            columnas_amarre = list(df_amarre.columns)
            cols_uuid_amarre = [
                columnas_amarre.index(nombre_col) + 1
                for nombre_col in ("UUID (L)", "UUID")
                if nombre_col in columnas_amarre
            ]
            if cols_uuid_amarre:
                uuids_ppd = {str(f.get("UUID", "")).strip().lower() for f in filas_ppd_ajustadas}
                for r in range(2, len(filas_amarre_todas) + 2):
                    uuid_val = next(
                        (
                            str(ws_amarre.cell(row=r, column=col).value).strip().lower()
                            for col in cols_uuid_amarre
                            if ws_amarre.cell(row=r, column=col).value
                        ),
                        "",
                    )
                    if uuid_val in uuids_ppd:
                        for c in range(1, len(columnas_amarre) + 1):
                            ws_amarre.cell(row=r, column=c).fill = _PPD_FILL

        _aplicar_totales_y_comparativo_amarre(
            ws_amarre, list(df_amarre.columns), len(filas_amarre_principal), len(filas_amarre_banco)
        )
        _insertar_titulo_hoja(ws_amarre, _titulo_periodo(fecha_desde, fecha_hasta, "CUENTAS X PAGAR (AMARRE CONTRA CFDI)"))

        # ── Hoja Diferencias: filas de Amarre con |DEBE - Total MXN| > $1 ──
        filas_diferencias = _construir_filas_diferencias(filas_amarre_todas)
        _escribir_hoja_diferencias(writer, filas_diferencias)

        fila_siguiente = len(filas_diferencias) + 5  # +1 título, +1 encabezado, +1 base-1, +2 en blanco

        if filas_canceladas:
            ws_diferencias = writer.sheets['Diferencias']
            _escribir_seccion_cancelados(ws_diferencias, fila_siguiente, filas_canceladas)
            fila_siguiente += len(filas_canceladas) + 4  # título + encabezado + datos + 2 en blanco

        if filas_con_egresos:
            ws_diferencias = writer.sheets['Diferencias']
            _escribir_seccion_egresos(ws_diferencias, fila_siguiente, filas_con_egresos)
            fila_siguiente += len(filas_con_egresos) + 4  # título + encabezado + datos + 2 en blanco

        if filas_ppd_ajustadas:
            ws_diferencias = writer.sheets['Diferencias']
            _escribir_seccion_ppd_ajustados(ws_diferencias, fila_siguiente, filas_ppd_ajustadas)
            fila_siguiente += len(filas_ppd_ajustadas) + 4  # título + encabezado + datos + 2 en blanco

        if filas_posible_cruce:
            ws_diferencias = writer.sheets['Diferencias']
            _escribir_seccion_posible_cruce(ws_diferencias, fila_siguiente, filas_posible_cruce)
            fila_siguiente += len(filas_posible_cruce) + 4  # título + encabezado + datos + 2 en blanco

        # ── Conciliación de retenciones (IVA RET 10%/4%, ISR RET 10%/1.25%):
        # por cada una que venga con archivo, una hoja con lo que sí cruzó, y
        # 2 sub-secciones más en Diferencias con lo que no cruzó de cada lado
        # (facturas de Amarre sin contraparte / renglones del archivo sin
        # factura relacionada) ──
        for nombre_columna, resultado_conciliacion in (resultados_conciliacion_retenciones or []):
            ws_diferencias = writer.sheets['Diferencias']
            fila_siguiente = _escribir_seccion_generica(
                ws_diferencias, fila_siguiente,
                f"{nombre_columna} — FACTURAS DE TU AMARRE QUE NO SE ENCONTRARON EN EL ARCHIVO DE RETENCIONES",
                _COLUMNAS_DIFERENCIAS_AMARRE_RETENCION,
                resultado_conciliacion["diferencias_amarre"],
                columna_total="monto",
            )
            fila_siguiente = _escribir_seccion_generica(
                ws_diferencias, fila_siguiente,
                f"{nombre_columna} — RENGLONES DEL ARCHIVO DE RETENCIONES QUE NO SE IDENTIFICARON EN TU AMARRE",
                _COLUMNAS_DIFERENCIAS_ARCHIVO_RETENCION,
                resultado_conciliacion["diferencias_archivo"],
                columna_total="monto",
            )

            nombre_hoja_conciliado = f"Conciliado {nombre_columna}"
            df_conciliado = pd.DataFrame(
                resultado_conciliacion["conciliados"] or [], columns=_COLUMNAS_CONCILIADOS_RETENCION
            ).fillna("")
            df_conciliado.to_excel(writer, index=False, sheet_name=nombre_hoja_conciliado)
            _aplicar_diseno_hoja(
                writer.sheets[nombre_hoja_conciliado],
                len(_COLUMNAS_CONCILIADOS_RETENCION),
                len(resultado_conciliacion["conciliados"] or []),
            )
            _insertar_titulo_hoja(
                writer.sheets[nombre_hoja_conciliado], _titulo_periodo(fecha_desde, fecha_hasta, "CONCILIACIÓN DE RETENCIONES")
            )

        _insertar_titulo_hoja(writer.sheets['Diferencias'], _titulo_periodo(fecha_desde, fecha_hasta, "CUENTAS X PAGAR"))

        # ── Diferencia de Retenciones: resumen de 1 fila por retención subida
        # (total Amarre vs total del archivo), independiente de las hojas
        # 'Conciliado {retención}' que van por factura. ──
        if filas_diferencia_retenciones is not None:
            _escribir_hoja_generica(
                writer, 'Diferencia de Retenciones', filas_diferencia_retenciones, _COLUMNAS_DIFERENCIA_RETENCIONES
            )
            ws_diferencia_retenciones = writer.sheets['Diferencia de Retenciones']
            right_align = Alignment(horizontal="right")
            for nombre in ("Monto (Amarre)", "Monto (Auxiliar de Retenciones)", "Diferencia"):
                col_idx = _COLUMNAS_DIFERENCIA_RETENCIONES.index(nombre) + 1
                for row_idx in range(2, len(filas_diferencia_retenciones) + 2):
                    cell = ws_diferencia_retenciones.cell(row=row_idx, column=col_idx)
                    cell.number_format = _NUM_FORMAT
                    cell.alignment = right_align

            fila_total_dr = len(filas_diferencia_retenciones) + 2
            ws_diferencia_retenciones.cell(row=fila_total_dr, column=1, value="TOTAL").font = Font(name="Segoe UI", size=9, bold=True)
            for nombre in ("Monto (Amarre)", "Monto (Auxiliar de Retenciones)", "Diferencia"):
                col_idx = _COLUMNAS_DIFERENCIA_RETENCIONES.index(nombre) + 1
                col_letter = get_column_letter(col_idx)
                cell = ws_diferencia_retenciones.cell(
                    row=fila_total_dr, column=col_idx,
                    value=f"=SUM({col_letter}2:{col_letter}{fila_total_dr - 1})",
                )
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align
                cell.font = Font(name="Segoe UI", size=9, bold=True)
                cell.fill = _TOTAL_FILL
                cell.border = _THIN_BORDER
            _insertar_titulo_hoja(
                ws_diferencia_retenciones, _titulo_periodo(fecha_desde, fecha_hasta, "CONCILIACIÓN DE RETENCIONES")
            )

        # ── IVA Acreditable: tabla comparativa Traslado IVA MXN (Amarre) vs
        # IVA acreditable (archivo) por proveedor — no es "conciliado/
        # diferencia" como las retenciones, es una tabla comparativa (las
        # diferencias de centavos son esperadas, no un error). ──
        if filas_comparacion_iva_acreditable is not None:
            _escribir_hoja_generica(
                writer, 'IVA Acreditable', filas_comparacion_iva_acreditable, _COLUMNAS_IVA_ACREDITABLE
            )
            ws_iva_acreditable = writer.sheets['IVA Acreditable']
            right_align = Alignment(horizontal="right")

            # Traslado IVA MXN por proveedor = SUMIF sobre la hoja Amarre (por
            # la etiqueta de proveedor que pone pagos.py en cada fila) y
            # Diferencia = Traslado − Archivo, ambos como fórmula — así un
            # cambio en Amarre se refleja aquí al volver a guardar en Excel real.
            # Proveedores que solo existen en el archivo (sin filas de Amarre)
            # se dejan con su valor fijo de 0.
            columnas_amarre_iva = list(df_amarre.columns)
            if COLUMNA_GRUPO_IVA_ACREDITABLE in columnas_amarre_iva and "Traslado IVA MXN" in columnas_amarre_iva:
                letra_grupo = get_column_letter(columnas_amarre_iva.index(COLUMNA_GRUPO_IVA_ACREDITABLE) + 1)
                letra_traslado_amarre = get_column_letter(columnas_amarre_iva.index("Traslado IVA MXN") + 1)
                fila_fin_amarre = max(2 + len(filas_amarre_todas), 2000)
                col_emisor = get_column_letter(_COLUMNAS_IVA_ACREDITABLE.index("emisor") + 1)
                col_traslado = get_column_letter(_COLUMNAS_IVA_ACREDITABLE.index("traslado_iva_amarre") + 1)
                col_archivo = get_column_letter(_COLUMNAS_IVA_ACREDITABLE.index("iva_acreditable_archivo") + 1)
                for indice_fila, fila_comparacion in enumerate(filas_comparacion_iva_acreditable):
                    fila_excel = indice_fila + 2
                    if fila_comparacion["filas_amarre_idx"]:
                        ws_iva_acreditable[f"{col_traslado}{fila_excel}"] = (
                            f"=SUMIF(Amarre!${letra_grupo}$3:${letra_grupo}${fila_fin_amarre},"
                            f"${col_emisor}{fila_excel},"
                            f"Amarre!${letra_traslado_amarre}$3:${letra_traslado_amarre}${fila_fin_amarre})"
                        )
                    ws_iva_acreditable[f"{get_column_letter(_COLUMNAS_IVA_ACREDITABLE.index('diferencia') + 1)}{fila_excel}"] = (
                        f"={col_traslado}{fila_excel}-{col_archivo}{fila_excel}"
                    )

            for nombre in ("traslado_iva_amarre", "iva_acreditable_archivo", "diferencia"):
                col_idx = _COLUMNAS_IVA_ACREDITABLE.index(nombre) + 1
                for row_idx in range(2, len(filas_comparacion_iva_acreditable) + 2):
                    cell = ws_iva_acreditable.cell(row=row_idx, column=col_idx)
                    cell.number_format = _NUM_FORMAT
                    cell.alignment = right_align

            fila_total_iva = len(filas_comparacion_iva_acreditable) + 2
            ws_iva_acreditable.cell(row=fila_total_iva, column=1, value="TOTAL").font = Font(name="Segoe UI", size=9, bold=True)
            for nombre in ("traslado_iva_amarre", "iva_acreditable_archivo", "diferencia"):
                col_idx = _COLUMNAS_IVA_ACREDITABLE.index(nombre) + 1
                col_letter = get_column_letter(col_idx)
                cell = ws_iva_acreditable.cell(
                    row=fila_total_iva, column=col_idx,
                    value=f"=SUM({col_letter}2:{col_letter}{fila_total_iva - 1})",
                )
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align
                cell.font = Font(name="Segoe UI", size=9, bold=True)
                cell.fill = _TOTAL_FILL
                cell.border = _THIN_BORDER
            _insertar_titulo_hoja(ws_iva_acreditable, _titulo_periodo(fecha_desde, fecha_hasta, "CONCILIACIÓN DE IVA ACREDITABLE"))

        # ── IVA Acreditable (Archivo): el archivo de origen que se subió, ya
        # filtrado al mismo periodo que la comparación de arriba, para que
        # el usuario pueda verificar renglón por renglón contra la fuente. ──
        if filas_detalle_iva_acreditable is not None:
            _escribir_hoja_generica(
                writer, 'IVA Acreditable (Archivo)', filas_detalle_iva_acreditable, _COLUMNAS_DETALLE_ARCHIVO_RETENCION
            )
            _insertar_titulo_hoja(
                writer.sheets['IVA Acreditable (Archivo)'], _titulo_periodo(fecha_desde, fecha_hasta, "CONCILIACIÓN DE IVA ACREDITABLE")
            )

        # ── Pre-DIOT: catálogo de proveedores agrupado por RFC+Emisor con
        # Campo 8 (tasa 16%) / Campo 21 (tasa 0%) / Campo 22 (exentos) /
        # Campo 23 (IVA retenido) + Total — el mismo resumen que hoy arma el
        # contador a mano a partir de Amarre, para la DIOT. ──
        # Fórmulas en vivo hacia Amarre (no una suma en Python fija): así,
        # si alguien corrige a mano una celda de Amarre y vuelve a guardar
        # el archivo con Excel real, Pre-DIOT se recalcula solo, sin
        # regenerar nada desde el sistema — ver docstring de
        # _construir_filas_pre_diot. fila_inicio=3 porque Amarre ya insertó
        # su título (línea de arriba) antes de este punto: título fila 1,
        # encabezado fila 2, datos desde fila 3. fila_fin se extiende hasta
        # 2000 a propósito, para que una fila nueva insertada a mano en
        # Amarre para un proveedor existente también se sume sin regenerar.
        amarre_formulas = {
            "letras": _resolver_columnas_amarre(list(df_amarre.columns)),
            "fila_inicio": 3,
            "fila_fin": max(3 + len(filas_amarre_todas) - 1, 2000),
        }
        filas_pre_diot = _construir_filas_pre_diot(filas_amarre_todas, amarre_formulas=amarre_formulas)
        if filas_pre_diot:
            _escribir_hoja_generica(writer, 'Pre-DIOT', filas_pre_diot, _COLUMNAS_PRE_DIOT)
            ws_pre_diot = writer.sheets['Pre-DIOT']
            right_align = Alignment(horizontal="right")
            for nombre in _COLUMNAS_PRE_DIOT_NUMERICAS:
                col_idx = _COLUMNAS_PRE_DIOT.index(nombre) + 1
                for row_idx in range(2, len(filas_pre_diot) + 2):
                    cell = ws_pre_diot.cell(row=row_idx, column=col_idx)
                    cell.number_format = _NUM_FORMAT
                    cell.alignment = right_align

            fila_total_pre_diot = len(filas_pre_diot) + 2
            col_etiqueta_total = _COLUMNAS_PRE_DIOT.index("Nombre Emisor") + 1
            ws_pre_diot.cell(row=fila_total_pre_diot, column=col_etiqueta_total, value="TOTAL").font = Font(name="Segoe UI", size=9, bold=True)
            for nombre in _COLUMNAS_PRE_DIOT_NUMERICAS:
                col_idx = _COLUMNAS_PRE_DIOT.index(nombre) + 1
                col_letter = get_column_letter(col_idx)
                cell = ws_pre_diot.cell(
                    row=fila_total_pre_diot, column=col_idx,
                    value=f"=SUM({col_letter}2:{col_letter}{fila_total_pre_diot - 1})",
                )
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align
                cell.font = Font(name="Segoe UI", size=9, bold=True)
                cell.fill = _TOTAL_FILL
                cell.border = _THIN_BORDER
            _insertar_titulo_hoja(ws_pre_diot, _titulo_periodo(fecha_desde, fecha_hasta, "PRE-DIOT (CATÁLOGO DE PROVEEDORES)"))

        # ── Hojas de volcado completo: Ingresos Recibidos, Cancelados, Egresos ──
        # A diferencia de las sub-secciones de Diferencias (que solo muestran lo
        # que sí cruzó con Amarre), estas hojas traen TODO lo que se subió/existe
        # en la BD, para que el usuario pueda analizarlas sin filtrar.
        df_ingresos_todos = pd.DataFrame(filas_ingresos_todos or []).fillna("")
        df_ingresos_todos.to_excel(writer, index=False, sheet_name='Ingresos Recibidos')
        _aplicar_diseno_hoja(writer.sheets['Ingresos Recibidos'], len(df_ingresos_todos.columns) or 1, len(filas_ingresos_todos or []))
        _insertar_titulo_hoja(writer.sheets['Ingresos Recibidos'], _titulo_periodo(fecha_desde, fecha_hasta, "MÓDULO DE INGRESOS"))

        # Sin columnas fijas: cada archivo subido puede traer columnas
        # distintas — solo se fuerza un encabezado mínimo si no se subió
        # nada ese mes, para que la hoja no quede completamente vacía.
        df_cancelados_todos = pd.DataFrame(
            filas_cancelados_todos or [], columns=None if filas_cancelados_todos else ["UUID"]
        ).fillna("")
        df_cancelados_todos.to_excel(writer, index=False, sheet_name='Cancelados')
        _aplicar_diseno_hoja(writer.sheets['Cancelados'], len(df_cancelados_todos.columns), len(filas_cancelados_todos or []))
        _insertar_titulo_hoja(writer.sheets['Cancelados'], _titulo_periodo(fecha_desde, fecha_hasta, "ARCHIVO SUBIDO AL EXPORTAR"))

        df_egresos_todos = pd.DataFrame(
            filas_egresos_todos or [], columns=None if filas_egresos_todos else (["uuid"] + _CAMPOS_EGRESO)
        ).fillna("")
        df_egresos_todos.to_excel(writer, index=False, sheet_name='Egresos')
        _aplicar_diseno_hoja(writer.sheets['Egresos'], len(df_egresos_todos.columns), len(filas_egresos_todos or []))
        _insertar_titulo_hoja(writer.sheets['Egresos'], _titulo_periodo(fecha_desde, fecha_hasta, "ARCHIVO SUBIDO AL EXPORTAR"))

    return buffer.getvalue()


_COLUMNAS_CONCILIADOS_RETENCION = [
    "Tipo", "Emisor", "Factura", "Fecha Factura", "Monto (Amarre)", "Concepto (Archivo)",
    "Monto (Auxiliar de Retenciones)", "Diferencia",
]
_COLUMNAS_DIFERENCIAS_AMARRE_RETENCION = ["emisor", "factura", "fecha_factura", "monto", "motivo"]
_COLUMNAS_DIFERENCIAS_ARCHIVO_RETENCION = ["concepto", "monto", "motivo"]
_COLUMNAS_DETALLE_AMARRE_RETENCION = ["emisor", "factura", "fecha_factura", "monto", "emparejado"]
_COLUMNAS_DETALLE_ARCHIVO_RETENCION = ["Fecha", "Número", "Concepto", "Débito", "Crédito"]
_COLUMNAS_IVA_ACREDITABLE = ["emisor", "traslado_iva_amarre", "iva_acreditable_archivo", "diferencia"]
COLUMNA_GRUPO_IVA_ACREDITABLE = "Grupo IVA Acreditable"
_COLUMNAS_DIFERENCIA_RETENCIONES = ["Retención", "Monto (Amarre)", "Monto (Auxiliar de Retenciones)", "Diferencia"]

_COLUMNAS_PRE_DIOT = [
    "Tipo Tercero", "Tipo de Operación",
    "RFC Emisor", "Nombre Emisor",
    "Campo 8 (Tasa 16%)", "Campo 21 (Tasa 0%)", "Campo 22 (Exentos)", "Campo 23 (IVA Retenido)",
    "Total", "Línea DIOT (.txt)",
]
_COLUMNAS_PRE_DIOT_NUMERICAS = {"Campo 8 (Tasa 16%)", "Campo 21 (Tasa 0%)", "Campo 22 (Exentos)", "Campo 23 (IVA Retenido)", "Total"}


_COLUMNAS_AMARRE_REQUERIDAS_PRE_DIOT = ["RFC emisor", "Emisor", "TASA 16%", "TASA 0%", "EXCENTO", "Retención IVA MXN"]


def _resolver_columnas_amarre(columnas_amarre: list[str]) -> dict[str, str]:
    """
    Devuelve {nombre_columna_amarre: letra_de_columna} para las columnas que
    Pre-DIOT necesita referenciar EN VIVO desde la hoja Amarre (fórmulas
    SUMIF). Nombres reales de Amarre (ojo: distintos a los nombres de salida
    de Pre-DIOT) — "RFC emisor" en minúscula y "Emisor" sin "Nombre".

    Lanza ValueError si falta alguna: mejor fallar explícito que dejar que
    Pre-DIOT sume 0 en silencio por una columna que no se encontró.
    """
    faltantes = [c for c in _COLUMNAS_AMARRE_REQUERIDAS_PRE_DIOT if c not in columnas_amarre]
    if faltantes:
        raise ValueError(f"Amarre no tiene las columnas requeridas para Pre-DIOT en vivo: {faltantes}")
    return {c: get_column_letter(columnas_amarre.index(c) + 1) for c in _COLUMNAS_AMARRE_REQUERIDAS_PRE_DIOT}


def _construir_filas_pre_diot(filas_amarre_todas: list[dict], amarre_formulas: dict) -> list[dict]:
    """
    Agrupa las facturas de Amarre por proveedor (RFC + Nombre Emisor) y suma
    las columnas que ya calcula _calcular_desglose_iva/_clasificar_iva_isr_retenido
    (TASA 16%, TASA 0%, EXCENTO, Retención IVA MXN, ISR RET 10%) — el
    "pre-DIOT" que hoy arma el contador a mano: Campo 8/21/22/23 del
    catálogo de proveedores, más un Total (la simple suma de esas 4
    columnas, confirmado con el usuario). El orden de salida es el de
    primera aparición de cada proveedor en Amarre (igual que otras
    agrupaciones de este módulo), no alfabético ni por monto.

    EXCENTO/TASA 0% ya vienen correctos desde _calcular_desglose_iva
    (incluida la reclasificación cuando la factura trae "IVA Exento
    Manual" = verdadero, marcado a mano por el usuario en el editor de
    Ingresos — ver IngresoEditModal.tsx) — aquí solo se suman tal cual, sin
    repetir esa lógica.

    "Tipo Tercero"/"Tipo de Operación": confirmado explícitamente con el
    usuario (2 veces, señalando que no calza con el catálogo del SAT que él
    mismo compartió — TIPO TERCERO admite 04/05/15, "03" no está en esa
    lista — pero así lo pidió de todas formas, posiblemente una convención
    interna de su contador): "Tipo de Operación" es SIEMPRE "85"; "Tipo
    Tercero" es "03" si el proveedor tuvo Retención ISR 10% en el periodo,
    si no "04".

    `amarre_formulas` (`{"letras": {...}, "fila_inicio": int, "fila_fin": int}`,
    ver `_resolver_columnas_amarre`): los 4 campos numéricos de Pre-DIOT se
    escriben como fórmula SUMIF contra la hoja Amarre (referencias
    absolutas $col$fila a propósito: así `_insertar_titulo_hoja` no las
    desplaza al insertar el título de Pre-DIOT — un "$" entre letra y
    número rompe su regex de desplazamiento). "Total" y "Línea DIOT (.txt)"
    se siguen calculando aquí con los valores numéricos antes de sustituir
    por fórmulas (ver nota más abajo) — el .txt definitivo, una vez que el
    usuario corrige algo en Amarre, se obtiene re-leyendo la hoja Pre-DIOT
    ya recalculada por Excel real (ver generar_texto_diot_desde_excel), no
    desde aquí.
    """
    grupos: dict[tuple[str, str], dict] = {}
    orden: list[tuple[str, str]] = []
    for fila in filas_amarre_todas:
        rfc = str(fila.get("RFC emisor", "") or "").strip()
        nombre = str(fila.get("Emisor", "") or "").strip()
        if not rfc and not nombre:
            continue
        clave = (rfc, nombre)
        if clave not in grupos:
            grupos[clave] = {"campo8": 0.0, "campo21": 0.0, "campo22": 0.0, "campo23": 0.0, "isr_ret_10": 0.0}
            orden.append(clave)
        grupo = grupos[clave]
        grupo["campo8"] += _parse_float(fila.get("TASA 16%")) or 0.0
        grupo["campo21"] += _parse_float(fila.get("TASA 0%")) or 0.0
        grupo["campo22"] += _parse_float(fila.get("EXCENTO")) or 0.0
        grupo["campo23"] += _parse_float(fila.get("Retención IVA MXN")) or 0.0
        grupo["isr_ret_10"] += _parse_float(fila.get("ISR RET 10%")) or 0.0

    col_rfc_pre_diot = get_column_letter(_COLUMNAS_PRE_DIOT.index("RFC Emisor") + 1)

    filas_pre_diot = []
    for indice, (rfc, nombre) in enumerate(orden):
        g = grupos[(rfc, nombre)]
        campo8 = round(g["campo8"], 2)
        campo21 = round(g["campo21"], 2)
        campo22 = round(g["campo22"], 2)
        campo23 = round(g["campo23"], 2)
        fila_pre_diot = {
            "Tipo Tercero": "03" if g["isr_ret_10"] > 0.01 else "04",
            "Tipo de Operación": "85",
            "RFC Emisor": rfc,
            "Nombre Emisor": nombre,
            "Campo 8 (Tasa 16%)": campo8,
            "Campo 21 (Tasa 0%)": campo21,
            "Campo 22 (Exentos)": campo22,
            "Campo 23 (IVA Retenido)": campo23,
            "Total": round(campo8 + campo21 + campo22 + campo23, 2),
        }
        # Misma línea que arma el .txt de la DIOT (generar_texto_diot usa la
        # misma función) — se muestra aquí solo como referencia inicial al
        # exportar. Se calcula con los valores numéricos (nunca con las
        # fórmulas de abajo, que openpyxl no evalúa) y queda desactualizada
        # si luego se corrige una celda de Amarre a mano — el .txt definitivo
        # tras corregir se obtiene con generar_texto_diot_desde_excel, que
        # relee la hoja Pre-DIOT ya recalculada por Excel real, nunca esta
        # columna de texto.
        fila_pre_diot["Línea DIOT (.txt)"] = _construir_linea_diot(fila_pre_diot)

        if amarre_formulas:
            letras = amarre_formulas["letras"]
            fila_ini = amarre_formulas["fila_inicio"]
            fila_fin = amarre_formulas["fila_fin"]
            fila_excel = indice + 2  # +1 encabezado, +1 base-1 (antes de insertar título)
            rango_rfc_amarre = f"Amarre!${letras['RFC emisor']}${fila_ini}:${letras['RFC emisor']}${fila_fin}"
            criterio = f"${col_rfc_pre_diot}{fila_excel}"
            for campo_pre_diot, col_amarre in (
                ("Campo 8 (Tasa 16%)", "TASA 16%"),
                ("Campo 21 (Tasa 0%)", "TASA 0%"),
                ("Campo 22 (Exentos)", "EXCENTO"),
                ("Campo 23 (IVA Retenido)", "Retención IVA MXN"),
            ):
                letra = letras[col_amarre]
                rango_suma = f"Amarre!${letra}${fila_ini}:${letra}${fila_fin}"
                fila_pre_diot[campo_pre_diot] = f"=SUMIF({rango_rfc_amarre},{criterio},{rango_suma})"
            col_8 = get_column_letter(_COLUMNAS_PRE_DIOT.index("Campo 8 (Tasa 16%)") + 1)
            col_21 = get_column_letter(_COLUMNAS_PRE_DIOT.index("Campo 21 (Tasa 0%)") + 1)
            col_22 = get_column_letter(_COLUMNAS_PRE_DIOT.index("Campo 22 (Exentos)") + 1)
            col_23 = get_column_letter(_COLUMNAS_PRE_DIOT.index("Campo 23 (IVA Retenido)") + 1)
            # Referencia relativa (sin "$" antes del número de fila) a propósito:
            # esta SÍ debe desplazarse cuando Pre-DIOT inserte su propio título.
            fila_pre_diot["Total"] = f"=${col_8}{fila_excel}+${col_21}{fila_excel}+${col_22}{fila_excel}+${col_23}{fila_excel}"

        filas_pre_diot.append(fila_pre_diot)
    return filas_pre_diot


def _num_diot(valor) -> str:
    """
    Convierte un número al mismo texto que produciría Excel al concatenar
    una celda numérica (CONCATENATE): sin decimales si es un entero exacto
    (9351.0 -> "9351"), si no con hasta 2 decimales sin ceros de más
    (100.50 -> "100.5").
    """
    valor = round(_parse_float(valor) or 0.0, 2)
    if valor == int(valor):
        return str(int(valor))
    return f"{valor:.2f}".rstrip("0").rstrip(".")


# Layout EXACTO de la hoja "DIOT" real del usuario (74 columnas, A a BV —
# la columna BW es solo la fórmula =CONCATENATE(A2,...,BV2) que arma esta
# misma línea). Cada entrada es una de:
# - ("dato", clave): toma fila_pre_diot[clave] tal cual (ya es texto).
# - ("dato_num", clave): toma fila_pre_diot[clave] y lo formatea como
#   número (_num_diot) — estas 3 SÍ se rellenan con "0" cuando no aplican,
#   a diferencia de las columnas "vacio".
# - ("vacio",): la columna existe en el layout pero SIEMPRE se deja en
#   blanco (confirmado contra el archivo real: ID Fiscal, Nombre del
#   Extranjero, País, etc. — campos que no aplican a proveedores
#   nacionales, y los de Dev/Desc/Bon/Importaciones que este sistema no
#   calcula hoy).
# - ("pipe",): columna sin encabezado en el archivo real — su contenido es
#   siempre el carácter "|" literal (incluidas las 30 columnas seguidas sin
#   encabezado entre "DEV, DESC Y BON IMPORT. INTANGIBLES 16%" e "IVA
#   RETENIDO", y las columnas extra entre IVA RETENIDO/EXENTOS/BASE 0% y
#   EFECTOS FISCALES).
_DIOT_LINEA_CAMPOS = [
    ("dato", "Tipo Tercero"), ("pipe",),
    ("dato", "Tipo de Operación"), ("pipe",),
    ("dato", "RFC Emisor"), ("pipe",),
    ("vacio",), ("pipe",),  # ID FISCAL
    ("vacio",), ("pipe",),  # NOMBRE DEL EXTRANJERO
    ("vacio",), ("pipe",),  # PAIS
    ("vacio",), ("pipe",),  # LUGAR DE JURISDICCION FISCAL
    ("vacio",), ("pipe",),  # ACTOS PAGADOS RFN
    ("vacio",), ("pipe",),  # DEV, DESC Y BON RFN
    ("vacio",), ("pipe",),  # ACTOS PAGADOS RFNS
    ("vacio",), ("pipe",),  # DEV, DESC Y BON RFS
    ("dato_num", "Campo 8 (Tasa 16%)"), ("pipe",),  # BASE 16%
    ("vacio",), ("pipe",),  # DEV, DESC Y BON 16%
    ("vacio",), ("pipe",),  # IMPORTACIONES 16%
    ("vacio",), ("pipe",),  # DEV, DESC Y BON EN IMPORT. 16%
    ("vacio",), ("pipe",),  # IMPORT. INTANGIBLES 16%
    ("vacio",), ("pipe",),  # DEV, DESC Y BON IMPORT. INTANGIBLES 16%
    *([("pipe",)] * 30),  # columnas 35-64: sin encabezado en el archivo real
    ("dato_num", "Campo 23 (IVA Retenido)"), ("pipe",), ("pipe",),  # IVA RETENIDO
    ("dato_num", "Campo 22 (Exentos)"), ("pipe",),  # EXENTOS
    ("dato_num", "Campo 21 (Tasa 0%)"), ("pipe",), ("pipe",), ("pipe",),  # BASE 0%
    ("dato", "__efectos_fiscales__"),  # EFECTOS FISCALES A LOS COMPROBANTES
]


def _construir_linea_diot(fila_pre_diot: dict) -> str:
    """Arma la línea de 74 campos para un proveedor, siguiendo _DIOT_LINEA_CAMPOS."""
    partes = []
    for spec in _DIOT_LINEA_CAMPOS:
        tipo = spec[0]
        if tipo == "pipe":
            partes.append("|")
        elif tipo == "vacio":
            partes.append("")
        elif tipo == "dato_num":
            partes.append(_num_diot(fila_pre_diot[spec[1]]))
        elif tipo == "dato":
            clave = spec[1]
            partes.append("01" if clave == "__efectos_fiscales__" else str(fila_pre_diot[clave]))
    return "".join(partes)


def _localizar_fila_encabezado_pre_diot(ws) -> int:
    """
    Busca, en las primeras filas de la hoja Pre-DIOT, la que tiene
    "Tipo Tercero" en la columna A — normalmente fila 2 (fila 1 es el
    título que inserta _insertar_titulo_hoja), pero se busca en vez de
    asumirlo, por si el archivo se guardó sin ese título.
    """
    for fila in range(1, 6):
        valor = ws.cell(row=fila, column=1).value
        if str(valor or "").strip() == "Tipo Tercero":
            return fila
    raise ValueError(
        "No se encontró el encabezado de la hoja 'Pre-DIOT' (se esperaba "
        "\"Tipo Tercero\" en la columna A) — verifica que el archivo subido "
        "sea el Reporte_Pagos exportado por el sistema, sin esa fila borrada."
    )


def generar_texto_diot_desde_excel(file_content: bytes) -> str:
    """
    'Paso 2' de la DIOT: en vez de recalcular todo desde la base de datos,
    lee la hoja Pre-DIOT de un Excel que el sistema ya generó y que
    contabilidad corrigió a mano en Amarre (y volvió a GUARDAR CON EXCEL
    REAL, para que las fórmulas SUMIF de Pre-DIOT — ver
    _construir_filas_pre_diot — recalculen y dejen su resultado en caché
    dentro del archivo), y arma el .txt con esos valores ya corregidos.

    `data_only=True` es imprescindible: sin esto, las celdas con fórmula
    (todas las de Campo 8/21/22/23 ahora que son SUMIF) devolverían el
    texto de la fórmula en vez del número — el mismo bug ya documentado en
    `agregar_pue_ppd_tablas_forma_pago`, de donde se copia este patrón.
    Si el archivo nunca se abrió en Excel/LibreOffice real tras editarlo,
    el caché no existe y las celdas se leen como None (0.0 aquí).
    """
    import openpyxl

    wb = openpyxl.load_workbook(BytesIO(file_content), data_only=True)
    if "Pre-DIOT" not in wb.sheetnames:
        raise ValueError(
            "El archivo no contiene una hoja 'Pre-DIOT' — sube el Reporte_Pagos "
            "exportado por el sistema (con Amarre/Pre-DIOT ya corregidos)."
        )
    ws = wb["Pre-DIOT"]
    fila_encabezado = _localizar_fila_encabezado_pre_diot(ws)

    columnas_encontradas = [
        str(ws.cell(row=fila_encabezado, column=col).value or "").strip()
        for col in range(1, len(_COLUMNAS_PRE_DIOT) + 1)
    ]
    if columnas_encontradas != _COLUMNAS_PRE_DIOT:
        raise ValueError(
            "El encabezado de 'Pre-DIOT' no coincide con el esperado — no se "
            "modifiquen ni reordenen las columnas antes de subir el archivo."
        )
    col_idx = {nombre: i + 1 for i, nombre in enumerate(_COLUMNAS_PRE_DIOT)}

    filas_pre_diot = []
    fila = fila_encabezado + 1
    while True:
        rfc = ws.cell(row=fila, column=col_idx["RFC Emisor"]).value
        rfc_texto = str(rfc or "").strip()
        if not rfc_texto or rfc_texto.upper() == "TOTAL":
            break
        filas_pre_diot.append({
            "Tipo Tercero": str(ws.cell(row=fila, column=col_idx["Tipo Tercero"]).value or "").strip(),
            "Tipo de Operación": str(ws.cell(row=fila, column=col_idx["Tipo de Operación"]).value or "").strip(),
            "RFC Emisor": rfc_texto,
            "Campo 8 (Tasa 16%)": _parse_float(ws.cell(row=fila, column=col_idx["Campo 8 (Tasa 16%)"]).value) or 0.0,
            "Campo 21 (Tasa 0%)": _parse_float(ws.cell(row=fila, column=col_idx["Campo 21 (Tasa 0%)"]).value) or 0.0,
            "Campo 22 (Exentos)": _parse_float(ws.cell(row=fila, column=col_idx["Campo 22 (Exentos)"]).value) or 0.0,
            "Campo 23 (IVA Retenido)": _parse_float(ws.cell(row=fila, column=col_idx["Campo 23 (IVA Retenido)"]).value) or 0.0,
        })
        fila += 1

    return "\r\n".join(_construir_linea_diot(fila_pre_diot) for fila_pre_diot in filas_pre_diot)


def _escribir_hoja_generica(writer, nombre_hoja: str, filas: list[dict], columnas: list[str]) -> None:
    df = pd.DataFrame(filas or [], columns=columnas).fillna("")
    df.to_excel(writer, index=False, sheet_name=nombre_hoja)
    _aplicar_diseno_hoja(writer.sheets[nombre_hoja], len(columnas), len(filas or []))


async def generar_reporte_conciliacion_retenciones(resultado: dict, nombre_columna: str = "IVA RET 10%") -> bytes:
    """
    Genera el Excel de conciliación de retenciones (ver
    app/services/conciliacion_retenciones.py) con 3 hojas:
    - 'Detalle del periodo': volcado completo de Amarre y del archivo
      subido para el periodo filtrado, sin cruzar nada.
    - 'Conciliado': pares que sí cuadraron (1 a 1 o agrupados).
    - 'Diferencias': lo que no cuadró de ningún lado, con motivo.
    """
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        # ── Detalle del periodo (ambos lados, sin cruzar) ──
        df_detalle_amarre = pd.DataFrame(resultado["detalle_amarre"] or [], columns=_COLUMNAS_DETALLE_AMARRE_RETENCION).fillna("")
        df_detalle_amarre.to_excel(writer, index=False, sheet_name='Detalle del periodo', startrow=1)
        ws_detalle = writer.sheets['Detalle del periodo']
        ws_detalle.cell(row=1, column=1, value=f"AMARRE — {nombre_columna}").font = Font(name="Segoe UI", size=11, bold=True)
        _aplicar_diseno_hoja(ws_detalle, len(_COLUMNAS_DETALLE_AMARRE_RETENCION), len(resultado["detalle_amarre"] or []))

        fila_archivo_inicio = len(resultado["detalle_amarre"] or []) + 4
        titulo_archivo = ws_detalle.cell(row=fila_archivo_inicio, column=1, value="ARCHIVO DE RETENCIONES SUBIDO")
        titulo_archivo.font = Font(name="Segoe UI", size=11, bold=True)
        fila_header_archivo = fila_archivo_inicio + 1
        for col_idx, nombre in enumerate(_COLUMNAS_DETALLE_ARCHIVO_RETENCION, start=1):
            cell = ws_detalle.cell(row=fila_header_archivo, column=col_idx, value=nombre)
            cell.fill = _HEADER_FILL
            cell.font = _HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center")
        for offset, fila in enumerate(resultado["detalle_archivo"] or []):
            row_idx = fila_header_archivo + 1 + offset
            for col_idx, nombre in enumerate(_COLUMNAS_DETALLE_ARCHIVO_RETENCION, start=1):
                ws_detalle.cell(row=row_idx, column=col_idx, value=fila.get(nombre, "")).border = _THIN_BORDER

        # ── Conciliado ──
        _escribir_hoja_generica(writer, 'Conciliado', resultado["conciliados"], _COLUMNAS_CONCILIADOS_RETENCION)

        # ── Diferencias (ambos lados, con motivo) ──
        df_dif_amarre = pd.DataFrame(resultado["diferencias_amarre"] or [], columns=_COLUMNAS_DIFERENCIAS_AMARRE_RETENCION).fillna("")
        df_dif_amarre.to_excel(writer, index=False, sheet_name='Diferencias', startrow=1)
        ws_dif = writer.sheets['Diferencias']
        ws_dif.cell(row=1, column=1, value="EN AMARRE, NO ENCONTRADAS EN EL ARCHIVO").font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")
        _aplicar_diseno_hoja(ws_dif, len(_COLUMNAS_DIFERENCIAS_AMARRE_RETENCION), len(resultado["diferencias_amarre"] or []))

        fila_archivo_dif_inicio = len(resultado["diferencias_amarre"] or []) + 4
        titulo_dif_archivo = ws_dif.cell(row=fila_archivo_dif_inicio, column=1, value="EN EL ARCHIVO, NO IDENTIFICADAS EN AMARRE")
        titulo_dif_archivo.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")
        fila_header_dif_archivo = fila_archivo_dif_inicio + 1
        for col_idx, nombre in enumerate(_COLUMNAS_DIFERENCIAS_ARCHIVO_RETENCION, start=1):
            cell = ws_dif.cell(row=fila_header_dif_archivo, column=col_idx, value=nombre)
            cell.fill = _HEADER_FILL
            cell.font = _HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center")
        for offset, fila in enumerate(resultado["diferencias_archivo"] or []):
            row_idx = fila_header_dif_archivo + 1 + offset
            for col_idx, nombre in enumerate(_COLUMNAS_DIFERENCIAS_ARCHIVO_RETENCION, start=1):
                ws_dif.cell(row=row_idx, column=col_idx, value=fila.get(nombre, "")).border = _THIN_BORDER

    return buffer.getvalue()


_COLUMNAS_CAMBIOS_UUID = [
    "Fecha del pago",
    "Fecha del cambio",
    "Factura",
    "UUID anterior",
    "UUID nuevo",
    "Motivo",
]
_COLUMNAS_ELIMINADOS = [
    "Fecha del pago",
    "Fecha de eliminación",
    "Tipo Oper.",
    "Factura",
    "UUID",
    "Estado",
    "Monto",
    "Motivo",
]


async def generar_reporte_auditoria_excel(
    filas_cambios: list[dict],
    filas_eliminados: list[dict],
) -> bytes:
    """
    Genera el Excel de auditoría con 2 hojas:
    - 'Cambios de UUID': historial de correcciones manuales (viejo/nuevo/motivo).
    - 'Eliminados': pagos borrados (cualquier estado, incluye duplicados), con motivo.
    """
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df_cambios = pd.DataFrame(filas_cambios, columns=_COLUMNAS_CAMBIOS_UUID) if filas_cambios else pd.DataFrame(columns=_COLUMNAS_CAMBIOS_UUID)
        df_cambios.to_excel(writer, index=False, sheet_name='Cambios de UUID')
        _aplicar_diseno_hoja(writer.sheets['Cambios de UUID'], len(_COLUMNAS_CAMBIOS_UUID), len(filas_cambios))

        df_eliminados = pd.DataFrame(filas_eliminados, columns=_COLUMNAS_ELIMINADOS) if filas_eliminados else pd.DataFrame(columns=_COLUMNAS_ELIMINADOS)
        df_eliminados.to_excel(writer, index=False, sheet_name='Eliminados')
        _aplicar_diseno_hoja(writer.sheets['Eliminados'], len(_COLUMNAS_ELIMINADOS), len(filas_eliminados))

    return buffer.getvalue()


_FORMULA_FILL = PatternFill(start_color="FFF3BF", end_color="FFF3BF", fill_type="solid")
_FORMULA_FONT = Font(name="Segoe UI", size=9, bold=True, color="BF9000")
_VERDE_FILL = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
# Alerta: cuentas Huésped/Visa/Efectivo/Funcionarios y Empleados cuyo Tipo
# dice "CORTESIA" — esas categorías no deberían recibir cortesía, para dar
# seguimiento. Tiene prioridad sobre los demás colores de la fila.
_ALERTA_FILL = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
_ALERTA_FONT = Font(name="Segoe UI", size=9, bold=True, color="9C0006")
# Fila de TOTAL al final de cada tabla por forma de pago — suma de cada
# columna numérica de esa sección.
_TOTAL_FILL = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
_TOTAL_FONT = Font(name="Segoe UI", size=10, bold=True, color="000000")
# Filas "CUPON VENTAS" dentro de la tabla TUSOSA — solo se resalta la celda
# de Forma de Pago (no toda la fila), para distinguirlas del resto.
_CUPON_VENTA_FILL = PatternFill(start_color="D9C2F0", end_color="D9C2F0", fill_type="solid")

_COLUMNAS_VERDE_TABLA_FACTURACION = {"Subtotal", "Descuento"}
_COLUMNAS_AMARILLO_TABLA_FACTURACION = {"INGTASA 0", "DESC TASA 0"}
_COLUMNAS_NUMERICAS_TABLA_FACTURACION = {
    "Subtotal", "Descuento", "GRAVADO", "INGTASA 0", "DESC TASA 0", "SUBTASA 0",
    "IVA", "Propina", "PAGO PROVEDOR", "TOTAL",
}


def _escribir_tabla_facturacion(ws, fila_inicio: int, titulo: str, df_tabla: "pd.DataFrame", columnas: list[str]) -> int:
    """
    Escribe una de las tablas por categoría de FORMA DE PAGO (título +
    encabezado + filas), con Subtotal/Descuento resaltados en verde e
    INGTASA 0/DESC TASA 0 en amarillo, la celda de Forma de Pago en lila si
    dice "CUPON" (ej. "CUPON VENTAS" dentro de la tabla TUSOSA) — o toda la
    fila en rojo/rosado si `_alerta_cortesia` viene en True (tiene prioridad
    sobre los demás colores) — y, si hay al menos una fila de datos, una
    fila final de TOTAL (resaltada en gris) con la suma de cada columna
    numérica de la tabla. Devuelve la fila donde debería empezar la
    siguiente sección.
    """
    titulo_cell = ws.cell(row=fila_inicio, column=1, value=titulo)
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="1864AB")

    fila_header = fila_inicio + 1
    for col_idx, nombre in enumerate(columnas, start=1):
        cell = ws.cell(row=fila_header, column=col_idx, value=nombre)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    right_align = Alignment(horizontal="right")
    filas_valores = []
    for offset, (_, fila) in enumerate(df_tabla.iterrows()):
        row_idx = fila_header + 1 + offset
        valores = [fila.get(nombre, "") for nombre in columnas]
        filas_valores.append(valores)
        es_alerta = bool(fila.get("_alerta_cortesia", False))
        for col_idx, (nombre, valor) in enumerate(zip(columnas, valores), start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=valor)
            cell.border = _THIN_BORDER
            if nombre in _COLUMNAS_NUMERICAS_TABLA_FACTURACION:
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align
            if es_alerta:
                cell.fill = _ALERTA_FILL
                cell.font = _ALERTA_FONT
            elif nombre in _COLUMNAS_VERDE_TABLA_FACTURACION:
                cell.fill = _VERDE_FILL
            elif nombre in _COLUMNAS_AMARILLO_TABLA_FACTURACION:
                cell.fill = _FORMULA_FILL
            elif nombre == "Forma de Pago" and "CUPON" in str(fila.get("Forma de Pago", "")).strip().upper():
                cell.fill = _CUPON_VENTA_FILL

    hay_fila_total = not df_tabla.empty
    if hay_fila_total:
        fila_total_idx = fila_header + 1 + len(df_tabla)
        valores_total = []
        for nombre in columnas:
            if nombre in _COLUMNAS_NUMERICAS_TABLA_FACTURACION and nombre in df_tabla.columns:
                suma = pd.to_numeric(df_tabla[nombre], errors="coerce").fillna(0).sum()
                valores_total.append(round(float(suma), 2))
            elif nombre == "Cuenta":
                valores_total.append("TOTAL")
            else:
                valores_total.append("")
        filas_valores.append(valores_total)
        for col_idx, (nombre, valor) in enumerate(zip(columnas, valores_total), start=1):
            cell = ws.cell(row=fila_total_idx, column=col_idx, value=valor)
            cell.border = _THIN_BORDER
            cell.fill = _TOTAL_FILL
            cell.font = _TOTAL_FONT
            if nombre in _COLUMNAS_NUMERICAS_TABLA_FACTURACION:
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align

    for col_idx, nombre in enumerate(columnas, start=1):
        col_letter = get_column_letter(col_idx)
        max_len = max([len(nombre)] + [len(str(v[col_idx - 1])) for v in filas_valores]) if filas_valores else len(nombre)
        ancho_actual = ws.column_dimensions[col_letter].width or 0
        ws.column_dimensions[col_letter].width = max(ancho_actual, max_len + 3, 12)

    filas_extra = 1 if hay_fila_total else 0
    return fila_header + 1 + len(df_tabla) + filas_extra + 2  # +2 filas en blanco antes de la siguiente sección


async def generar_reporte_facturacion_excel(
    df_datos_combinados: pd.DataFrame,
    df_segunda_limpieza: pd.DataFrame,
    celdas_editadas: dict | None = None,
) -> bytes:
    """
    Genera el Excel de Facturación con 2 hojas:
    - 'Datos_Combinados': las columnas de origen tal cual, más 5 columnas de
      fórmula (Cálculo Hacienda, INGTASA 0 p2, Subtotal Tienda, Desfiltro,
      suma) escritas solo en filas donde POS_x sea 'LA HACIENDA', y una
      fórmula condicional sobre 'Subtotal Tipo Producto' (=TOTAL*0.33) solo
      en filas donde POS_x sea 'AGENCIA DE VIAJES'.
    - 'Segunda_Limpieza': 16 columnas fijas, con fórmulas que referencian de
      vuelta a Datos_Combinados para las filas 'LA HACIENDA', y SUBTASA 0
      (J-K de esta misma hoja) para todas las filas.

    Las letras de columna de Datos_Combinados se resuelven dinámicamente por
    nombre en vez de hardcodearse: esa hoja solo incluye las columnas que
    existan en los archivos de origen, así que una columna ausente correría
    todas las letras subsecuentes si estuvieran fijas en el código.

    celdas_editadas es {índice de fila en df_segunda_limpieza: {columnas...}}
    (ver celdas_editadas_segunda_limpieza / corregir_total_subtotal_pago_mixto
    en facturacion.py) — columnas ya sea editadas a mano por el usuario o
    corregidas automáticamente (pago mixto) cuyo valor en df_segunda_limpieza
    debe respetarse tal cual, ganándole a las fórmulas/reglas de Hacienda de
    abajo (Subtotal/Descuento en filas LA HACIENDA, INGTASA 0/DESC TASA 0/
    SUBTASA 0 en cualquier fila) que de otro modo las recalculan siempre.
    """
    celdas_editadas = celdas_editadas or {}
    from app.services.facturacion import (
        COLUMNAS_FORMULA_HACIENDA,
        COLUMNAS_SEGUNDA_LIMPIEZA,
        COLUMNAS_TABLA_FACTURACION,
        POS_AGENCIA_DE_VIAJES,
        POS_LA_HACIENDA,
        SEGMENTO_CORTESIA,
        construir_tablas_por_forma_pago,
        es_alerta_cortesia,
    )

    columnas_base = list(df_datos_combinados.columns)
    num_filas = len(df_datos_combinados)

    def _letra(nombre: str) -> str | None:
        if nombre not in columnas_base:
            return None
        return get_column_letter(columnas_base.index(nombre) + 1)

    letra_subtotal = _letra("Subtotal")
    letra_descuento = _letra("Descuento")
    letra_tax = _letra("Tax")
    letra_total = _letra("TOTAL")

    col_subtotal_tipo_producto_idx = (
        columnas_base.index("Subtotal Tipo Producto") + 1
        if "Subtotal Tipo Producto" in columnas_base
        else None
    )

    if "POS_x" in columnas_base:
        pos_normalizado = df_datos_combinados["POS_x"].astype(str).str.strip().str.upper().tolist()
    else:
        logger.warning(
            "generar_reporte_facturacion_excel: no se encontró la columna "
            "'POS_x' — no se aplicará ninguna fórmula de Hacienda/Agencia de Viajes."
        )
        pos_normalizado = [""] * num_filas

    puede_hacienda = bool(letra_subtotal and letra_descuento and letra_tax)
    puede_agencia = bool(letra_total and col_subtotal_tipo_producto_idx)

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        # ── Hoja Datos_Combinados ──
        df_datos_combinados.to_excel(writer, index=False, sheet_name="Datos_Combinados")
        ws1 = writer.sheets["Datos_Combinados"]

        col_formula_inicio = len(columnas_base) + 1
        for offset, nombre in enumerate(COLUMNAS_FORMULA_HACIENDA):
            ws1.cell(row=1, column=col_formula_inicio + offset, value=nombre)

        letras_formula = {
            nombre: get_column_letter(col_formula_inicio + offset)
            for offset, nombre in enumerate(COLUMNAS_FORMULA_HACIENDA)
        }
        letra_calculo_hacienda = letras_formula["Cálculo Hacienda"]
        letra_ingtasa_p2 = letras_formula["INGTASA 0 p2"]
        letra_subtotal_tienda = letras_formula["Subtotal Tienda"]
        letra_desfiltro = letras_formula["Desfiltro"]
        letra_suma = letras_formula["suma"]

        celdas_formula_datos_combinados = []

        for offset in range(num_filas):
            row = offset + 2
            pos_valor = pos_normalizado[offset]

            if puede_agencia and pos_valor == POS_AGENCIA_DE_VIAJES:
                celdas_formula_datos_combinados.append(
                    (row, col_subtotal_tipo_producto_idx, f"={letra_total}{row}*0.33")
                )

            if puede_hacienda and pos_valor == POS_LA_HACIENDA:
                celdas_formula_datos_combinados.append(
                    (row, col_formula_inicio, f"={letra_tax}{row}/0.16")
                )
                celdas_formula_datos_combinados.append((
                    row, col_formula_inicio + 1,
                    f"=IF({letra_subtotal}{row}-{letra_descuento}{row}-{letra_calculo_hacienda}{row}<=0.2,"
                    f"0,{letra_subtotal}{row}-{letra_descuento}{row}-{letra_calculo_hacienda}{row})",
                ))
                celdas_formula_datos_combinados.append((
                    row, col_formula_inicio + 2,
                    f"={letra_calculo_hacienda}{row}+{letra_descuento}{row}",
                ))
                celdas_formula_datos_combinados.append((
                    row, col_formula_inicio + 3,
                    f"=IF(AND({letra_tax}{row}<=0.2,{letra_tax}{row}>=0),{letra_descuento}{row},0)",
                ))
                celdas_formula_datos_combinados.append((
                    row, col_formula_inicio + 4,
                    f"={letra_desfiltro}{row}+{letra_ingtasa_p2}{row}",
                ))

        for row, col, formula in celdas_formula_datos_combinados:
            ws1.cell(row=row, column=col, value=formula)

        _aplicar_diseno_hoja(ws1, len(columnas_base) + len(COLUMNAS_FORMULA_HACIENDA), num_filas)

        for row, col, _ in celdas_formula_datos_combinados:
            cell = ws1.cell(row=row, column=col)
            cell.fill = _FORMULA_FILL
            cell.font = _FORMULA_FONT

        # ── Hoja Segunda_Limpieza ──
        df_segunda_limpieza.to_excel(writer, index=False, sheet_name="Segunda_Limpieza")
        ws2 = writer.sheets["Segunda_Limpieza"]

        col_ingtasa0 = COLUMNAS_SEGUNDA_LIMPIEZA.index("INGTASA 0") + 1
        col_desc_tasa0 = COLUMNAS_SEGUNDA_LIMPIEZA.index("DESC TASA 0") + 1
        col_subtasa0 = COLUMNAS_SEGUNDA_LIMPIEZA.index("SUBTASA 0") + 1
        col_subtotal_s2 = COLUMNAS_SEGUNDA_LIMPIEZA.index("Subtotal") + 1
        col_descuento_s2 = COLUMNAS_SEGUNDA_LIMPIEZA.index("Descuento") + 1

        forma_pago_s2 = df_segunda_limpieza["FORMA DE PAGO"] if "FORMA DE PAGO" in df_segunda_limpieza.columns else None
        tipo_s2 = df_segunda_limpieza["Tipo"] if "Tipo" in df_segunda_limpieza.columns else None
        iva_s2 = df_segunda_limpieza["Iva"] if "Iva" in df_segunda_limpieza.columns else None
        subtotal_s2 = df_segunda_limpieza["Subtotal"] if "Subtotal" in df_segunda_limpieza.columns else None
        descuento_s2 = df_segunda_limpieza["Descuento"] if "Descuento" in df_segunda_limpieza.columns else None
        fecha_s2 = df_segunda_limpieza["Fecha"] if "Fecha" in df_segunda_limpieza.columns else None
        pos_s2 = df_segunda_limpieza["POS"] if "POS" in df_segunda_limpieza.columns else None
        cuenta_s2 = df_segunda_limpieza["Cuenta"] if "Cuenta" in df_segunda_limpieza.columns else None
        propina_s2 = df_segunda_limpieza["Propina"] if "Propina" in df_segunda_limpieza.columns else None
        pago_proveedor_s2 = df_segunda_limpieza["PAGO PROVEDOR"] if "PAGO PROVEDOR" in df_segunda_limpieza.columns else None
        subtotal_dc = df_datos_combinados["Subtotal"] if "Subtotal" in df_datos_combinados.columns else None
        descuento_dc = df_datos_combinados["Descuento"] if "Descuento" in df_datos_combinados.columns else None
        tax_dc = df_datos_combinados["Tax"] if "Tax" in df_datos_combinados.columns else None

        celdas_formula_segunda_limpieza = []
        # Valores finales reales por fila (no fórmulas) — para alimentar la
        # hoja de Tablas por Forma de Pago más abajo, que necesita el número
        # real de Subtotal/Descuento/INGTASA 0/DESC TASA 0 tal como queda
        # cada fila, no la fórmula de Excel que referencia otra hoja.
        filas_finales_segunda_limpieza = []
        # Filas cuya FORMA DE PAGO es Huésped/Visa/Efectivo/Funcionarios y
        # Empleados pero cuyo Tipo dice "CORTESIA" — se resaltan en rojo.
        filas_alerta_cortesia: set[int] = set()

        for offset in range(num_filas):
            row = offset + 2
            idx = df_segunda_limpieza.index[offset]
            editados = celdas_editadas.get(idx, set())
            pos_valor = pos_normalizado[offset]

            forma_pago_general = forma_pago_s2.iloc[offset] if forma_pago_s2 is not None else ""
            tipo_general = tipo_s2.iloc[offset] if tipo_s2 is not None else ""
            if es_alerta_cortesia(forma_pago_general, tipo_general):
                filas_alerta_cortesia.add(row)

            # INGTASA 0 / DESC TASA 0 se escriben SIEMPRE como valores planos
            # (0 por defecto) — nunca quedan vacías, aunque la fila no sea
            # LA HACIENDA.
            ingtasa0_valor = 0.0
            desc_tasa0_valor = 0.0
            subtotal_final = _parse_float(subtotal_s2.iloc[offset]) if subtotal_s2 is not None else None
            descuento_final = _parse_float(descuento_s2.iloc[offset]) if descuento_s2 is not None else None

            if puede_hacienda and pos_valor == POS_LA_HACIENDA:
                subtotal_val = _parse_float(subtotal_dc.iloc[offset]) if subtotal_dc is not None else None
                descuento_val = _parse_float(descuento_dc.iloc[offset]) if descuento_dc is not None else None
                tax_val = _parse_float(tax_dc.iloc[offset]) if tax_dc is not None else None
                subtotal_tienda_val, desfiltro_val, suma_val = _calcular_valores_hacienda(
                    subtotal_val or 0.0, descuento_val or 0.0, tax_val or 0.0
                )
                ingtasa0_valor = round(suma_val, 2)
                desc_tasa0_valor = desfiltro_val

                forma_pago_valor = str(forma_pago_s2.iloc[offset]).strip().upper() if forma_pago_s2 is not None else ""

                if forma_pago_valor == SEGMENTO_CORTESIA:
                    # Cortesía en LA HACIENDA: el valor que le tocaba a
                    # INGTASA 0 se manda a Subtotal, e INGTASA 0 queda en 0.
                    # Tiene prioridad sobre la regla de "Iva≈0" de abajo.
                    subtotal_final = round(ingtasa0_valor, 2)
                    if "Subtotal" in editados:
                        subtotal_final = _parse_float(df_segunda_limpieza.at[idx, "Subtotal"])
                    celdas_formula_segunda_limpieza.append((row, col_subtotal_s2, subtotal_final))
                    ingtasa0_valor = 0.0
                else:
                    # Para filas de LA HACIENDA que NO son Cortesía y cuyo Iva
                    # es (prácticamente) 0, Subtotal Y Descuento se fuerzan a
                    # 0 en vez de la fórmula habitual — mismo umbral de
                    # "efectivamente cero" (<=0.2) que ya usa Desfiltro en
                    # Datos_Combinados.
                    iva_valor = _parse_float(iva_s2.iloc[offset]) if iva_s2 is not None else None
                    subtotal_en_cero = iva_valor is not None and abs(iva_valor) <= 0.2

                    if subtotal_en_cero:
                        subtotal_final = 0.0
                        descuento_final = 0.0
                        if "Subtotal" in editados:
                            subtotal_final = _parse_float(df_segunda_limpieza.at[idx, "Subtotal"])
                        if "Descuento" in editados:
                            descuento_final = _parse_float(df_segunda_limpieza.at[idx, "Descuento"])
                        celdas_formula_segunda_limpieza.append((row, col_subtotal_s2, subtotal_final))
                        celdas_formula_segunda_limpieza.append((row, col_descuento_s2, descuento_final))
                    elif "Subtotal" in editados:
                        subtotal_final = _parse_float(df_segunda_limpieza.at[idx, "Subtotal"])
                        celdas_formula_segunda_limpieza.append((row, col_subtotal_s2, subtotal_final))
                    else:
                        subtotal_final = round(subtotal_tienda_val, 2)
                        celdas_formula_segunda_limpieza.append((
                            row, col_subtotal_s2, f"=ROUND(Datos_Combinados!{letra_subtotal_tienda}{row},2)",
                        ))

            # Las ediciones manuales (o correcciones automáticas de pago
            # mixto) tienen la última palabra sobre cualquier regla de
            # negocio de arriba: si la celda fue editada/corregida
            # explícitamente, se respeta su valor tal cual en vez del
            # calculado.
            if "INGTASA 0" in editados:
                ingtasa0_valor = _parse_float(df_segunda_limpieza.at[idx, "INGTASA 0"]) or 0.0
            if "DESC TASA 0" in editados:
                desc_tasa0_valor = _parse_float(df_segunda_limpieza.at[idx, "DESC TASA 0"]) or 0.0

            celdas_formula_segunda_limpieza.append((row, col_ingtasa0, ingtasa0_valor))
            celdas_formula_segunda_limpieza.append((row, col_desc_tasa0, desc_tasa0_valor))

            # SUBTASA 0 se calcula para TODAS las filas, no solo LA HACIENDA,
            # como valor plano (INGTASA 0 - DESC TASA 0 de esta misma fila,
            # ya con las reglas anteriores aplicadas) — salvo que también
            # haya sido editada/corregida explícitamente.
            subtasa0_valor = round(ingtasa0_valor - desc_tasa0_valor, 2)
            if "SUBTASA 0" in editados:
                subtasa0_valor = _parse_float(df_segunda_limpieza.at[idx, "SUBTASA 0"]) or 0.0
            celdas_formula_segunda_limpieza.append((row, col_subtasa0, subtasa0_valor))

            filas_finales_segunda_limpieza.append({
                "Fecha": fecha_s2.iloc[offset] if fecha_s2 is not None else "",
                "POS": pos_s2.iloc[offset] if pos_s2 is not None else "",
                "FORMA DE PAGO": forma_pago_s2.iloc[offset] if forma_pago_s2 is not None else "",
                "Tipo": tipo_s2.iloc[offset] if tipo_s2 is not None else "",
                "Cuenta": cuenta_s2.iloc[offset] if cuenta_s2 is not None else "",
                "Subtotal": subtotal_final if subtotal_final is not None else 0.0,
                "Descuento": descuento_final if descuento_final is not None else 0.0,
                "INGTASA 0": ingtasa0_valor,
                "DESC TASA 0": desc_tasa0_valor,
                "Propina": propina_s2.iloc[offset] if propina_s2 is not None else 0.0,
                "PAGO PROVEDOR": pago_proveedor_s2.iloc[offset] if pago_proveedor_s2 is not None else 0.0,
            })

        for row, col, formula in celdas_formula_segunda_limpieza:
            ws2.cell(row=row, column=col, value=formula)

        _aplicar_diseno_hoja(ws2, len(COLUMNAS_SEGUNDA_LIMPIEZA), num_filas)

        for row, col, _ in celdas_formula_segunda_limpieza:
            cell = ws2.cell(row=row, column=col)
            cell.fill = _FORMULA_FILL
            cell.font = _FORMULA_FONT

        # Alerta de Cortesía indebida: tiene prioridad sobre los colores de
        # arriba, se aplica a toda la fila.
        for row in filas_alerta_cortesia:
            for col in range(1, len(COLUMNAS_SEGUNDA_LIMPIEZA) + 1):
                cell = ws2.cell(row=row, column=col)
                cell.fill = _ALERTA_FILL
                cell.font = _ALERTA_FONT

        # ── Hoja Tablas por Forma de Pago ──
        df_segunda_limpieza_final = pd.DataFrame(filas_finales_segunda_limpieza)
        tablas = construir_tablas_por_forma_pago(df_segunda_limpieza_final)

        ws3 = writer.book.create_sheet("Tablas_Forma_Pago")
        fila_actual = 1
        for titulo, df_tabla in tablas:
            fila_actual = _escribir_tabla_facturacion(ws3, fila_actual, titulo, df_tabla, COLUMNAS_TABLA_FACTURACION)

    return buffer.getvalue()


def _escribir_bloque_resumen(
    ws, fila_inicio: int, col_inicio: int, titulo: str, columnas: list[str],
    filas: list[dict], fill: "PatternFill",
) -> None:
    """
    Escribe un bloque resumen de 3 columnas (Cuenta + 2 numéricas) empezando
    en (fila_inicio, col_inicio): título + header + filas + fila TOTAL
    (suma). Las 2 columnas numéricas se resaltan con `fill` en todas las
    filas (datos y total); la columna Cuenta queda sin relleno. Usado por
    agregar_pue_ppd_tablas_forma_pago para los bloques PUE/PPD.
    """
    titulo_cell = ws.cell(row=fila_inicio, column=col_inicio, value=titulo)
    titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="1864AB")

    fila_header = fila_inicio + 1
    for offset, nombre in enumerate(columnas):
        cell = ws.cell(row=fila_header, column=col_inicio + offset, value=nombre)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    right_align = Alignment(horizontal="right")
    sumas = [0.0, 0.0]
    for offset, fila in enumerate(filas):
        row_idx = fila_header + 1 + offset
        for col_offset, nombre in enumerate(columnas):
            valor = fila[nombre]
            cell = ws.cell(row=row_idx, column=col_inicio + col_offset, value=valor)
            cell.border = _THIN_BORDER
            if col_offset > 0:
                cell.number_format = _NUM_FORMAT
                cell.alignment = right_align
                cell.fill = fill
                sumas[col_offset - 1] += valor or 0.0

    fila_total_idx = fila_header + 1 + len(filas)
    cell_label = ws.cell(row=fila_total_idx, column=col_inicio, value="TOTAL" if filas else "")
    cell_label.border = _THIN_BORDER
    cell_label.font = _TOTAL_FONT
    for col_offset in range(1, len(columnas)):
        cell = ws.cell(row=fila_total_idx, column=col_inicio + col_offset, value=round(sumas[col_offset - 1], 2))
        cell.border = _THIN_BORDER
        cell.number_format = _NUM_FORMAT
        cell.alignment = right_align
        cell.fill = fill
        cell.font = _TOTAL_FONT

    ancho_cuenta = max([len("Cuenta")] + [len(str(f["Cuenta"])) for f in filas]) if filas else len("Cuenta")
    col_letter = get_column_letter(col_inicio)
    ws.column_dimensions[col_letter].width = max(ws.column_dimensions[col_letter].width or 0, ancho_cuenta + 3, 12)


def _localizar_filas_titulo_tabla_forma_pago(ws, titulos_conocidos: set[str]) -> dict[str, int]:
    """
    Escanea la columna A de la hoja Tablas_Forma_Pago buscando, para cada
    título conocido (ver TABLAS_FACTURACION), la primera fila cuyo texto
    coincide exactamente (case-insensitive) con ese título. Compartida entre
    agregar_pue_ppd_tablas_forma_pago (lee 5 columnas, para los bloques
    PUE/PPD) y leer_filas_completas_tablas_forma_pago (lee las 15 columnas,
    para guardar en base de datos) — misma lógica de localización de
    secciones, la parte más delicada de este parser.
    """
    filas_titulo: dict[str, int] = {}
    for row in range(1, ws.max_row + 1):
        valor = ws.cell(row=row, column=1).value
        if valor is None:
            continue
        texto = str(valor).strip().upper()
        for titulo in titulos_conocidos:
            if texto == titulo.upper() and titulo not in filas_titulo:
                filas_titulo[titulo] = row
    return filas_titulo


async def agregar_pue_ppd_tablas_forma_pago(file_content: bytes) -> bytes:
    """
    "Paso 2" del flujo de Facturación, independiente de generar_reporte_facturacion_excel:
    recibe un Excel de Tablas_Forma_Pago ya generado (y, normalmente,
    corregido a mano por contabilidad fuera del sistema) y le agrega — sin
    tocar nada de lo que ya trae — 4 bloques resumen en columnas nuevas:
    - "PUE GRAVADA" (columnas P, Q, R = Cuenta/Subtotal/Descuento): junta
      las filas de EFECTIVO + VISA/MASTERCARD + AMERICAN EXPRESS +
      FUNCIONARIOS Y EMPLEADOS cuyo Subtotal sea > 0 (vacío o 0 se
      excluye), empezando en la fila del título "EFECTIVO".
    - "PUE TASA 0" (columnas T, U, V = Cuenta/INGTASA 0/DESC TASA 0):
      mismas 4 secciones, filas cuyo INGTASA 0 sea > 0, misma fila de
      inicio que "PUE GRAVADA".
    - "PPD GRAVADA" (columnas Q, R, S — una columna a la derecha del
      bloque de arriba) y "PPD TASA 0" (columnas U, V, W, ídem una columna
      a la derecha): mismo par pero solo con las filas de HUÉSPED,
      empezando en la fila del título "HUÉSPED".
    Cada bloque lleva su propia fila TOTAL (suma). Requiere que el archivo
    tenga una hoja "Tablas_Forma_Pago" con el mismo formato que ya produce
    generar_reporte_facturacion_excel (mismos títulos de sección y mismo
    orden de columnas de COLUMNAS_TABLA_FACTURACION) — no se reconstruye
    nada: se lee por posición fija de columna, igual que se escribió.
    """
    import openpyxl

    from app.services.facturacion import (
        CATEGORIAS_PUE_PPD,
        COLUMNAS_TABLA_FACTURACION,
        TABLAS_FACTURACION,
        TITULO_HUESPED,
    )

    # data_only=True: si el usuario escribió una fórmula a mano en una celda
    # (ej. "=51.61-0.3") al corregir el archivo en Excel, sin esto
    # cell.value devolvería el texto de la fórmula en vez del resultado
    # calculado que Excel ya guardó en caché al guardar — _parse_float no
    # puede convertir ese texto a número, así que la fila se descartaba
    # silenciosamente del PUE/PPD (bug real reportado por el usuario).
    wb = openpyxl.load_workbook(BytesIO(file_content), data_only=True)
    if "Tablas_Forma_Pago" not in wb.sheetnames:
        raise ValueError("El archivo no contiene una hoja 'Tablas_Forma_Pago'.")
    ws = wb["Tablas_Forma_Pago"]

    titulos_conocidos = {titulo for titulo, _ in TABLAS_FACTURACION}
    filas_titulo = _localizar_filas_titulo_tabla_forma_pago(ws, titulos_conocidos)

    col_cuenta = COLUMNAS_TABLA_FACTURACION.index("Cuenta") + 1
    col_subtotal = COLUMNAS_TABLA_FACTURACION.index("Subtotal") + 1
    col_descuento = COLUMNAS_TABLA_FACTURACION.index("Descuento") + 1
    col_ingtasa0 = COLUMNAS_TABLA_FACTURACION.index("INGTASA 0") + 1
    col_desctasa0 = COLUMNAS_TABLA_FACTURACION.index("DESC TASA 0") + 1

    def _leer_filas_seccion(titulo: str) -> list[dict]:
        """
        Lee las filas de datos de una sección, tolerando filas en blanco
        intercaladas (ej. si el usuario ajustó el archivo a mano e insertó
        una fila para separar grupos): antes se cortaba la lectura entera
        en la PRIMERA celda de Cuenta vacía, perdiendo silenciosamente
        cualquier cuenta real que viniera después dentro de la misma
        sección. Ahora una fila con Cuenta vacía simplemente se salta (no
        se agrega), sin cortar el bucle — solo se corta al encontrar la
        fila "TOTAL" literal, o al llegar a la fila del siguiente título de
        sección conocido (límite de seguridad para no leer de más).
        """
        fila_titulo = filas_titulo.get(titulo)
        if fila_titulo is None:
            return []

        filas_siguientes = [r for r in filas_titulo.values() if r > fila_titulo]
        limite = min(filas_siguientes) if filas_siguientes else ws.max_row + 1

        filas = []
        row = fila_titulo + 2  # +1 título->header, +1 header->primera fila de datos
        while row < limite:
            cuenta = ws.cell(row=row, column=col_cuenta).value
            if cuenta is not None and str(cuenta).strip().upper() == "TOTAL":
                break
            if cuenta is not None:
                filas.append({
                    "Cuenta": cuenta,
                    "Subtotal": _parse_float(ws.cell(row=row, column=col_subtotal).value) or 0.0,
                    "Descuento": _parse_float(ws.cell(row=row, column=col_descuento).value) or 0.0,
                    "INGTASA 0": _parse_float(ws.cell(row=row, column=col_ingtasa0).value) or 0.0,
                    "DESC TASA 0": _parse_float(ws.cell(row=row, column=col_desctasa0).value) or 0.0,
                })
            row += 1
        return filas

    filas_combinadas = []
    for titulo in CATEGORIAS_PUE_PPD:
        filas_combinadas.extend(_leer_filas_seccion(titulo))
    filas_huesped = _leer_filas_seccion(TITULO_HUESPED)

    bloques = []
    if "EFECTIVO" in filas_titulo:
        fila_ref = filas_titulo["EFECTIVO"]
        bloques.append((fila_ref, 16, "PUE GRAVADA", ["Cuenta", "Subtotal", "Descuento"],
                         [f for f in filas_combinadas if f["Subtotal"] > 0], _VERDE_FILL))
        bloques.append((fila_ref, 20, "PUE TASA 0", ["Cuenta", "INGTASA 0", "DESC TASA 0"],
                         [f for f in filas_combinadas if f["INGTASA 0"] > 0], _FORMULA_FILL))
    if TITULO_HUESPED in filas_titulo:
        fila_ref = filas_titulo[TITULO_HUESPED]
        bloques.append((fila_ref, 17, "PPD GRAVADA", ["Cuenta", "Subtotal", "Descuento"],
                         [f for f in filas_huesped if f["Subtotal"] > 0], _VERDE_FILL))
        bloques.append((fila_ref, 21, "PPD TASA 0", ["Cuenta", "INGTASA 0", "DESC TASA 0"],
                         [f for f in filas_huesped if f["INGTASA 0"] > 0], _FORMULA_FILL))

    for fila_inicio, col_inicio, titulo, columnas, filas, fill in bloques:
        _escribir_bloque_resumen(ws, fila_inicio, col_inicio, titulo, columnas, filas, fill)

    salida = BytesIO()
    wb.save(salida)
    return salida.getvalue()


def leer_filas_completas_tablas_forma_pago(file_content: bytes) -> list[dict]:
    """
    Lee TODAS las columnas (las 15 de COLUMNAS_TABLA_FACTURACION, no solo las
    5 que usa agregar_pue_ppd_tablas_forma_pago) de cada una de las 7
    secciones de la hoja Tablas_Forma_Pago — para el guardado en base de
    datos del "Paso 2" (el archivo, en ese punto, ya fue corregido a mano
    por contabilidad y sus montos por cuenta ya están cuadrados). Reusa
    _localizar_filas_titulo_tabla_forma_pago y la misma regla de corte que
    agregar_pue_ppd_tablas_forma_pago (saltar Cuenta vacía sin cortar el
    bucle, cortar en "TOTAL" literal o en el límite de la siguiente
    sección) para tolerar exactamente lo mismo que ese endpoint ya
    verificado (filas en blanco intercaladas, fórmulas escritas a mano).

    Regresa una lista plana de dicts, uno por fila de dato real, con
    "tabla_origen" (el título de sección), "fila_excel" (número de fila en
    la hoja) y las 15 columnas con sus nombres tal cual
    COLUMNAS_TABLA_FACTURACION — sin conocer el esquema de base de datos
    (ese mapeo vive en services/facturacion.py, no aquí).
    """
    import openpyxl

    from app.services.facturacion import COLUMNAS_TABLA_FACTURACION, TABLAS_FACTURACION

    # data_only=True: mismo motivo que en agregar_pue_ppd_tablas_forma_pago
    # — sin esto, una fórmula escrita a mano al corregir el archivo (ej.
    # "=51.61-0.3") se leería como texto en vez del resultado cacheado.
    wb = openpyxl.load_workbook(BytesIO(file_content), data_only=True)
    if "Tablas_Forma_Pago" not in wb.sheetnames:
        raise ValueError("El archivo no contiene una hoja 'Tablas_Forma_Pago'.")
    ws = wb["Tablas_Forma_Pago"]

    titulos_conocidos = {titulo for titulo, _ in TABLAS_FACTURACION}
    filas_titulo = _localizar_filas_titulo_tabla_forma_pago(ws, titulos_conocidos)

    columnas_texto = ("Revisión", "Fecha", "POS", "Forma de Pago", "Cuenta")
    col_indice = {nombre: COLUMNAS_TABLA_FACTURACION.index(nombre) + 1 for nombre in COLUMNAS_TABLA_FACTURACION}
    col_cuenta = col_indice["Cuenta"]

    filas_completas: list[dict] = []
    for titulo, _palabras_clave in TABLAS_FACTURACION:
        fila_titulo = filas_titulo.get(titulo)
        if fila_titulo is None:
            continue

        filas_siguientes = [r for r in filas_titulo.values() if r > fila_titulo]
        limite = min(filas_siguientes) if filas_siguientes else ws.max_row + 1

        row = fila_titulo + 2  # +1 título->header, +1 header->primera fila de datos
        while row < limite:
            cuenta = ws.cell(row=row, column=col_cuenta).value
            if cuenta is not None and str(cuenta).strip().upper() == "TOTAL":
                break
            if cuenta is not None:
                fila_dict: dict = {"tabla_origen": titulo, "fila_excel": row}
                for nombre, columna in col_indice.items():
                    valor = ws.cell(row=row, column=columna).value
                    if nombre in columnas_texto:
                        fila_dict[nombre] = str(valor).strip() if valor is not None else None
                    else:
                        fila_dict[nombre] = _parse_float(valor) or 0.0
                filas_completas.append(fila_dict)
            row += 1

    return filas_completas


# Mismo agrupamiento de columnas (con los mismos colores pálidos) que
# GRUPOS_COLUMNAS_TABLA_GUARDADA en frontend/src/pages/FacturacionPage.tsx —
# Identificación/Montos/Tasa 0%/Cálculos, sin "Fecha" por columna (el día ya
# es el encabezado de cada sección, no hace falta repetirlo por fila).
_GRUPOS_COLUMNAS_TABLA_GUARDADO_EXCEL: list[tuple[str, str, list[tuple[str, str]]]] = [
    ("Identificación", "E9ECEF", [("cuenta", "Cuenta"), ("pos", "POS"), ("forma_de_pago", "Forma de Pago")]),
    ("Montos", "D3F9D8", [("subtotal", "Subtotal"), ("descuento", "Descuento"), ("gravado", "GRAVADO")]),
    ("Tasa 0%", "FFF3BF", [("ingtasa_0", "INGTASA 0"), ("desc_tasa_0", "DESC TASA 0"), ("subtasa_0", "SUBTASA 0")]),
    ("Cálculos", "C5F6FA", [
        ("iva", "IVA"), ("propina", "Propina"), ("pago_proveedor", "PAGO PROVEDOR"), ("total", "TOTAL"),
    ]),
]
_COLUMNAS_TABLA_GUARDADO_EXCEL = [
    columna for _titulo, _color, columnas in _GRUPOS_COLUMNAS_TABLA_GUARDADO_EXCEL for columna in columnas
]
_COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL = {
    "subtotal", "descuento", "gravado", "ingtasa_0", "desc_tasa_0", "subtasa_0", "iva", "propina",
    "pago_proveedor", "total",
}
_ULTIMA_COLUMNA_TABLA_GUARDADO_EXCEL = len(_COLUMNAS_TABLA_GUARDADO_EXCEL)
_ANCHO_COLUMNA_TABLA_GUARDADO_EXCEL = {"cuenta": 16, "pos": 22, "forma_de_pago": 18}

# Mismos 7 colores ya elegidos para la pestaña Análisis (CLAVES_TABLA_ANALITICA
# en FacturacionPage.tsx) — el color de cada tabla significa lo mismo en
# toda la app (gráficas, badges de "Base de Datos" y ahora el Excel).
_COLOR_TABLA_EXCEL = {
    "EFECTIVO": "2F9E44",
    "VISA / MASTERCARD": "1971C2",
    "AMERICAN EXPRESS": "0C8599",
    "FUNCIONARIOS Y EMPLEADOS": "4263EB",
    "HUÉSPED": "9C36B5",
    "TUSOSA": "E8590C",
    "CORTESÍA": "E64980",
}

_FILL_DIA_TABLA_GUARDADO_EXCEL = PatternFill(start_color="495057", end_color="495057", fill_type="solid")
_FONT_DIA_TABLA_GUARDADO_EXCEL = Font(bold=True, color="FFFFFF", size=12)
_FONT_TITULO_TABLA_GUARDADO_EXCEL = Font(bold=True, color="FFFFFF", size=11)
_FONT_NEGRITA_TABLA_GUARDADO = Font(bold=True)
_FILL_SUBTOTAL_TABLA_GUARDADO = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
_FILL_TOTAL_DIA_TABLA_GUARDADO_EXCEL = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
_FILL_TOTAL_GENERAL_TABLA_GUARDADO = PatternFill(start_color="BFBFBF", end_color="BFBFBF", fill_type="solid")


def _escribir_fila_montos_tabla_guardado_excel(
    ws, fila_idx: int, etiqueta_cuenta, montos: dict[str, float], fill: PatternFill, font: Font,
) -> None:
    """Escribe una fila de subtotal/total (etiqueta en la columna Cuenta, montos en las columnas numéricas)."""
    for col_idx, (clave, _etiqueta) in enumerate(_COLUMNAS_TABLA_GUARDADO_EXCEL, start=1):
        valor = etiqueta_cuenta if clave == "cuenta" else (round(montos.get(clave, 0.0), 2) if clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL else "")
        celda = ws.cell(row=fila_idx, column=col_idx, value=valor)
        celda.fill = fill
        celda.font = font
        if clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL:
            celda.number_format = _NUM_FORMAT
            celda.alignment = Alignment(horizontal="right")


def generar_reporte_tablas_forma_pago_guardado_excel(filas: list[dict]) -> bytes:
    """
    Exporta a Excel el detalle guardado de Tablas_Forma_Pago (una fila por
    cuenta, ya con "periodo"/"tabla_origen"/"categoria_pue_ppd" — mismo
    shape que _fila_tabla_forma_pago_a_dict en api/facturacion.py),
    filtrado por día o por mes desde el endpoint que llama a esta función.

    Una sola hoja, pero organizada igual que la pestaña "Base de Datos" de
    la web: por día, y dentro de cada día dividido en las 7 tablas
    (Efectivo, Visa/Mastercard, American Express, Funcionarios y Empleados,
    Huésped, TUSOSA, Cortesía, solo las que tengan datos ese día), cada una
    con su color (mismo criterio que la pestaña Análisis) y sus columnas
    agrupadas/coloreadas (Identificación/Montos/Tasa 0%/Cálculos, mismo
    criterio que TablaFormaPagoGuardada en el frontend) — subtotal por
    tabla, TOTAL DEL DÍA al cierre de cada día, y TOTAL GENERAL al final.
    """
    from openpyxl import Workbook

    from app.services.facturacion import TABLAS_FACTURACION

    orden_tablas = [titulo for titulo, _palabras_clave in TABLAS_FACTURACION]

    wb = Workbook()
    ws = wb.active
    ws.title = "Tablas_Forma_Pago"

    filas_por_dia: dict[str, list[dict]] = {}
    for fila in filas:
        filas_por_dia.setdefault(fila.get("periodo", ""), []).append(fila)

    fila_actual = 1
    totales_generales: dict[str, float] = {clave: 0.0 for clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL}

    for dia in sorted(filas_por_dia):
        filas_dia = filas_por_dia[dia]
        totales_dia: dict[str, float] = {clave: 0.0 for clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL}

        celda_dia = ws.cell(row=fila_actual, column=1, value=dia)
        ws.merge_cells(
            start_row=fila_actual, start_column=1, end_row=fila_actual, end_column=_ULTIMA_COLUMNA_TABLA_GUARDADO_EXCEL,
        )
        celda_dia.fill = _FILL_DIA_TABLA_GUARDADO_EXCEL
        celda_dia.font = _FONT_DIA_TABLA_GUARDADO_EXCEL
        celda_dia.alignment = Alignment(horizontal="left", vertical="center")
        fila_actual += 1

        filas_por_tabla: dict[str, list[dict]] = {}
        for fila in filas_dia:
            filas_por_tabla.setdefault(fila.get("tabla_origen", ""), []).append(fila)

        for tabla in orden_tablas:
            filas_tabla = filas_por_tabla.get(tabla)
            if not filas_tabla:
                continue

            color_tabla = _COLOR_TABLA_EXCEL.get(tabla, "868E96")
            celda_titulo = ws.cell(row=fila_actual, column=1, value=tabla)
            ws.merge_cells(
                start_row=fila_actual, start_column=1, end_row=fila_actual, end_column=_ULTIMA_COLUMNA_TABLA_GUARDADO_EXCEL,
            )
            celda_titulo.fill = PatternFill(start_color=color_tabla, end_color=color_tabla, fill_type="solid")
            celda_titulo.font = _FONT_TITULO_TABLA_GUARDADO_EXCEL
            fila_actual += 1

            for grupo_titulo, grupo_color, columnas_grupo in _GRUPOS_COLUMNAS_TABLA_GUARDADO_EXCEL:
                for clave, etiqueta in columnas_grupo:
                    col_idx = next(i for i, (c, _e) in enumerate(_COLUMNAS_TABLA_GUARDADO_EXCEL, start=1) if c == clave)
                    celda = ws.cell(row=fila_actual, column=col_idx, value=etiqueta)
                    celda.fill = PatternFill(start_color=grupo_color, end_color=grupo_color, fill_type="solid")
                    celda.font = _FONT_NEGRITA_TABLA_GUARDADO
                    celda.alignment = Alignment(horizontal="center")
            fila_actual += 1

            totales_tabla: dict[str, float] = {clave: 0.0 for clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL}
            for fila in filas_tabla:
                for col_idx, (clave, _etiqueta) in enumerate(_COLUMNAS_TABLA_GUARDADO_EXCEL, start=1):
                    valor = fila.get(clave)
                    celda = ws.cell(row=fila_actual, column=col_idx, value=valor)
                    celda.border = _THIN_BORDER
                    if clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL:
                        monto = float(valor or 0.0)
                        celda.number_format = _NUM_FORMAT
                        celda.alignment = Alignment(horizontal="right")
                        totales_tabla[clave] += monto
                        totales_dia[clave] += monto
                        totales_generales[clave] += monto
                fila_actual += 1

            _escribir_fila_montos_tabla_guardado_excel(
                ws, fila_actual, "TOTAL", totales_tabla, _FILL_SUBTOTAL_TABLA_GUARDADO, _FONT_NEGRITA_TABLA_GUARDADO,
            )
            fila_actual += 1

        _escribir_fila_montos_tabla_guardado_excel(
            ws, fila_actual, f"TOTAL DEL DÍA ({dia})", totales_dia, _FILL_TOTAL_DIA_TABLA_GUARDADO_EXCEL, _FONT_NEGRITA_TABLA_GUARDADO,
        )
        fila_actual += 2  # deja un renglón en blanco entre un día y el siguiente

    _escribir_fila_montos_tabla_guardado_excel(
        ws, fila_actual, "TOTAL GENERAL", totales_generales, _FILL_TOTAL_GENERAL_TABLA_GUARDADO, _FONT_NEGRITA_TABLA_GUARDADO,
    )

    for col_idx, (clave, _etiqueta) in enumerate(_COLUMNAS_TABLA_GUARDADO_EXCEL, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = _ANCHO_COLUMNA_TABLA_GUARDADO_EXCEL.get(clave, 14)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# Mismo agrupamiento que _GRUPOS_COLUMNAS_TABLA_GUARDADO_EXCEL, pero con
# "Fecha" agregada al grupo Identificación — aquí sí hace falta: las filas
# vienen de días distintos del mes (a diferencia del export por día/mes de
# arriba, donde el día ya es el encabezado de cada sección).
_GRUPOS_COLUMNAS_CATEGORIA_EXCEL: list[tuple[str, str, list[tuple[str, str]]]] = [
    ("Identificación", "E9ECEF", [
        ("periodo", "Fecha"), ("cuenta", "Cuenta"), ("pos", "POS"), ("forma_de_pago", "Forma de Pago"),
    ]),
    *_GRUPOS_COLUMNAS_TABLA_GUARDADO_EXCEL[1:],  # Montos, Tasa 0%, Cálculos — mismos que el export por día/mes
]
_COLUMNAS_CATEGORIA_EXCEL = [
    columna for _titulo, _color, columnas in _GRUPOS_COLUMNAS_CATEGORIA_EXCEL for columna in columnas
]
_ULTIMA_COLUMNA_CATEGORIA_EXCEL = len(_COLUMNAS_CATEGORIA_EXCEL)
_ANCHO_COLUMNA_CATEGORIA_EXCEL = {"periodo": 12, **_ANCHO_COLUMNA_TABLA_GUARDADO_EXCEL}


def generar_reporte_categoria_tabla_forma_pago_excel(tabla_origen: str, filas: list[dict]) -> bytes:
    """
    Exporta a Excel todas las cuentas de UNA categoría (tabla_origen) para
    un mes — desde la fila "Exportar" de cada categoría en "Resumen por
    categoría" (pestaña Análisis). Tabla plana (sin agrupar por día, a
    diferencia de generar_reporte_tablas_forma_pago_guardado_excel) porque
    ya viene filtrada a una sola categoría — sí incluye la columna Fecha,
    ya que las filas vienen de días distintos del mes. Fila de título con
    el color de la categoría (mismos 7 colores que ya usa la pestaña
    Análisis), encabezados agrupados por color, y una fila TOTAL al final
    con la suma de cada columna numérica.
    """
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Tablas_Forma_Pago"

    color_tabla = _COLOR_TABLA_EXCEL.get(tabla_origen, "868E96")
    celda_titulo = ws.cell(row=1, column=1, value=tabla_origen)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=_ULTIMA_COLUMNA_CATEGORIA_EXCEL)
    celda_titulo.fill = PatternFill(start_color=color_tabla, end_color=color_tabla, fill_type="solid")
    celda_titulo.font = _FONT_TITULO_TABLA_GUARDADO_EXCEL

    for _grupo_titulo, grupo_color, columnas_grupo in _GRUPOS_COLUMNAS_CATEGORIA_EXCEL:
        for clave, etiqueta in columnas_grupo:
            col_idx = next(i for i, (c, _e) in enumerate(_COLUMNAS_CATEGORIA_EXCEL, start=1) if c == clave)
            celda = ws.cell(row=2, column=col_idx, value=etiqueta)
            celda.fill = PatternFill(start_color=grupo_color, end_color=grupo_color, fill_type="solid")
            celda.font = _FONT_NEGRITA_TABLA_GUARDADO
            celda.alignment = Alignment(horizontal="center")

    filas_ordenadas = sorted(filas, key=lambda f: (f.get("periodo") or "", str(f.get("cuenta") or "")))

    totales: dict[str, float] = {clave: 0.0 for clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL}
    fila_actual = 3
    for fila in filas_ordenadas:
        for col_idx, (clave, _etiqueta) in enumerate(_COLUMNAS_CATEGORIA_EXCEL, start=1):
            valor = fila.get(clave)
            celda = ws.cell(row=fila_actual, column=col_idx, value=valor)
            celda.border = _THIN_BORDER
            if clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL:
                monto = float(valor or 0.0)
                celda.number_format = _NUM_FORMAT
                celda.alignment = Alignment(horizontal="right")
                totales[clave] += monto
        fila_actual += 1

    for col_idx, (clave, _etiqueta) in enumerate(_COLUMNAS_CATEGORIA_EXCEL, start=1):
        valor = "TOTAL" if col_idx == 1 else (round(totales[clave], 2) if clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL else "")
        celda = ws.cell(row=fila_actual, column=col_idx, value=valor)
        celda.fill = _FILL_TOTAL_GENERAL_TABLA_GUARDADO
        celda.font = _FONT_NEGRITA_TABLA_GUARDADO
        if clave in _COLUMNAS_NUMERICAS_TABLA_GUARDADO_EXCEL:
            celda.number_format = _NUM_FORMAT
            celda.alignment = Alignment(horizontal="right")

    for col_idx, (clave, _etiqueta) in enumerate(_COLUMNAS_CATEGORIA_EXCEL, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = _ANCHO_COLUMNA_CATEGORIA_EXCEL.get(clave, 14)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
