"""
Cabeceras de descarga seguras.

Armar `Content-Disposition` con texto que viene del usuario (nombre de archivo, periodo, grupo…) permite inyectar
saltos de línea/comillas y rompe con caracteres fuera de latin-1 (500 en lugar de la descarga). `cabecera_descarga`
deja un nombre ASCII limpio y agrega la versión UTF-8 (RFC 5987) para que el navegador conserve acentos.
"""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import quote


def nombre_seguro(nombre: str, respaldo: str = "descarga") -> str:
    """Nombre ASCII sin caracteres de control, comillas, barras ni espacios (se cambian por `_`)."""
    ascii_ = unicodedata.normalize("NFKD", str(nombre or "")).encode("ascii", "ignore").decode("ascii")
    ascii_ = re.sub(r"[^A-Za-z0-9._-]+", "_", ascii_).strip("._") or respaldo
    return ascii_[:120]


def cabecera_descarga(nombre: str, respaldo: str = "descarga") -> dict[str, str]:
    """`{"Content-Disposition": ...}` listo para `StreamingResponse(headers=...)`."""
    limpio = re.sub(r"[\x00-\x1f\x7f\"\\/]+", "_", str(nombre or "")).strip() or respaldo
    ascii_ = nombre_seguro(limpio, respaldo)
    return {"Content-Disposition": f"attachment; filename=\"{ascii_}\"; filename*=UTF-8''{quote(limpio[:120])}"}
