"""
Lectura de Excel por nombre de encabezado (tolerante a acentos/mayúsculas/
espacios), en vez del patrón `header=None` + posición fija que usa la
mayoría de los servicios de este sistema. Se usa cuando el archivo de origen
sí trae un encabezado real y confiable (a diferencia de, por ejemplo,
Productos Vendidos o el Catálogo de Productos, donde la posición de columna
es la única referencia estable).

`_normalizar_encabezado` es el mismo criterio que ya usa
`services/facturacion.py` (`leer_excel_balanza`) para tolerar variaciones de
texto en encabezados reales — se extrae aquí para no duplicarlo a ciegas en
cada servicio nuevo que también necesite leer por nombre de columna.
"""

import unicodedata


def _normalizar_encabezado(texto) -> str:
    if texto is None:
        return ""
    sin_acentos = unicodedata.normalize("NFKD", str(texto).strip()).encode("ascii", "ignore").decode("ascii")
    return sin_acentos.lower()


def mapear_encabezados(fila_encabezados, nombres_esperados: list[str]) -> dict[str, int]:
    """
    Dada una fila de encabezados (iterable de celdas, en orden de columna) y
    una lista de nombres canónicos esperados, regresa `{nombre_canonico:
    indice_columna}` para cada nombre esperado que sí se encontró (tolerando
    acentos/mayúsculas/espacios de más). Los nombres esperados que no
    aparezcan en la fila simplemente no quedan en el resultado — quien llama
    decide si eso es un error (columna requerida faltante) o no.
    """
    normalizados_esperados = {_normalizar_encabezado(nombre): nombre for nombre in nombres_esperados}
    resultado: dict[str, int] = {}
    for idx_col, valor in enumerate(fila_encabezados):
        nombre_canonico = normalizados_esperados.get(_normalizar_encabezado(valor))
        if nombre_canonico and nombre_canonico not in resultado:
            resultado[nombre_canonico] = idx_col
    return resultado
