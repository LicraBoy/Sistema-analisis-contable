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
DIAS_HISTORIAL = 14
EXCLUIDAS_DE_ARCHIVOS = "amarre_costo_archivos"  # los reportes de Amarre se pueden volver a subir; no se respaldan


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
    quedan = antiguos
    if conservar > 0:
        # Se conservan los `conservar` más recientes y, además, el último de cada uno de los últimos `DIAS_HISTORIAL` días
        # (con respaldos cada pocas horas, solo "los últimos N" cubriría apenas un día).
        mantener = set(antiguos[-conservar:])
        por_dia: dict[str, Path] = {}
        for f in antiguos:
            m = re.search(r"_(\d{4}-\d{2}-\d{2})_\d{4}", f.name)
            if m:
                por_dia[m.group(1)] = f
        mantener.update(f for _, f in sorted(por_dia.items())[-DIAS_HISTORIAL:])
        quedan = [f for f in antiguos if f in mantener]
        for viejo in antiguos:
            if viejo not in mantener:
                viejo.unlink(missing_ok=True)
    print(f"Respaldo creado: {destino} ({destino.stat().st_size / 1_048_576:.1f} MB). Se conservan {len(quedan)}.")
    copiar_archivos_subidos()
    copiar_a_destinos_extra(destino)
    return destino


def copiar_archivos_subidos() -> None:
    """Espejo incremental de `backend/storage` (facturas adjuntas; sin los archivos de Amarre de Costo) en `backups/archivos/`."""
    origen = BACKEND / "storage"
    if not origen.exists():
        return
    copiados = _espejo(origen, CARPETA / "archivos")
    print(f"Archivos subidos: {copiados} nuevo(s) o modificado(s) copiados.")


def _espejo(origen: Path, destino: Path) -> int:
    copiados = 0
    for f in origen.rglob("*"):
        if not f.is_file() or EXCLUIDAS_DE_ARCHIVOS in f.relative_to(origen).parts:
            continue
        d = destino / f.relative_to(origen)
        if d.exists() and d.stat().st_size == f.stat().st_size and d.stat().st_mtime >= f.stat().st_mtime:
            continue
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, d)
        copiados += 1
    return copiados


def copiar_a_destinos_extra(respaldo: Path) -> None:
    """Copia el respaldo (y los archivos subidos) a las carpetas listadas en `backups/destinos_extra.txt`
    (una ruta por línea: disco USB, carpeta de red…). Si un destino no está disponible solo se avisa: el respaldo local ya existe."""
    lista = CARPETA / "destinos_extra.txt"
    if not lista.exists():
        return
    for linea in lista.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        try:
            raiz = Path(linea)
            raiz.mkdir(parents=True, exist_ok=True)
            shutil.copy2(respaldo, raiz / respaldo.name)
            if (CARPETA / "archivos").exists():
                _espejo(CARPETA / "archivos", raiz / "archivos")
            viejos = sorted(raiz.glob(f"{respaldo.stem.rsplit('_', 2)[0]}_*{respaldo.suffix}"))
            for v in viejos[:-30]:
                v.unlink(missing_ok=True)
            print(f"Copia extra en {raiz}")
        except OSError as e:
            print(f"AVISO: no se pudo copiar a {linea}: {e}")


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
    p.add_argument("--conservar", type=int, default=12, help="cuántos respaldos recientes guardar, además del último de cada día de las 2 últimas semanas (0 = todos)")
    p.add_argument("--restaurar", type=Path, help="restaura desde este archivo (apaga los servidores antes)")
    a = p.parse_args()
    restaurar(a.restaurar) if a.restaurar else respaldar(a.conservar)
