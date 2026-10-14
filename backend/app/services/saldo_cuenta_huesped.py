"""
Saldo Cuenta Huésped — reporte RCP170 de Novohit ("Saldo en Cuenta Huésped")
reformateado al layout mensual "SALDO CUENTA HUESPED". Módulo independiente
(dentro de Pagos de Recepción). Puro y sin DB: el router guarda/lee filas.

El RCP170 trae, por habitación, una fila cabecera (Hab, código, huésped,
Ad/Ni, llegada, salida, tarifa, garantía, saldo) seguida de 1+ líneas de
cuenta (1ª: "Agencia" + "Principal"; siguientes: sub-cuentas con folio
`NOMBRE*1567*`) con su monto. Después de "Saldo de Habitaciones" viene la
sección "Varios" (folios sin garantía, el monto va en la propia cabecera).
Las columnas son estables en este reporte (fila de encabezado "Hab.").
GRAVADO/TASA 0/SUBTOTAL/IVA/PROPINA/IEPS/ISH no vienen en el reporte: los captura el usuario.
"""

import re
from datetime import datetime
from io import BytesIO

import pandas as pd
from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.properties import PageSetupProperties

# Índices de columna (base 0) del RCP170 tal como lo baja Novohit.
IVA_FACTOR = 0.16  # GRAVADO = IVA / 0.16 (criterio del Excel de LUIS)

_C_HAB, _C_GRUPO_AGENCIA, _C_IN, _C_HUESPED, _C_ADNI = 1, 7, 9, 11, 16
_C_LLEGADA, _C_LINEA, _C_SALIDA, _C_TARIFA = 20, 21, 23, 25
_C_GARANTIA, _C_MONTO_LINEA, _C_ETIQUETA_TOTAL, _C_SALDO_TOTALES, _C_SALDO_HAB = 32, 32, 26, 34, 37

def _texto(valor) -> str:
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return ""
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()


def _monto(valor) -> float:
    """Dinero del reporte: texto con comas ("6,780.40") o número."""
    if isinstance(valor, (int, float)) and not pd.isna(valor):
        return float(valor)
    texto = _texto(valor).replace(",", "").replace("$", "")
    try:
        return float(texto) if texto else 0.0
    except ValueError:
        return 0.0


def parsear_rcp170(contenido: bytes) -> dict:
    """
    Regresa `{"habitaciones": [...], "varios": [...], "saldo_habitaciones",
    "saldo_varios", "saldo_total"}`. Cada habitación/folio lleva `lineas`
    (vacía en Varios). Lanza ValueError si no parece un RCP170.
    """
    try:
        df = pd.read_excel(BytesIO(contenido), header=None)
    except Exception:
        df = pd.read_excel(BytesIO(contenido), header=None, engine="xlrd")

    def celda(fila, col):
        return fila[col] if col < len(fila) else None

    filas = df.values.tolist()
    if not any(_texto(celda(f, _C_HAB)) == "Hab." for f in filas):
        raise ValueError("El archivo no parece un RCP170 (no se encontró el encabezado 'Hab.').")

    habitaciones: list[dict] = []
    varios: list[dict] = []
    actual: dict | None = None
    resumen = {"saldo_habitaciones": 0.0, "saldo_varios": 0.0, "saldo_total": 0.0}

    for fila in filas:
        hab = _texto(celda(fila, _C_HAB))
        etiqueta = _texto(celda(fila, _C_ETIQUETA_TOTAL))

        if hab.startswith("#Habitaciones"):
            resumen["saldo_habitaciones"] = _monto(celda(fila, _C_SALDO_TOTALES))
            actual = None
            continue
        if hab.startswith("#Folios de Varios"):
            resumen["saldo_varios"] = _monto(celda(fila, _C_SALDO_TOTALES))
            actual = None
            continue
        if etiqueta == "Saldo Total":
            resumen["saldo_total"] = _monto(celda(fila, _C_SALDO_TOTALES))
            continue
        if hab == "Hab.":
            continue  # encabezado repetido por salto de página: las líneas de la habitación siguen

        if hab:  # cabecera de habitación / folio de Varios
            es_varios = _texto(celda(fila, _C_IN)) == "Varios"
            actual = {
                "habitacion": hab,
                "codigo": "" if es_varios else _texto(celda(fila, _C_IN)),
                "huesped": _texto(celda(fila, _C_HUESPED)),
                "adultos_ninos": _texto(celda(fila, _C_ADNI)),
                "llegada": _texto(celda(fila, _C_LLEGADA)),
                "salida": _texto(celda(fila, _C_SALIDA)),
                "tarifa": _monto(celda(fila, _C_TARIFA)),
                "garantia": _texto(celda(fila, _C_GARANTIA)),
                "saldo": _monto(celda(fila, _C_SALDO_HAB)),
                "tipo": "varios" if es_varios else "habitacion",
                "lineas": [],
            }
            (varios if es_varios else habitaciones).append(actual)
            continue

        if actual is not None and actual["tipo"] == "habitacion":
            nombre = _texto(celda(fila, _C_LINEA))
            if nombre:
                es_agencia = _texto(celda(fila, _C_GRUPO_AGENCIA)) == "Agencia"
                actual["lineas"].append(
                    {
                        "agencia": _texto(celda(fila, _C_HUESPED)) if es_agencia else "",
                        "linea": nombre,
                        "monto": _monto(celda(fila, _C_MONTO_LINEA)),
                    }
                )

    return {"habitaciones": habitaciones, "varios": varios, **resumen}


