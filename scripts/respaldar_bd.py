"""
Respaldo consistente de la base de datos SQLite (se puede correr con el sistema encendido).

Uso (desde la raíz del proyecto):
    backend\\.venv\\Scripts\\python.exe scripts\\respaldar_bd.py            # respalda y conserva los últimos 14
    backend\\.venv\\Scripts\\python.exe scripts\\respaldar_bd.py --conservar 30
    backend\\.venv\\Scripts\\python.exe scripts\\respaldar_bd.py --restaurar backups\\local_db_2026-10-14_0900.sqlite3

Usa la API de respaldo de SQLite (no una copia de archivo a ciegas): el resultado es una base íntegra aunque alguien
esté guardando en ese momento. Restaurar primero guarda la base actual como `*_antes_de_restaurar` por si acaso.
La base y la carpeta de respaldos salen de `backend/.env` (DATABASE_URL) o, por omisión, `backend/local_db.sqlite3`.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
BACKEND = RAIZ / "backend"
CARPETA = RAIZ / "backups"


def ruta_bd() -> Path:
    url = ""
    env = BACKEND / ".env"
    if env.exists():
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.strip().startswith("DATABASE_URL="):
                url = linea.split("=", 1)[1].strip()
    m = re.match(r"sqlite(?:\+aiosqlite)?:///(.+)", url or "sqlite+aiosqlite:///./local_db.sqlite3")
    if not m:
        sys.exit(f"Este script solo respalda SQLite (DATABASE_URL={url!r}).")
    p = Path(m.group(1))
    return p if p.is_absolute() else (BACKEND / p).resolve()


def respaldar(conservar: int) -> Path:
    origen = ruta_bd()
    if not origen.exists():
        sys.exit(f"No existe la base de datos: {origen}")
    CARPETA.mkdir(exist_ok=True)
    destino = CARPETA / f"{origen.stem}_{datetime.now():%Y-%m-%d_%H%M}{origen.suffix}"
    with sqlite3.connect(origen) as con_origen, sqlite3.connect(destino) as con_destino:
        con_origen.backup(con_destino)
    # verificación: la copia abre y pasa el chequeo de integridad
    with sqlite3.connect(destino) as con:
        resultado = con.execute("pragma integrity_check").fetchone()[0]
    if resultado != "ok":
        destino.unlink(missing_ok=True)
        sys.exit(f"El respaldo salió dañado ({resultado}); se descartó.")
    antiguos = sorted(CARPETA.glob(f"{origen.stem}_*{origen.suffix}"))
    for viejo in antiguos[:-conservar] if conservar > 0 else []:
        viejo.unlink(missing_ok=True)
    print(f"Respaldo creado: {destino} ({destino.stat().st_size / 1_048_576:.1f} MB). Se conservan {min(len(antiguos), conservar)}.")
    return destino


def restaurar(archivo: Path) -> None:
    if not archivo.exists():
        sys.exit(f"No existe el respaldo: {archivo}")
    with sqlite3.connect(archivo) as con:
        if con.execute("pragma integrity_check").fetchone()[0] != "ok":
            sys.exit("El respaldo no pasa el chequeo de integridad; no se restaura.")
    destino = ruta_bd()
    if destino.exists():
        seguro = destino.with_name(f"{destino.stem}_antes_de_restaurar_{datetime.now():%Y%m%d_%H%M}{destino.suffix}")
        shutil.copy2(destino, seguro)
        print(f"Base actual guardada en {seguro}")
    shutil.copy2(archivo, destino)
    print(f"Restaurado {archivo.name} → {destino}. Reinicia los servidores.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--conservar", type=int, default=14, help="cuántos respaldos guardar (0 = todos)")
    p.add_argument("--restaurar", type=Path, help="restaura desde este archivo (apaga los servidores antes)")
    a = p.parse_args()
    restaurar(a.restaurar) if a.restaurar else respaldar(a.conservar)
