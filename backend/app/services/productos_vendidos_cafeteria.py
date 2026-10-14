"""
Productos Vendidos — Cafetería. Copia de services/productos_vendidos.py
(Restaurante) — mismo layout de columnas confirmado contra el archivo real
"VENTAS DE CAFETERIA AGOSTO 2026.xls" (13 columnas, mismo patrón de bloques
y de filas "Subtotal <grupo>"/"Total <punto de venta>" con Costo/Venta
poblados). `heredar_clasificacion_catalogo` solo copia
`nombre_producto`/`grupo`/`costo_catalogo`/`precio_venta_catalogo` — el
Catálogo de Cafetería (CatalogoProductoCafeteria) no tiene
`categoria_tipo`/`seccion_menu`, así que no hay nada de eso que heredar.
"""

import re
import unicodedata
from io import BytesIO

import pandas as pd

from app.services.cfdi_analysis import parse_float

COL_PRODUCTO = 0        # A
COL_COSTO = 1           # B
COL_VENTA = 2           # C
COL_CANTIDAD = 3        # D
COL_TOT_COSTO = 4       # E
COL_DESCUENTO = 7       # H
COL_SUBTOTAL = 9        # J
COL_IMPUESTO = 10       # K
COL_TOTAL = 12          # M

COL_MINIMA_REQUERIDA = COL_TOTAL

PUNTO_VENTA_CAFETERIA = "Cafetería"


async def leer_excel_productos_vendidos_cafeteria(file_content: bytes) -> pd.DataFrame:
    """Leer el Excel de Productos Vendidos crudo (sin encabezados), con fallback a xlrd para .xls."""
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


def _parse_monto(valor) -> float | None:
    if pd.isna(valor):
        return None
    resultado = parse_float(valor)
    if resultado is not None:
        return resultado
    if isinstance(valor, str):
        resultado = parse_float(valor.strip().replace("$", "").replace(",", ""))
        if resultado is not None:
            return resultado
    return None


def _normalizar_tipo_texto(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return sin_acentos.upper().strip()


def _es_fila_totales(fila: pd.Series) -> bool:
    """Fila de "Subtotal <grupo>" o del gran total del reporte — sí traen Costo/Venta poblados, hay que excluirlas por texto."""
    texto = _texto_celda(fila[COL_PRODUCTO])
    if not texto:
        return False
    primera_palabra = _normalizar_tipo_texto(texto).split()[0] if texto.split() else ""
    return primera_palabra in ("SUBTOTAL", "TOTAL")


def _es_fila_producto(fila: pd.Series) -> bool:
    if _es_fila_totales(fila):
        return False
    return _parse_monto(fila[COL_COSTO]) is not None and _parse_monto(fila[COL_VENTA]) is not None


def _es_fila_grupo(fila: pd.Series) -> bool:
    nombre = _texto_celda(fila[COL_PRODUCTO])
    if not nombre:
        return False
    if _parse_monto(fila[COL_COSTO]) is not None or _parse_monto(fila[COL_VENTA]) is not None:
        return False
    if _parse_monto(fila[COL_TOT_COSTO]) is not None:
        return False
    return True


def parsear_productos_vendidos_cafeteria(df: pd.DataFrame) -> list[dict]:
    """Mismo bucle de estado que parsear_productos_vendidos (Restaurante) — ver ese módulo para el detalle."""
    if df.shape[1] <= COL_MINIMA_REQUERIDA:
        raise ValueError(
            "El archivo no tiene suficientes columnas para Productos Vendidos "
            f"(se esperaba al menos hasta la columna {COL_MINIMA_REQUERIDA + 1})."
        )

    registros: list[dict] = []
    grupo_actual = ""

    for idx in range(len(df)):
        fila = df.iloc[idx]

        if _es_fila_producto(fila):
            nombre_producto = _texto_celda(fila[COL_PRODUCTO])
            if not nombre_producto:
                continue
            registros.append(
                {
                    "punto_venta": PUNTO_VENTA_CAFETERIA,
                    "grupo": grupo_actual,
                    "nombre_producto": nombre_producto,
                    "costo": _parse_monto(fila[COL_COSTO]),
                    "precio_venta": _parse_monto(fila[COL_VENTA]),
                    "cantidad": _parse_monto(fila[COL_CANTIDAD]),
                    "total_costo": _parse_monto(fila[COL_TOT_COSTO]),
                    "descuento": _parse_monto(fila[COL_DESCUENTO]) or 0.0,
                    "subtotal": _parse_monto(fila[COL_SUBTOTAL]),
                    "impuesto": _parse_monto(fila[COL_IMPUESTO]),
                    "total": _parse_monto(fila[COL_TOTAL]),
                    "fila_excel": idx + 1,
                }
            )
            continue

        if _es_fila_grupo(fila):
            grupo_actual = _texto_celda(fila[COL_PRODUCTO])
            continue

        continue

    return registros


# ── Heredar clasificación del Catálogo de Productos por nombre ───────
# Copiado de services/productos_vendidos.py — ver ese módulo para el
# detalle de por qué "CON"/"SIN" no son relleno, por qué no se tolera
# ninguna palabra faltante, y por qué un nombre de 1 sola palabra no
# matchea por la ruta difusa (las 3 correcciones ya aprendidas ahí).
_PALABRAS_CONECTORAS = frozenset({"DE", "DEL", "LA", "EL", "LOS", "LAS", "Y"})


def _normalizar_nombre_producto(texto: str) -> frozenset:
    if not texto:
        return frozenset()
    sin_acentos = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode("ascii")
    palabras = re.findall(r"[A-Za-z0-9]+", sin_acentos.upper())
    return frozenset(palabras) - _PALABRAS_CONECTORAS


def _distancia_edicion(a: str, b: str, limite: int = 2) -> int:
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
                fila_anterior[j] + 1,
                fila_actual[j - 1] + 1,
                fila_anterior[j - 1] + costo,
            ))
        fila_anterior = fila_actual
    return fila_anterior[-1]