def filtrar_con_garantia(habitaciones: list[dict]) -> list[dict]:
    """Solo las habitaciones que reportan garantía (p. ej. CORPORATIVO)."""
    return [h for h in habitaciones if h["garantia"]]


def aplanar_lineas(habitaciones: list[dict], varios: list[dict]) -> list[dict]:
    """
    Una fila por unidad capturable: cada línea de cuenta con monto ≠ 0 de las
    habitaciones con garantía y cada folio de Varios, incluso en 0 (su monto es
    el saldo de la cabecera).
    """
    filas: list[dict] = []
    orden = 0
    campos = ("habitacion", "codigo", "huesped", "adultos_ninos", "llegada", "salida", "tarifa", "garantia", "tipo")

    def base(h: dict) -> dict:
        return {k: h[k] for k in campos} | {"saldo_habitacion": h["saldo"]}

    for h in filtrar_con_garantia(habitaciones):
        # Las líneas en 0 no se necesitan: se omiten (la 1ª que sobrevive abre el grupo de la habitación).
        for i, linea in enumerate(l for l in h["lineas"] if l["monto"] != 0):
            orden += 1
            filas.append(
                base(h)
                | {
                    "orden": orden,
                    "es_primera_linea": i == 0,
                    "agencia": linea["agencia"],
                    "linea_nombre": linea["linea"],
                    "monto": linea["monto"],
                }
            )
    for h in varios:  # Varios siempre se conserva, aunque valga 0
        orden += 1
        filas.append(
            base(h)
            | {"orden": orden, "es_primera_linea": True, "agencia": "", "linea_nombre": "", "monto": h["saldo"]}
        )
    return filas


def calcular_desglose(
    monto: float,
    subtotal: float = 0.0,
    iva: float = 0.0,
    propina: float = 0.0,
    ieps: float = 0.0,
    ish: float = 0.0,
) -> dict:
    """
    Capturas: SUBTOTAL, IVA, PROPINA, IEPS, ISH. Derivadas (criterio del Excel
    de LUIS): GRAVADO = IVA/0.16 y TASA 0 = SUBTOTAL − GRAVADO. TOTAL2 =
    SUBTOTAL + IVA + PROPINA + IEPS + ISH y DIF = TOTAL − TOTAL2, que vale 0
    mientras no haya ninguna captura (no hay contra qué comparar).
    """
    gravado = iva / IVA_FACTOR
    tasa0 = subtotal - gravado
    total2 = subtotal + iva + propina + ieps + ish
    hay_captura = any((subtotal, iva, propina, ieps, ish))
    return {
        "total": monto,
        "gravado": gravado,
        "tasa0": tasa0,
        "subtotal": subtotal,
        "iva": iva,
        "propina": propina,
        "ieps": ieps,
        "ish": ish,
        "total2": total2,
        "dif": monto - total2 if hay_captura else 0.0,
    }


