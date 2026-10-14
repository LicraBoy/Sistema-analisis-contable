"""
Catálogo de Productos — La Carreta de Mariscos. Módulo independiente del
catálogo del restaurante y de Cafetería: mismo formato de Excel de origen.
Clasifica `categoria_tipo` (Alimentos/Bebidas/Otros) igual que el
restaurante — el clasificador se copia de
`services/catalogo_productos.py` en vez de importarse, mismo criterio de
independencia que ya usa el resto del sistema.

El Excel de origen no trae un encabezado confiable, así que se lee crudo
(`header=None`) y las columnas de interés se identifican por posición fija.
Los datos empiezan en la fila 6 de Excel (índice 5, 0-based). La columna de
punto de venta (B) y la de grupo (C) no vienen repetidas en cada fila: solo
se escriben cuando cambian, así que se propagan hacia abajo (forward-fill)
hasta encontrar un valor nuevo.
"""

import unicodedata
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


async def leer_excel_catalogo_carreta_mariscos(file_content: bytes) -> pd.DataFrame:
    """
    Leer el Excel de catálogo de La Carreta de Mariscos crudo (sin
    encabezados), con fallback a xlrd para .xls. Se asume una sola hoja (la
    activa/primera).
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


def _parse_monto_carreta_mariscos(valor) -> float | None:
    """Como parse_float pero tolera celdas con formato de moneda ("$1,234.50")."""
    resultado = parse_float(valor)
    if resultado is not None:
        return resultado
    if isinstance(valor, str):
        resultado = parse_float(valor.strip().replace("$", "").replace(",", ""))
        if resultado is not None:
            return resultado
    return None


def _distancia_edicion(a: str, b: str, limite: int = 2) -> int:
    """
    Distancia de Levenshtein clásica (sin librerías nuevas). `limite` acota
    el atajo de longitud: si la diferencia de largo ya supera `limite`, la
    distancia real solo puede ser igual o mayor, así que no hace falta la DP
    completa para saber que no va a calificar. Copiada de
    `services/catalogo_productos.py` en vez de importada (independencia de
    módulos).
    """
    if a == b:
        return 0
    len_a, len_b = len(a), len(b)
    if abs(len_a - len_b) > limite:
        return abs(len_a - len_b)
    fila_anterior = list(range(len_b + 1))
    for i, ca in enumerate(a, start=1):
        fila_actual = [i]
        for j, cb in enumerate(b, start=1):
            costo = 0 if ca == cb else 1
            fila_actual.append(min(
                fila_anterior[j] + 1,          # borrar
                fila_actual[j - 1] + 1,        # insertar
                fila_anterior[j - 1] + costo,  # sustituir
            ))
        fila_anterior = fila_actual
    return fila_anterior[-1]


def _normalizar_tipo(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return sin_acentos.upper()


def clasificar_tipo_producto(tipo: str | None) -> str:
    """
    Clasifica la columna K (tipo) en Alimentos/Bebidas/Otros, tolerando
    errores de captura (ej. "8ebidas" en vez de "Bebidas"): primero por
    substring sobre el texto normalizado (mayúsculas, sin acentos), y si
    no calza, por distancia de edición <=1 contra "ALIMENTO(S)"/
    "BEBIDA(S)" palabra por palabra. Copiada de
    `services/catalogo_productos.py` (mismo criterio de independencia).
    """
    if not tipo or not tipo.strip():
        return "Otros"
    normalizado = _normalizar_tipo(tipo.strip())

    if "ALIMENTO" in normalizado:
        return "Alimentos"
    if "BEBIDA" in normalizado:
        return "Bebidas"

    for palabra in normalizado.split():
        if _distancia_edicion(palabra, "ALIMENTOS", limite=1) <= 1 or _distancia_edicion(palabra, "ALIMENTO", limite=1) <= 1:
            return "Alimentos"
        if _distancia_edicion(palabra, "BEBIDAS", limite=1) <= 1 or _distancia_edicion(palabra, "BEBIDA", limite=1) <= 1:
            return "Bebidas"

    return "Otros"


def _normalizar_grupo(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return " ".join(sin_acentos.upper().split())


# Excepción a nivel de grupo: "OTROS ING" (ingredientes/insumos varios) trae
# `tipo` de Excel que el clasificador normal metería en Alimentos, pero el
# usuario pidió que ese grupo completo vaya siempre a Otros, sin importar el
# tipo de cada producto — se revisa antes que clasificar_tipo_producto.
GRUPOS_OTROS_FORZADOS = {
    "OTROS ING",
}


def parsear_catalogo_carreta_mariscos(df: pd.DataFrame) -> list[dict]:
    """
    Recorre el DataFrame crudo desde la fila de inicio de datos y arma un
    registro por producto (columna G no vacía). `punto_venta` y `grupo` se
    propagan hacia abajo desde la última fila donde tuvieron un valor no
    vacío — cada valor nuevo abre un grupo/punto de venta nuevo, sin fila de
    cierre.
    """
    if df.shape[1] <= COL_PRECIO_VENTA:
        raise ValueError(
            "El archivo no tiene suficientes columnas para el catálogo de La Carreta de Mariscos "
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
        categoria_tipo = (
            "Otros" if _normalizar_grupo(grupo_actual) in GRUPOS_OTROS_FORZADOS else clasificar_tipo_producto(tipo)
        )

        registros.append(
            {
                "punto_venta": punto_venta_actual,
                "grupo": grupo_actual,
                "nombre_producto": nombre_producto,
                "tipo": tipo,
                "categoria_tipo": categoria_tipo,
                "costo": _parse_monto_carreta_mariscos(fila[COL_COSTO]),
                "precio_venta": _parse_monto_carreta_mariscos(fila[COL_PRECIO_VENTA]),
                "fila_excel": idx + 1,
            }
        )

    return registros
