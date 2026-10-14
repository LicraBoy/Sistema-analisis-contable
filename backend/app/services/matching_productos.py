"""
Match de nombre de producto contra el Catálogo de Productos (Restaurante).
Extraído de `services/productos_vendidos.py` (donde vivía como
`heredar_clasificacion_catalogo` + sus helpers) para que Comandas Emitidas
pueda reusar exactamente la misma lógica de fuzzy-match en vez de duplicarla
— la regla de negocio (nombres de platillo, palabras conectoras que sí
importan, tolerancia de un error de captura por palabra) es idéntica para
ambos archivos.
"""

import re
import unicodedata

# A diferencia de conciliacion_retenciones.py (nombres de persona/empresa,
# donde "CON"/"SIN" nunca aportan nada), aquí "CON"/"SIN" SÍ son evidencia:
# en un nombre de producto de menú son modificadores reales ("CON NUEZ",
# "CON CAMARONES"), no relleno — quitarlos deja una sola palabra genérica
# que termina matcheando por accidente contra platillos sin relación
# (confirmado con datos reales: "CAFETERIA GALLETA DE CHOCOLATE Y NUEZ"
# terminaba renombrada a "CON NUEZ" solo por compartir la palabra "NUEZ").
_PALABRAS_CONECTORAS = frozenset({"DE", "DEL", "LA", "EL", "LOS", "LAS", "Y"})


def normalizar_nombre_producto(texto: str) -> frozenset:
    """Nombre de producto -> conjunto de palabras (mayúsculas, sin acentos, sin puntuación)."""
    if not texto:
        return frozenset()
    sin_acentos = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode("ascii")
    palabras = re.findall(r"[A-Za-z0-9]+", sin_acentos.upper())
    return frozenset(palabras) - _PALABRAS_CONECTORAS


def _distancia_edicion(a: str, b: str, limite: int = 2) -> int:
    """Distancia de Levenshtein clásica. `limite` acota el atajo de longitud."""
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
    """Dos palabras "se parecen" si son idénticas o difieren por un error de captura razonable para su largo."""
    if a == b:
        return True
    longitud_min = min(len(a), len(b))
    if longitud_min < 3:
        return False
    limite = 2 if longitud_min >= 7 else 1
    return _distancia_edicion(a, b, limite) <= limite


def nombres_coinciden(a: frozenset, b: frozenset) -> bool:
    """
    Dos nombres de producto "coinciden" si TODAS las palabras del conjunto
    más chico aparecen en el más grande (tolerando reordenado y un error de
    captura por palabra) — a diferencia de `conciliacion_retenciones.py`
    (de donde se copió este patrón para nombres de persona/empresa), aquí
    NO se tolera ninguna palabra faltante: muchos platillos de este menú
    comparten el mismo prefijo y difieren solo en la última palabra (ej.
    "SABOR CHILE RELLENO CAMARON" vs "SABOR CHILE RELLENO CON QUESO"), así
    que la palabra "faltante" es justo la que distingue un platillo de
    otro — tolerarla fusionaba por error 2 productos distintos (confirmado
    con datos reales).

    Un conjunto de 1 sola palabra queda fuera de esta ruta difusa por
    completo: 1 palabra encontrada en el otro conjunto no es evidencia real
    de que sea el mismo producto (confirmado con datos reales: el catálogo
    tiene un producto llamado literalmente "SABOR" — cualquier platillo que
    contenga esa palabra en cualquier parte, como "SABOR QUESO FLAMEADO",
    "coincidía" por esta regla). Un nombre de 1 sola palabra solo puede
    matchear por la ruta de coincidencia EXACTA (ya manejada aparte en
    `clasificar_producto_contra_catalogo`), nunca por esta.
    """
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


class _IndiceCatalogo:
    """
    Catálogo pre-normalizado: nombre exacto (conjunto de palabras ordenado) ->
    productos, más la lista (palabras, producto) para la ruta difusa. Antes,
    cada llamada a `clasificar_producto_contra_catalogo` re-normalizaba los
    ~1,500 nombres del catálogo (≈2 s por 700 productos con datos reales).
    """

    def __init__(self, productos_catalogo: list):
        self.lista = productos_catalogo
        self.longitud = len(productos_catalogo)
        self.normalizados = [(normalizar_nombre_producto(p.nombre_producto), p) for p in productos_catalogo]
        self.exactos: dict[str, list] = {}
        for palabras, producto in self.normalizados:
            self.exactos.setdefault(" ".join(sorted(palabras)), []).append(producto)