def _hoja_editada(contenido: bytes):
    """
    Busca la hoja del Excel de este módulo en todo el libro y el renglón de
    encabezados (Hab. en A, SUBTOTAL en O) dentro de las primeras 15 filas,
    por si Excel corrió el encabezado. Regresa (ws, fila_encabezado) o None.
    """
    libro = load_workbook(BytesIO(contenido), data_only=True)
    for ws in libro.worksheets:
        for fila in range(1, min(ws.max_row, 15) + 1):
            if ws.cell(row=fila, column=1).value == "Hab." and ws.cell(row=fila, column=15).value == "SUBTOTAL":
                return ws, fila
    return None


def es_excel_editado(contenido: bytes) -> bool:
    """El Excel que genera este módulo: encabezados "Hab." (A3) y "SUBTOTAL" (O3)."""
    try:
        return _hoja_editada(contenido) is not None
    except Exception:
        return False


def _celda_texto(valor) -> str:
    if valor is None:
        return ""
    if isinstance(valor, datetime):
        return valor.strftime("%d/%m/%Y")
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()


def leer_excel_editado(contenido: bytes) -> dict:
    """
    Lee el Excel de este módulo ya editado (hoja con encabezados en la fila 3,
    datos desde la 4). Una fila con Hab. abre habitación/folio; una fila sin
    Hab. es sub-cuenta de la anterior. Usa L=monto y O:S=capturas; ignora
    GRAVADO/TASA 0 (se derivan), TOTAL, DIF y las filas de totales/notas.
    Regresa `{"periodo_archivo": "YYYY-MM" | None, "filas": [...]}` con las
    mismas claves que `aplanar_lineas` más las capturas.
    """
    encontrado = _hoja_editada(contenido)
    if encontrado is None:
        raise ValueError("No se encontró la hoja del Excel de Saldo Cuenta Huésped.")
    ws, fila_encabezado = encontrado
    coincidencia = re.search(r"(\d{4}-\d{2})", _celda_texto(ws["A1"].value))
    periodo_archivo = coincidencia.group(1) if coincidencia else None

    def num(r, c) -> float:
        valor = ws.cell(row=r, column=c).value
        return float(valor) if isinstance(valor, (int, float)) else _monto(valor)

    filas: list[dict] = []
    habitacion: dict | None = None
    for r in range(fila_encabezado + 1, ws.max_row + 1):
        if _celda_texto(ws.cell(row=r, column=11).value).upper() == "SALDO TOTAL":
            break
        hab = _celda_texto(ws.cell(row=r, column=1).value)
        cuenta = _celda_texto(ws.cell(row=r, column=11).value)
        if not hab and not cuenta and ws.cell(row=r, column=12).value is None:
            continue
        if hab:
            es_varios = _celda_texto(ws.cell(row=r, column=2).value) == "Varios"
            habitacion = {
                "habitacion": hab,
                "codigo": "" if es_varios else _celda_texto(ws.cell(row=r, column=2).value),
                "huesped": _celda_texto(ws.cell(row=r, column=3).value),
                "adultos_ninos": _celda_texto(ws.cell(row=r, column=4).value),
                "llegada": _celda_texto(ws.cell(row=r, column=5).value),
                "salida": _celda_texto(ws.cell(row=r, column=6).value),
                "tarifa": num(r, 7),
                "garantia": _celda_texto(ws.cell(row=r, column=8).value),
                "saldo_habitacion": num(r, 9),
                "tipo": "varios" if es_varios else "habitacion",
                "agencia": _celda_texto(ws.cell(row=r, column=10).value),
            }
        elif habitacion is None:
            continue
        linea = habitacion if hab else {**habitacion, "agencia": ""}
        filas.append(
            {
                **{k: linea[k] for k in (
                    "habitacion", "codigo", "huesped", "adultos_ninos", "llegada", "salida",
                    "tarifa", "garantia", "saldo_habitacion", "tipo", "agencia",
                )},
                "orden": len(filas) + 1,
                "es_primera_linea": bool(hab),
                "linea_nombre": cuenta,
                "monto": num(r, 12),
                "subtotal": num(r, 15),
                "iva": num(r, 16),
                "propina": num(r, 17),
                "ieps": num(r, 18),
                "ish": num(r, 19),
            }
        )
    return {"periodo_archivo": periodo_archivo, "filas": filas}


