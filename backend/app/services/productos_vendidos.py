"""
Productos Vendidos — Fase 2 del módulo Catálogo de Productos: sube el
reporte mensual de ventas por producto del POS (Restaurante), lo limpia y
hereda la clasificación (`categoria_tipo`/`seccion_menu`) ya definida en el
Catálogo de Productos, por nombre de producto.

El Excel de origen no trae un encabezado confiable ni una tabla plana: viene
con filas de metadata al inicio (empresa, filtros, fecha de exportación) y
luego bloques por grupo — una fila con solo el nombre del grupo (sin costo
ni venta), seguida de sus filas de producto, cerradas por una fila de
subtotal del grupo (tampoco con costo/venta unitarios). Se lee crudo
(`header=None`) y se identifica cada tipo de fila por su forma, no por
posición de fila fija, porque el número de filas de metadata/grupos varía de
un archivo a otro (a diferencia del Catálogo de Productos, donde los datos
siempre arrancan en la fila 6).

Nota: las posiciones de columna abajo están tomadas de un archivo de
muestra pegado como texto (no el .xlsx real) — si al probar con el archivo
real las columnas H/J/M no caen donde se espera, solo hay que ajustar estas
constantes.
"""

import unicodedata
from io import BytesIO

import pandas as pd

from app.services.cfdi_analysis import parse_float
from app.services.matching_productos import clasificar_producto_contra_catalogo

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


async def leer_excel_productos_vendidos(file_content: bytes) -> pd.DataFrame:
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
    """
    Como parse_float pero tolera celdas con formato de moneda ("$1,234.50")
    y trata una celda vacía de Excel (NaN, un float) como ausente — a
    diferencia de `None`, `parse_float(nan)` regresa `nan` tal cual (nan es
    instancia de `float`), y `nan is not None` es `True`, así que sin este
    chequeo una celda en blanco se contaba como "sí tiene valor" y rompía
    toda la detección de fila (producto/grupo/subtotal) basada en "¿esta
    columna está vacía?".
    """
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


def _es_fila_totales(fila: pd.Series) -> bool:
    """
    Fila de "Subtotal <grupo>" (una por cada grupo) o del gran total del
    reporte ("Total <punto de venta>") — confirmado contra un archivo real
    que estas filas SÍ traen valores en Costo/Venta (los acumulados del
    grupo/reporte, no un costo/precio unitario), así que no se puede confiar
    solo en que esas columnas estén vacías para descartarlas como en
    `_es_fila_grupo`; hay que revisar el texto explícitamente. Se compara
    por prefijo de la PRIMERA palabra (no un simple `.startswith` sobre el
    texto crudo, para tolerar mayúsculas/acentos) porque el texto real es
    "Subtotal BEBIDAS COCINA"/"Total RESTAURANT LA PALAPA", con el nombre
    del grupo/punto de venta pegado después.
    """
    texto = _texto_celda(fila[COL_PRODUCTO])
    if not texto:
        return False
    primera_palabra = _normalizar_tipo_texto(texto).split()[0] if texto.split() else ""
    return primera_palabra in ("SUBTOTAL", "TOTAL")