def _palabras_parecidas(a: str, b: str) -> bool:
    if a == b:
        return True
    longitud_min = min(len(a), len(b))
    if longitud_min < 3:
        return False
    limite = 2 if longitud_min >= 7 else 1
    return _distancia_edicion(a, b, limite) <= limite


def _nombres_coinciden(a: frozenset, b: frozenset) -> bool:
    if not a or not b:
        return False
    if len(a) < 2 or len(b) < 2:
        return False
    chico, grande = (a, b) if len(a) <= len(b) else (b, a)
    for palabra in chico:
        if any(_palabras_parecidas(palabra, otra) for otra in grande):
            continue
        return False
    return True


def heredar_clasificacion_catalogo_cafeteria(registros: list[dict], productos_catalogo: list) -> None:
    """
    Muta `registros` in-place: si el producto vendido corresponde a uno del
    Catálogo de Cafetería, sobrescribe `nombre_producto`/`grupo` con los del
    catálogo y agrega `costo_catalogo`/`precio_venta_catalogo`/
    `producto_catalogo_encontrado=True`. Sin `categoria_tipo`/`seccion_menu`
    porque el Catálogo de Cafetería no los tiene. Match por nombre solo
    (exacto, luego difuso) — mismo criterio que Restaurante.
    """
    for registro in registros:
        clave_registro = _normalizar_nombre_producto(registro["nombre_producto"])
        clave_exacta = " ".join(sorted(clave_registro))

        candidatos_nombre = [
            producto
            for producto in productos_catalogo
            if " ".join(sorted(_normalizar_nombre_producto(producto.nombre_producto))) == clave_exacta
        ]
        if not candidatos_nombre:
            candidatos_nombre = [
                producto
                for producto in productos_catalogo
                if _nombres_coinciden(clave_registro, _normalizar_nombre_producto(producto.nombre_producto))
            ]

        match = candidatos_nombre[0] if candidatos_nombre else None

        if match is not None:
            registro["nombre_producto"] = match.nombre_producto
            registro["grupo"] = match.grupo
            registro["costo_catalogo"] = match.costo
            registro["precio_venta_catalogo"] = match.precio_venta
            registro["producto_catalogo_encontrado"] = True
        else:
            registro["costo_catalogo"] = None
            registro["precio_venta_catalogo"] = None
            registro["producto_catalogo_encontrado"] = False