_COLUMNAS = [
    "Hab.", "In", "Huésped", "Ad/Ni", "Llegada", "Salida", "Tarifa", "Garantía", "Saldo",
    "Agencia", "Cuenta",
    "TOTAL", "GRAVADO", "TASA 0", "SUBTOTAL", "IVA", "PROPINA", "IEPS", "ISH", "TOTAL", "DIF",
]
_ANCHOS = [7, 9, 30, 7, 11, 11, 8, 14, 12, 30, 26] + [14] * 10
_ULTIMA_COL = len(_COLUMNAS)  # U

_TEAL = "0F766E"
_TEAL_CLARO = "CCFBF1"
_GRIS = "E5E7EB"
_AMARILLO = "FEF3C7"
_AMARILLO_FUERTE = "FDE68A"
_BANDA = "F0FDFA"  # bandas alternas por habitación
_LILA = "EDE9FE"  # folios de Varios
_MONEDA = '$#,##0.00;-$#,##0.00;"-"'


def _relleno(color: str) -> PatternFill:
    return PatternFill(start_color=color, end_color=color, fill_type="solid")


_BORDE = Border(*(Side(style="thin", color="D1D5DB") for _ in range(4)))
_BORDE_TOTAL = Border(top=Side(style="double", color=_TEAL), bottom=Side(style="thin", color=_TEAL))