def _normalizar_tipo_texto(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return sin_acentos.upper().strip()


def _es_fila_producto(fila: pd.Series) -> bool:
    """
    Una fila es de producto solo si Costo (B) Y Venta (C) son ambos
    numéricos Y no es una fila de "Subtotal"/"Total" (ver
    `_es_fila_totales`) — un título de grupo no trae Costo/Venta, pero un
    subtotal de grupo o el gran total del reporte sí, así que la sola
    presencia de números en esas columnas no basta para distinguir un
    producto real.
    """
    if _es_fila_totales(fila):
        return False
    return _parse_monto(fila[COL_COSTO]) is not None and _parse_monto(fila[COL_VENTA]) is not None


def _es_fila_grupo(fila: pd.Series) -> bool:
    """Fila candidata a título de grupo: solo texto en Producto, nada en Costo/Venta/Tot.Costo."""
    nombre = _texto_celda(fila[COL_PRODUCTO])
    if not nombre:
        return False
    if _parse_monto(fila[COL_COSTO]) is not None or _parse_monto(fila[COL_VENTA]) is not None:
        return False
    if _parse_monto(fila[COL_TOT_COSTO]) is not None:
        return False
    return True


# Este servicio/router solo cubre Restaurante por ahora (ver docstring del
# modelo ProductoVendidoDetalle) — el nombre real del punto de venta que
# trae el archivo (ej. "RESTAURANT LA PALAPA") aparece en una fila-marcador
# que no está en la columna A junto con los grupos/productos, sino
# desplazada hacia las columnas de totales (visto en el archivo de
# muestra), así que detectarlo de forma confiable ahí no vale la pena
# todavía: se deja fijo hasta que se necesite otro punto de venta.
PUNTO_VENTA_RESTAURANTE = "Restaurante"


def parsear_productos_vendidos(df: pd.DataFrame) -> list[dict]:
    """
    Recorre el DataFrame crudo buscando bloques por grupo: una fila de solo
    texto (sin Costo/Venta/Tot.Costo) abre un grupo nuevo y se mantiene
    vigente hasta la siguiente fila-de-solo-texto de ese tipo; las filas de
    subtotal (tampoco tienen Costo/Venta) se saltan sin cerrar el grupo
    explícitamente — el siguiente título de grupo real lo reemplaza. Las
    filas de metadata antes del primer grupo real (empresa, título del
    reporte, fecha) también matchean esta regla y se toman como "grupo"
    temporalmente, pero eso no importa: se pisan unas a otras hasta llegar
    al primer grupo real, que es el que queda vigente cuando aparece el
    primer producto.
    """
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
                    "punto_venta": PUNTO_VENTA_RESTAURANTE,
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

        # Cualquier otra fila (metadata inicial antes de fijar ningún grupo,
        # encabezados, fila de subtotal de grupo, filas vacías) se ignora.
        continue

    return registros


# ── Heredar clasificación del Catálogo de Productos por nombre ───────
# El fuzzy-match en sí (normalizar_nombre_producto/nombres_coinciden) vive en
# services/matching_productos.py, compartido con Comandas Emitidas — ver ese
# módulo para el detalle de la regla de negocio (por qué "CON"/"SIN" sí
# importan aquí, por qué no se tolera ninguna palabra faltante, etc.).


def heredar_clasificacion_catalogo(registros: list[dict], productos_catalogo: list) -> None:
    """
    Muta `registros` in-place: si el producto vendido corresponde a uno del
    catálogo, sobrescribe `nombre_producto`/`grupo` con los del catálogo
    (el resto de los campos del registro, incluidos `costo`/`precio_venta`,
    sigue viniendo del Excel de ventas) y agrega `categoria_tipo`/
    `seccion_menu`/`producto_catalogo_encontrado=True`. Si no hay match,
    deja `nombre_producto`/`grupo` tal como venían del Excel y
    `producto_catalogo_encontrado=False`, para que la UI lo marque como
    pendiente de revisar en el catálogo, no como un error que detenga la
    carga.

    El match usa **solo el nombre** (exacto primero, luego difuso vía
    `nombres_coinciden`) — se probó comparar también Costo como
    confirmación (ver historial de este archivo) pero el Costo del reporte
    de ventas resultó ser un costo real/promedio del mes, no el costo
    estándar de receta del catálogo: en datos reales llegó a diferir hasta
    $32 en productos que sí eran el mismo (ej. mermas, variación de
    ingredientes), así que exigirlo rechazaba de más. El nombre por sí solo,
    en cambio, sí resultó suficiente: de 246 productos "sin clasificar"
    revisados a mano, 242 tenían el nombre exacto en el catálogo.
    """
    for registro in registros:
        clasificacion = clasificar_producto_contra_catalogo(registro["nombre_producto"], productos_catalogo)
        registro.update(clasificacion)
