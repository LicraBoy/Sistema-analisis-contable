"""
Catálogo de Productos — catálogo maestro de recetas/productos del sistema de
costeo (módulo independiente del flujo de Ingresos/Pagos/Conciliación,
Facturación y Pagos de Recepción).

El Excel de origen no trae un encabezado confiable (títulos/mezclas en las
primeras filas), así que se lee crudo (`header=None`) y las columnas de
interés se identifican por posición fija, igual que `cfdi_analysis.py` y
`pagos_recepcion.py` hacen para sus propios archivos.

Los datos empiezan en la fila 6 de Excel (índice 5, 0-based). La columna de
punto de venta (B) y la de grupo/categoría (C) no vienen repetidas en cada
fila: solo se escriben cuando cambian, así que se propagan hacia abajo
(forward-fill) hasta encontrar un valor nuevo.
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


async def leer_excel_catalogo_productos(file_content: bytes) -> pd.DataFrame:
    """
    Leer el Excel de catálogo de productos crudo (sin encabezados), con
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


def _parse_monto_catalogo(valor) -> float | None:
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
    `conciliacion_retenciones.py` en vez de importada, para mantener este
    módulo independiente (mismo criterio que el resto de los módulos).
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
    "BEBIDA(S)" palabra por palabra.
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


# ── Sección de menú (Desayuno/Comida-Cena/Bar/Extra/Otros) ───────────
# Mapeo fijo, dado a mano por el usuario grupo por grupo (igual criterio que
# MAPEO_BALANZA_POR_PUNTO_VENTA en services/facturacion.py) porque la
# relación grupo -> sección de menú no es derivable por patrón: "ESPECIALES"
# y "ESPECIALES DEL DIA" son Comida-Cena pero "EVENTOS ESPECIALES" es Otros,
# así que un simple substring de "ESPECIAL" fallaría. El fallback por
# substring al final del clasificador solo cubre grupos nuevos que no estén
# todavía en estos sets.
GRUPOS_DESAYUNO = {
    "JUGOS Y LICUADOS", "DULCE DESPERTAR", "DESAYUNOS LIGEROS", "HUEVOS", "OMELETS",
    "DESAYUNOS-COMBOS", "BEBIDAS COCINA", "BOX LUNCH DESAYUNO", "ESPRESSO",
}

GRUPOS_COMIDA_CENA = {
    "BOTANAS", "BOX LUNCH COMIDA Y/O CENA", "CARNES", "ENSALADAS", "ENTRADAS", "ESPECIALES",
    "ESPECIALES DEL DIA", "HAMBURGUESAS - SANDWICHES", "MARISCOS", "MENU NINOS",
    "PLATILLOS ITALIANOS", "PLATILLOS MEXICANOS", "POLLOS", "POSTRES", "SALUDABLE Y LIGERO",
    "SOPAS Y ENSALADAS",
}

# Barra/licores/vinos — su propia sección de menú, separada de Comida-Cena
# (pedido explícito del usuario: "que las bebidas tengan su grupo de bar").
GRUPOS_BAR = {
    "BEBIDAS S/ALCOHOL", "BEBIDAS SIN ALCOHOL", "BEBIDAS TROPICAL ESP", "BEBIDAS TROPICALES",
    "BOTELLAS DE VINO", "BRANDY", "CAFE CON LICOR", "CARRETA BEBIDAS", "CATA DE VINO", "CERVEZAS",
    "COCTELES", "COGNAC", "GINEBRA", "HORA FELIZ CERVEZAS", "HORA FELIZ INTERNAC",
    "HORA FELIZ NAC 2X1", "HORA FELIZ TEQUILAS", "HORA FELIZ VINOS", "JARRAS", "LICORES", "RON",
    "TEQUILA", "VARIOS", "VINOS BOTELLA", "VINOS COPA", "VODKA", "WHISKEY BOURBON/RYE",
    "WHISKEY ESCOCES",
}

# Excepciones a nivel de producto individual: el grupo por sí solo no
# alcanza (ej. JARRAS va a Bar en general, pero "JARRA JUGO NARANJA NATURAL"
# es jugo de desayuno, no jarra de bar) — se revisan antes que el mapeo por
# grupo, comparando el nombre del producto ya normalizado.
PRODUCTOS_EXCEPCION_DESAYUNO = {
    "JARRA JUGO NARANJA NATURAL",
}

# Excepción a nivel de producto por nombre (no por `tipo`: "EVENTOS
# RESTAURANT" resultó ser un tag genérico de banquete que el Excel usa muy
# ampliamente, incluida toda la rotación semanal de noches temáticas — usarlo
# como regla mandaba también esas noches a Otros por error). Acotada a los 5
# productos de catering puntuales dentro de "ESPECIALES" (Cata VIP, Cena 4
# Tiempos en Jardines, Hospitality Room, St Pats...), que sí son eventos
# especiales y no menú regular de Comida-Cena.
PRODUCTOS_EXCEPCION_OTROS = {
    "CATA VIP", "CENA 4 TIEMPOS EN JARDINES", "HOSPITALITY ROOM",
    "ST PATS CORNED BEEF", "ST PATS SANDWICH CORNED BEEF",
}

# Cenas de temporada/evento especial (no forman parte de la rotación semanal
# fija) — deliberadamente NO en GRUPOS_COMIDA_CENA (todavía no se
# necesitan), forzadas a Otros ANTES del fallback por substring de abajo,
# porque todas contienen literalmente "CENA" y ese fallback las
# reclasificaría por accidente.
GRUPOS_OTROS_FORZADOS = {
    "CENAS FESTIVAS",
}
# Todo lo demás (eventos/administrativo + PAN CAFETERIA) queda fuera de
# todos los sets a propósito y cae en Otros por default.