def generar_excel_saldo_cuenta_huesped(filas: list[dict], periodo: str) -> bytes:
    """
    Excel de trabajo: datos del RCP170 + TOTAL/GRAVADO/TASA 0/SUBTOTAL/IVA/
    PROPINA/IEPS/ISH/TOTAL/DIF. GRAVADO..ISH (M:S) son celdas de captura
    (amarillas, con validación ≥ 0); el 2º TOTAL y DIF son fórmulas vivas.
    Columnas: L=TOTAL (monto), M=GRAVADO (=P/0.16), N=TASA 0 (=O−M), O=SUBTOTAL, P=IVA,
    Q=PROPINA, R=IEPS, S=ISH, T=TOTAL (suma capturada), U=DIF (0 mientras no
    haya captura). Fila 1 banner, 2 bandas de sección, 3 encabezados, datos
    desde la 4; autofiltro, colores por habitación y DIF
    verde/naranja por formato condicional.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Saldo Cuenta Huesped"
    ws.sheet_properties.tabColor = _TEAL
    ws.sheet_view.showGridLines = False

    # Fila 1: banner
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=_ULTIMA_COL)
    banner = ws.cell(row=1, column=1, value=f"TORRES MAZATLÁN — Saldo en Cuenta Huésped · {periodo}")
    banner.font = Font(bold=True, size=15, color="FFFFFF")
    banner.fill = _relleno(_TEAL)
    banner.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 30

    # Fila 2: bandas de sección
    bandas = [
        (1, 11, "REPORTE RCP170", _GRIS, "374151"),
        (12, 12, "MONTO", _GRIS, "374151"),
        (13, 14, "CALCULADO", _GRIS, "374151"),
        (15, 19, "CAPTURA MANUAL", _AMARILLO_FUERTE, "78350F"),
        (20, 21, "CONTROL", _GRIS, "374151"),
    ]
    for ini, fin, texto, fondo, tinta in bandas:
        if fin > ini:
            ws.merge_cells(start_row=2, start_column=ini, end_row=2, end_column=fin)
        for col in range(ini, fin + 1):
            ws.cell(row=2, column=col).fill = _relleno(fondo)
        c = ws.cell(row=2, column=ini, value=texto)
        c.font = Font(bold=True, size=9, color=tinta)
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 18

    # Fila 3: encabezados
    for i, nombre in enumerate(_COLUMNAS, start=1):
        c = ws.cell(row=3, column=i, value=nombre)
        captura = 15 <= i <= 19
        c.font = Font(bold=True, color="78350F" if captura else "FFFFFF")
        c.fill = _relleno(_AMARILLO if captura else _TEAL)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = _BORDE
    ws.row_dimensions[3].height = 24

    # Cuerpo
    primera = 4
    fila_xl = primera
    grupo = -1
    for f in filas:
        d = fila_xl
        p = f["es_primera_linea"]
        if p:
            grupo += 1
        fondo = _LILA if f["tipo"] == "varios" else (_BANDA if grupo % 2 == 0 else "FFFFFF")
        ws.append(
            [
                f["habitacion"] if p else None,
                (f["codigo"] or ("Varios" if f["tipo"] == "varios" else "")) if p else None,
                f["huesped"] if p else None,
                f["adultos_ninos"] if p else None,
                f["llegada"] if p else None,
                f["salida"] if p else None,
                f["tarifa"] if p else None,
                f["garantia"] if p else None,
                f["saldo_habitacion"] if p else None,
                f["agencia"] or None,
                f["linea_nombre"] or None,
                f["monto"],
                f"=P{d}/{IVA_FACTOR}",
                f"=O{d}-M{d}",
                f["subtotal"],
                f["iva"],
                f["propina"],
                f["ieps"],
                f["ish"],
                f"=O{d}+P{d}+Q{d}+R{d}+S{d}",
                f"=IF(SUM(M{d}:S{d})=0,0,L{d}-T{d})",
            ]
        )
        for col in range(1, _ULTIMA_COL + 1):
            c = ws.cell(row=d, column=col)
            c.border = _BORDE
            c.font = Font(size=10, bold=(col in (1, 12)))
            c.fill = _relleno(_AMARILLO if 15 <= col <= 19 else fondo)
            if col >= 12:
                c.number_format = _MONEDA
                c.alignment = Alignment(horizontal="right")
            elif col in (5, 6, 7, 9):
                c.alignment = Alignment(horizontal="center" if col in (5, 6) else "right")
        if p and f["tipo"] != "varios":
            ws.cell(row=d, column=7).number_format = _MONEDA
            ws.cell(row=d, column=9).number_format = _MONEDA
        fila_xl += 1

    ultima = fila_xl - 1

    # Fila de totales
    ws.cell(row=fila_xl, column=11, value="SALDO TOTAL").alignment = Alignment(horizontal="right")
    for col in range(1, _ULTIMA_COL + 1):
        c = ws.cell(row=fila_xl, column=col)
        c.fill = _relleno(_TEAL_CLARO)
        c.border = _BORDE_TOTAL
        c.font = Font(bold=True, color=_TEAL)
        if col >= 12:
            letra = get_column_letter(col)
            c.value = f"=SUM({letra}{primera}:{letra}{ultima})" if ultima >= primera else 0
            c.number_format = _MONEDA
            c.alignment = Alignment(horizontal="right")
    ws.row_dimensions[fila_xl].height = 22

    # Comodidad de trabajo
    for i, ancho in enumerate(_ANCHOS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = ancho
    if ultima >= primera:
        ws.auto_filter.ref = f"A3:{get_column_letter(_ULTIMA_COL)}{ultima}"
        validacion = DataValidation(
            type="decimal",
            operator="greaterThanOrEqual",
            formula1="0",
            allow_blank=True,
            showErrorMessage=True,
            errorTitle="Monto inválido",
            error="Captura un número mayor o igual a 0.",
        )
        ws.add_data_validation(validacion)
        validacion.add(f"O{primera}:S{ultima}")
        rango_dif = f"U{primera}:U{ultima}"
        ws.conditional_formatting.add(
            rango_dif,
            CellIsRule(operator="equal", formula=["0"], fill=_relleno("DCFCE7"), font=Font(color="166534")),
        )
        ws.conditional_formatting.add(
            rango_dif,
            CellIsRule(operator="notEqual", formula=["0"], fill=_relleno("FFEDD5"), font=Font(bold=True, color="C2410C")),
        )

    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.print_title_rows = "1:3"

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
