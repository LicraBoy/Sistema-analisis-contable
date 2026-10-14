"""
Comandas Emitidas — Fase 1 de "Inteligencia de Negocio" dentro de Catálogo
de Productos (Restaurante): sube el reporte de productos ordenados por
cuenta, que sí trae `Fecha`/`Hora` reales por fila (a diferencia de
Productos Vendidos, mensual y sin fecha).

El archivo trae encabezado real (`Producto, Mesa, Fecha, Hora, Cuenta,
Cantidad, Estatus`) pero NO es una tabla plana debajo de él: cada bloque
abre con una fila-marcador "Comanda <folio>" (solo texto en la columna
Producto, todo lo demás vacío) seguida de 1+ filas de producto de esa
comanda; también puede traer una fila de título del punto de venta al
inicio ("RESTAURANT LA PALAPA"), igual de vacía en el resto de columnas.
Confirmado contra archivo real: la forma más simple y robusta de distinguir
una fila de producto real de cualquier otra cosa es que `Fecha` venga
llena — tanto la fila de título como las de "Comanda <folio>" la traen
vacía, así que basta con filtrar por eso, sin necesidad de reconocer el
texto "Comanda" explícitamente.
"""

import zipfile
from datetime import date, datetime, time
from io import BytesIO

import pandas as pd

from app.services.excel_headers import mapear_encabezados
from app.services.matching_productos import clasificar_producto_contra_catalogo
from app.services.turnos import clasificar_turno_por_hora

COLUMNAS_ESPERADAS = ["Producto", "Mesa", "Fecha", "Hora", "Cuenta", "Cantidad", "Estatus"]


async def leer_excel_comandas(file_content: bytes) -> pd.DataFrame:
    """Lee el Excel crudo (sin asumir encabezado en una fila fija), con fallback a xlrd para .xls."""
    try:
        df = pd.read_excel(BytesIO(file_content), header=None)
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), header=None, engine="xlrd")
    return df


def _texto_celda(valor) -> str | None:
    if pd.isna(valor):
        return None
    texto = str(valor).strip()
    return texto or None


def _parse_fecha(valor) -> date | None:
    """Tolera un `date`/`datetime` ya parseado por pandas o el texto "DD/MM/AAAA" visto en archivos reales."""
    if pd.isna(valor):
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    texto = str(valor).strip()
    for formato in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    return None


def _parse_hora(valor) -> time | None:
    """Tolera un `time`/`datetime` ya parseado por pandas, o texto "HH:MM[:SS]" (con o sin segundos)."""
    if pd.isna(valor):
        return None
    if isinstance(valor, datetime):
        return valor.time()
    if isinstance(valor, time):
        return valor
    texto = str(valor).strip()
    for formato in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(texto, formato).time()
        except ValueError:
            continue
    return None


def _parse_cuenta(valor) -> str | None:
    """
    Normaliza un valor de Cuenta a texto, evitando el ".0" que deja pandas
    en una columna numérica con huecos (float64 por los NaN de las filas de
    "Comanda <folio>") — mismo problema y misma solución que
    `_normalizar_clave_recibo` ya usa en `services/facturacion.py`.
    """
    if pd.isna(valor):
        return None
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip() or None


def _parse_cantidad(valor) -> float:
    if pd.isna(valor):
        return 0.0
    try:
        return float(valor)
    except (TypeError, ValueError):
        return 0.0


def parsear_comandas_emitidas(df: pd.DataFrame) -> list[dict]:
    """
    Recorre el DataFrame crudo, ubica las 7 columnas por nombre de
    encabezado (tolerante a acentos/mayúsculas), y regresa una fila por
    producto ordenado (`Fecha` llena) — la fila de título del punto de
    venta y las filas-marcador "Comanda <folio>" (`Fecha` vacía) se
    descartan. `turno` se calcula desde `Hora` con
    `clasificar_turno_por_hora` (el archivo no trae su propio turno).
    """
    if df.empty:
        raise ValueError("El archivo de Comandas Emitidas está vacío.")

    columnas = mapear_encabezados(df.iloc[0], COLUMNAS_ESPERADAS)
    faltantes = [nombre for nombre in COLUMNAS_ESPERADAS if nombre not in columnas]
    if faltantes:
        raise ValueError(
            "El archivo de Comandas Emitidas no tiene las columnas esperadas: " + ", ".join(faltantes)
        )

    registros: list[dict] = []
    for idx in range(1, len(df)):
        fila = df.iloc[idx]
        fecha = _parse_fecha(fila[columnas["Fecha"]])
        if fecha is None:
            continue  # fila de título del POS o marcador "Comanda <folio>", no un producto

        hora = _parse_hora(fila[columnas["Hora"]])
        if hora is None:
            continue  # sin hora no se puede clasificar turno; se descarta en vez de adivinar

        producto = _texto_celda(fila[columnas["Producto"]])
        if not producto:
            continue

        registros.append(
            {
                "fecha": fecha,
                "hora": hora,
                "turno": clasificar_turno_por_hora(hora),
                "mesa": _texto_celda(fila[columnas["Mesa"]]),
                "cuenta": _parse_cuenta(fila[columnas["Cuenta"]]),
                "producto": producto,
                "cantidad": _parse_cantidad(fila[columnas["Cantidad"]]),
                "estatus": _texto_celda(fila[columnas["Estatus"]]),
                "fila_excel": idx + 1,
            }
        )

    return registros


def clasificar_productos_contra_catalogo(registros: list[dict], productos_catalogo: list) -> None:
    """
    Muta `registros` in-place con grupo/categoria_tipo/seccion_menu del
    Catálogo de Productos, por nombre — misma lógica que Productos Vendidos
    (`clasificar_producto_contra_catalogo`), pero aquí no hay un `grupo`
    previo del archivo de origen que preservar en caso de no-match (este
    archivo nunca trae grupo), así que se deja explícitamente en None.
    `costo_catalogo`/`precio_venta_catalogo` (que sí usa Productos Vendidos)
    se descartan: `ComandaEmitidaDetalle` no tiene esas columnas, esta Fase
    1 solo necesita la clasificación, no el costo estándar de receta.
    """
    for registro in registros:
        clasificacion = clasificar_producto_contra_catalogo(registro["producto"], productos_catalogo)
        clasificacion.setdefault("grupo", None)
        clasificacion.pop("costo_catalogo", None)
        clasificacion.pop("precio_venta_catalogo", None)
        if "nombre_producto" in clasificacion:
            # El nombre canónico del catálogo reemplaza el texto crudo del
            # ticket (mismo criterio que Productos Vendidos).
            registro["producto"] = clasificacion.pop("nombre_producto")
        registro.update(clasificacion)