# Un solo slot: cada request carga el catálogo una vez y lo reutiliza para todos
# sus productos; se valida por identidad de la lista + longitud.
_indice_actual: _IndiceCatalogo | None = None


def _obtener_indice(productos_catalogo: list) -> _IndiceCatalogo:
    global _indice_actual
    indice = _indice_actual
    if indice is None or indice.lista is not productos_catalogo or indice.longitud != len(productos_catalogo):
        indice = _IndiceCatalogo(productos_catalogo)
        _indice_actual = indice
    return indice


def _elegir_candidato(candidatos: list, grupo_preferido: str | None):
    """
    Desempate determinista entre productos de catálogo con el mismo nombre
    (14 duplicados en datos reales, ej. "BAHAMA MAMA" a 110 y a 104 en grupos
    distintos): primero el que está en el `grupo_preferido` (el que ya trae la
    comanda), luego el de mayor precio, luego orden alfabético de grupo.
    """
    preferido = (grupo_preferido or "").strip().upper()

    def _llave(producto):
        en_grupo = 0 if preferido and (producto.grupo or "").strip().upper() == preferido else 1
        return (en_grupo, -(producto.precio_venta or 0.0), producto.grupo or "")

    return min(candidatos, key=_llave)


def _es_ambiguo(candidatos: list) -> bool:
    """Hay más de un candidato y difieren en precio o costo (el resultado depende del desempate)."""
    return len({(p.precio_venta, p.costo) for p in candidatos}) > 1


def clasificar_producto_contra_catalogo(
    nombre_producto: str, productos_catalogo: list, grupo_preferido: str | None = None
) -> dict:
    """
    Busca `nombre_producto` en `productos_catalogo` (lista de
    `CatalogoProducto`): coincidencia exacta de nombre primero (por
    conjunto de palabras), luego difusa vía `nombres_coinciden`. Regresa un
    dict listo para mezclar sobre un registro (`registro.update(...)`): si
    hay match, incluye el `nombre_producto`/`grupo` canónicos del catálogo
    (para sobrescribir el texto crudo del archivo de origen) más
    categoria_tipo/seccion_menu/costo_catalogo/precio_venta_catalogo/
    producto_catalogo_encontrado=True. Si NO hay match, el dict
    deliberadamente **no incluye** `nombre_producto`/`grupo` — solo las 4
    llaves de clasificación en None + producto_catalogo_encontrado=False —
    para que un `.update()` no le borre a quien llama un `grupo` que ya
    traía de otra fuente (ej. Productos Vendidos, que arrastra el grupo del
    bloque del Excel aunque el producto no matchee); quien no tenga un
    `grupo` propio (ej. Comandas Emitidas) debe usar `.get("grupo")` con un
    default explícito. `grupo_preferido` solo desempata cuando el catálogo
    trae varios productos con el mismo nombre.
    """
    return clasificar_producto_contra_catalogo_detallado(nombre_producto, productos_catalogo, grupo_preferido)[0]


def clasificar_producto_contra_catalogo_detallado(
    nombre_producto: str, productos_catalogo: list, grupo_preferido: str | None = None
) -> tuple[dict, bool]:
    """Igual que `clasificar_producto_contra_catalogo` pero también dice si el match fue ambiguo."""
    indice = _obtener_indice(productos_catalogo)
    clave_registro = normalizar_nombre_producto(nombre_producto)
    clave_exacta = " ".join(sorted(clave_registro))

    candidatos = indice.exactos.get(clave_exacta, [])
    if not candidatos:
        candidatos = [producto for palabras, producto in indice.normalizados if nombres_coinciden(clave_registro, palabras)]

    if not candidatos:
        return (
            {
                "categoria_tipo": None,
                "seccion_menu": None,
                "costo_catalogo": None,
                "precio_venta_catalogo": None,
                "producto_catalogo_encontrado": False,
            },
            False,
        )
    match = _elegir_candidato(candidatos, grupo_preferido)
    return (
        {
            "nombre_producto": match.nombre_producto,
            "grupo": match.grupo,
            "categoria_tipo": match.categoria_tipo,
            "seccion_menu": match.seccion_menu,
            "costo_catalogo": match.costo,
            "precio_venta_catalogo": match.precio_venta,
            "producto_catalogo_encontrado": True,
        },
        _es_ambiguo(candidatos),
    )

