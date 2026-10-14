"""
Catálogo de Productos — Cafetería. Módulo independiente del catálogo del
restaurante (`services/catalogo_productos.py`): mismo formato de Excel de
origen, pero sin clasificación de categoría/sección de menú todavía (paso 1,
ver docstring de `models/catalogo_producto_cafeteria.py`). Los helpers
chicos se copian del módulo del restaurante en vez de importarse, mismo
criterio de independencia que ya usa el resto del sistema.

El Excel de origen no trae un encabezado confiable, así que se lee crudo
(`header=None`) y las columnas de interés se identifican por posición fija.
Los datos empiezan en la fila 6 de Excel (índice 5, 0-based). La columna de
punto de venta (B) y la de grupo (C) no vienen repetidas en cada fila: solo
se escriben cuando cambian, así que se propagan hacia abajo (forward-fill)
hasta encontrar un valor nuevo.
"""

from io import BytesIO

import pandas as pd

from app.services.cfdi_analysis import parse_float

COL_PUNTO_VENTA = 1   # B
COL_GRUPO = 2         # C
COL_NOMBRE_PRODUCTO = 6   # G
COL_TIPO = 10         # K
COL_COSTO = 14        # O
COL_PRECIO_VENTA = 16  # Q

FILA_INICIO_DATOS = 5  # índice 0-based == fila 6 de Excel


async def leer_excel_catalogo_cafeteria(file_content: bytes) -> pd.DataFrame:
    """
    Leer el Excel de catálogo de Cafetería crudo (sin encabezados), con
    fallback a xlrd para .xls. Se asume una sola hoja (la activa/primera).
    """
    import zipfile

    try:
        df = pd.read_excel(BytesIO(file_content), header=None)
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), header=None, engine="xlrd")
    return df


def _texto_celda(valor) -> str:
    if pd.isna(valor):
        return ""
    return str(valor).strip()


def _parse_monto_cafeteria(valor) -> float | None:
    """Como parse_float pero tolera celdas con formato de moneda ("$1,234.50")."""
    resultado = parse_float(valor)
    if resultado is not None:
        return resultado
    if isinstance(valor, str):
        resultado = parse_float(valor.strip().replace("$", "").replace(",", ""))
        if resultado is not None:
            return resultado
    return None


def parsear_catalogo_cafeteria(df: pd.DataFrame) -> list[dict]:
    """
    Recorre el DataFrame crudo desde la fila de inicio de datos y arma un
    registro por producto (columna G no vacía). `punto_venta` y `grupo` se
    propagan hacia abajo desde la última fila donde tuvieron un valor no
    vacío — cada valor nuevo abre un grupo/punto de venta nuevo, sin fila de
    cierre. Sin clasificación (ver docstring del módulo).
    """
    if df.shape[1] <= COL_PRECIO_VENTA:
        raise ValueError(
            "El archivo no tiene suficientes columnas para el catálogo de Cafetería "
            f"(se esperaba al menos hasta la columna {COL_PRECIO_VENTA + 1})."
        )

    registros: list[dict] = []
    punto_venta_actual = ""
    grupo_actual = ""

    for idx in range(FILA_INICIO_DATOS, len(df)):
        fila = df.iloc[idx]

        punto_venta_celda = _texto_celda(fila[COL_PUNTO_VENTA])
        if punto_venta_celda:
            punto_venta_actual = punto_venta_celda

        grupo_celda = _texto_celda(fila[COL_GRUPO])
        if grupo_celda:
            grupo_actual = grupo_celda

        nombre_producto = _texto_celda(fila[COL_NOMBRE_PRODUCTO])
        if not nombre_producto:
            continue

        tipo = _texto_celda(fila[COL_TIPO]) or None

        registros.append(
            {
                "punto_venta": punto_venta_actual,
                "grupo": grupo_actual,
                "nombre_producto": nombre_producto,
                "tipo": tipo,
                "costo": _parse_monto_cafeteria(fila[COL_COSTO]),
                "precio_venta": _parse_monto_cafeteria(fila[COL_PRECIO_VENTA]),
                "fila_excel": idx + 1,
            }
        )

    return registros
