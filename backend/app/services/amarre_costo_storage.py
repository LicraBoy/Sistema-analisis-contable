"""
Amarre de Costo de Ventas — almacenamiento en disco de los 12 archivos
originales subidos cada mes. Necesarios (además de parsearlos) para poder
regenerar el clon completo del libro maestro (`amarre_costo_workbook.py`),
que pega cada archivo tal cual en su propia hoja. Mismo patrón ya usado en
el sistema para adjuntos de Facturación (`facturacion.py::
guardar_adjunto_factura`): los archivos viven en disco bajo
`settings.storage_dir`, la base de datos solo guarda la ruta relativa,
nunca el contenido como BLOB.
"""

from pathlib import Path

from app.core.config import settings

DIRECTORIO_ARCHIVOS_AMARRE_COSTO = "amarre_costo_archivos"


def _directorio_almacenamiento() -> Path:
    return Path(settings.storage_dir)


def _extension(nombre_original: str) -> str:
    return Path(nombre_original).suffix.lstrip(".").lower() or "xlsx"


def guardar_archivo_original_amarre_costo(periodo: str, tipo: str, nombre_original: str, contenido: bytes) -> str:
    """
    Escribe `contenido` en
    <storage_dir>/amarre_costo_archivos/<periodo>/<tipo>.<extension> y
    regresa la ruta relativa (a guardar en
    AmarreCostoArchivoOriginal.ruta_relativa). `periodo` (YYYY-MM) y `tipo`
    (uno de TIPOS_VALIDOS, nunca texto libre del usuario) son los únicos
    componentes variables de la ruta, así que no hace falta sanitizar nada
    para evitar path traversal.
    """
    ruta_relativa = f"{DIRECTORIO_ARCHIVOS_AMARRE_COSTO}/{periodo}/{tipo}.{_extension(nombre_original)}"
    ruta_absoluta = _directorio_almacenamiento() / ruta_relativa
    ruta_absoluta.parent.mkdir(parents=True, exist_ok=True)
    ruta_absoluta.write_bytes(contenido)
    return ruta_relativa


def leer_archivo_original_amarre_costo(ruta_relativa: str) -> bytes:
    return (_directorio_almacenamiento() / ruta_relativa).read_bytes()


def eliminar_archivo_original_amarre_costo(ruta_relativa: str | None) -> None:
    """Borra el archivo si existe. Silencioso si ya no está (reemplazo repetido no debe fallar)."""
    if not ruta_relativa:
        return
    (_directorio_almacenamiento() / ruta_relativa).unlink(missing_ok=True)
