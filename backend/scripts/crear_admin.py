"""
Administración de cuentas desde la consola (no necesita permisos de administrador de Windows ni iniciar sesión).

Uso (desde `backend/`):
    set PYTHONPATH=.
    .venv\\Scripts\\python.exe scripts\\crear_admin.py crear --email tu@correo.com --nombre "Tu Nombre"
    .venv\\Scripts\\python.exe scripts\\crear_admin.py desbloquear --email tu@correo.com
    .venv\\Scripts\\python.exe scripts\\crear_admin.py restablecer --email tu@correo.com
    .venv\\Scripts\\python.exe scripts\\crear_admin.py clave-secreta      (genera SECRET_KEY en .env si falta)

`crear` y `restablecer` piden la contraseña sin mostrarla; si se omite (Enter), generan una temporal que
obliga a cambiarla al entrar. Siembra los roles y la matriz de permisos si todavía no existen.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.security import CLAVE_SECRETA_EJEMPLO, errores_politica, generar_password_temporal, hash_password
from app.db.session import async_session_factory
from app.models.usuario import Rol, Usuario
from app.services.seguridad import auditar, sembrar_roles

RAIZ = Path(__file__).resolve().parents[1]


def _pedir_password(email: str, nombre: str, temporal: bool = False) -> tuple[str, bool]:
    """(contraseña, es_temporal)."""
    if temporal:
        return generar_password_temporal(), True
    while True:
        p1 = getpass.getpass("Contraseña (Enter = generar una temporal): ")
        if not p1:
            return generar_password_temporal(), True
        errores = errores_politica(p1, email, nombre)
        if errores:
            print("  " + "\n  ".join(errores))
            continue
        if p1 != getpass.getpass("Repítela: "):
            print("  No coinciden.")
            continue
        return p1, False


async def _crear(email: str, nombre: str, temporal: bool = False) -> None:
    email = email.strip().lower()
    async with async_session_factory() as db:
        await sembrar_roles(db)
        rol = (await db.execute(select(Rol).where(Rol.clave == "administrador"))).scalar_one()
        existente = (await db.execute(select(Usuario).where(Usuario.email == email))).scalar_one_or_none()
        if existente is not None:
            print(f"Ya existe {email}. Usa 'restablecer' para cambiarle la contraseña.")
            return
        password, temporal = _pedir_password(email, nombre, temporal)
        db.add(
            Usuario(
                email=email,
                nombre=nombre,
                rol_id=rol.id,
                hashed_password=hash_password(password),
                must_change_password=temporal,
                password_changed_at=datetime.now(timezone.utc),
            )
        )
        await auditar(db, evento="usuario_creado", email=email, detalle="Administrador creado desde consola")
        await db.commit()
    print(f"Administrador creado: {email}")
    if temporal:
        print(f"Contraseña temporal (se pedirá cambiarla al entrar): {password}")


async def _con_usuario(email: str, accion: str) -> None:
    email = email.strip().lower()
    async with async_session_factory() as db:
        u = (await db.execute(select(Usuario).where(Usuario.email == email))).scalar_one_or_none()
        if u is None:
            print(f"No existe el usuario {email}.")
            sys.exit(1)
        if accion == "desbloquear":
            u.failed_attempts = 0
            u.locked_until = None
            u.is_active = True
            print(f"Cuenta desbloqueada: {email}")
        else:
            password, temporal = _pedir_password(email, u.nombre)
            u.hashed_password = hash_password(password)
            u.must_change_password = temporal
            u.password_changed_at = datetime.now(timezone.utc)
            u.failed_attempts = 0
            u.locked_until = None
            u.is_active = True
            u.token_version += 1
            print(f"Contraseña restablecida: {email}")
            if temporal:
                print(f"Contraseña temporal (se pedirá cambiarla al entrar): {password}")
        await auditar(db, evento=f"consola_{accion}", email=email, detalle="Desde consola")
        await db.commit()


def _clave_secreta() -> None:
    ruta = RAIZ / ".env"
    texto = ruta.read_text(encoding="utf-8") if ruta.exists() else ""
    lineas = texto.splitlines()
    for i, linea in enumerate(lineas):
        if linea.strip().startswith("SECRET_KEY="):
            valor = linea.split("=", 1)[1].strip()
            if valor and valor != CLAVE_SECRETA_EJEMPLO and len(valor) >= 32:
                print("SECRET_KEY ya está definida; no se cambia (cambiarla cierra todas las sesiones).")
                return
            lineas[i] = f"SECRET_KEY={secrets.token_urlsafe(48)}"
            break
    else:
        lineas.append(f"SECRET_KEY={secrets.token_urlsafe(48)}")
    ruta.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"SECRET_KEY generada en {ruta}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("crear")
    c.add_argument("--email", required=True)
    c.add_argument("--nombre", required=True)
    c.add_argument("--temporal", action="store_true", help="genera una contraseña temporal sin preguntarla")
    for nombre in ("desbloquear", "restablecer"):
        sub.add_parser(nombre).add_argument("--email", required=True)
    sub.add_parser("clave-secreta")
    args = parser.parse_args()

    if args.cmd == "clave-secreta":
        _clave_secreta()
    elif args.cmd == "crear":
        asyncio.run(_crear(args.email, args.nombre, args.temporal))
    else:
        asyncio.run(_con_usuario(args.email, args.cmd))


if __name__ == "__main__":
    main()