# Rotación semanal fija de noches temáticas del restaurante — cada grupo
# aquí es Comida-Cena (ver clasificar_seccion_menu) Y además lleva el día de
# la semana que le corresponde, para que el frontend pueda destacarlas en su
# propia franja tipo calendario en vez de mezclarlas alfabéticamente con el
# resto de subgrupos (Carnes, Mariscos, etc.). Mapeo dado a mano por el
# usuario, mismo criterio que el resto de los mapeos fijos de este archivo.
GRUPOS_NOCHE_TEMATICA = {
    "NOCHE SABOR A MEXICO CENA": "Lunes",
    "NOCHE DE PASTAS CENA": "Martes",
    "NOCHE DE MARISCOS CENA": "Miércoles",
    "NOCHE PRIME CENA": "Jueves",
    "NOCHE BBQ CENA": "Viernes",
    "NOCHE DE CORTES CENA": "Sábado",
    "BRUNCH": "Domingo",
}


def clasificar_dia_tematica(grupo: str) -> str | None:
    """Día de la semana (Lunes..Domingo) si `grupo` es una noche temática de la rotación fija, si no None."""
    return GRUPOS_NOCHE_TEMATICA.get(_normalizar_grupo(grupo))


# Eventos especiales de una vez al año (no semanales, a diferencia de
# GRUPOS_NOCHE_TEMATICA) — también Comida-Cena (ver clasificar_seccion_menu),
# con su propio nombre de evento para que el frontend los destaque en su
# propia franja "Días Especiales", cada tarjeta con un color que evoque su
# fecha. Mapeo dado a mano por el usuario.
GRUPOS_DIA_ESPECIAL = {
    "NOCHE SAN VALENTIN CENA": "San Valentín",
    "NOCHE SUPER BOWL": "Súper Bowl",
    "NOCHE THANKSGIVING CENA": "Acción de Gracias",
    "CENA 24 DICIEMBRE": "Nochebuena",
    "NOCHE NAVIDAD CENA": "Navidad",
}


def clasificar_evento_especial(grupo: str) -> str | None:
    """Nombre del evento anual (San Valentín, Súper Bowl, ...) si `grupo` es uno de ellos, si no None."""
    return GRUPOS_DIA_ESPECIAL.get(_normalizar_grupo(grupo))


def _normalizar_grupo(texto: str) -> str:
    # El Excel real trae al menos un grupo con "¥" en vez de "Ñ" (mojibake de
    # codificación ya presente en el archivo fuente, ej. "MENU NI¥OS" en vez
    # de "MENU NIÑOS") — sin esto, quitar acentos lo dejaría como "MENU
    # NIOS" (sin la N) y no matchearía "MENU NINOS" del mapeo fijo.
    texto = texto.replace("¥", "N")
    sin_acentos = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return " ".join(sin_acentos.upper().split())  # colapsa espacios dobles, ej. "NOCHE  NAVIDAD CENA"


def clasificar_seccion_menu(grupo: str, nombre_producto: str | None = None) -> str:
    """Desayuno/Comida-Cena/Bar/Extra/Otros según el mapeo fijo de arriba."""
    if nombre_producto:
        nombre_normalizado = _normalizar_grupo(nombre_producto)
        if nombre_normalizado in PRODUCTOS_EXCEPCION_DESAYUNO:
            return "Desayuno"
        if nombre_normalizado in PRODUCTOS_EXCEPCION_OTROS:
            return "Otros"

    normalizado = _normalizar_grupo(grupo)
    if normalizado == "EXTRAS":
        return "Extra"
    if normalizado in GRUPOS_DESAYUNO:
        return "Desayuno"
    if normalizado in GRUPOS_COMIDA_CENA:
        return "Comida-Cena"
    if normalizado in GRUPOS_BAR:
        return "Bar"
    if normalizado in GRUPOS_NOCHE_TEMATICA:
        return "Comida-Cena"
    if normalizado in GRUPOS_DIA_ESPECIAL:
        return "Comida-Cena"
    if normalizado in GRUPOS_OTROS_FORZADOS:
        return "Otros"

    # Fallback para grupos nuevos no vistos todavía en el mapeo fijo.
    if "DESAYUNO" in normalizado:
        return "Desayuno"
    if "CENA" in normalizado or "COMIDA" in normalizado:
        return "Comida-Cena"
    return "Otros"


def parsear_catalogo_productos(df: pd.DataFrame) -> list[dict]:
    """
    Recorre el DataFrame crudo desde la fila de inicio de datos y arma un
    registro por producto (columna G no vacía). `punto_venta` y `grupo` se
    propagan hacia abajo desde la última fila donde tuvieron un valor no
    vacío — cada valor nuevo abre un grupo/punto de venta nuevo, sin fila de
    cierre.
    """
    if df.shape[1] <= COL_PRECIO_VENTA:
        raise ValueError(
            "El archivo no tiene suficientes columnas para el catálogo de productos "
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
                "categoria_tipo": clasificar_tipo_producto(tipo),
                "seccion_menu": clasificar_seccion_menu(grupo_actual, nombre_producto),
                "dia_tematica": clasificar_dia_tematica(grupo_actual),
                "evento_especial": clasificar_evento_especial(grupo_actual),
                "costo": _parse_monto_catalogo(fila[COL_COSTO]),
                "precio_venta": _parse_monto_catalogo(fila[COL_PRECIO_VENTA]),
                "fila_excel": idx + 1,
            }
        )

    return registros
