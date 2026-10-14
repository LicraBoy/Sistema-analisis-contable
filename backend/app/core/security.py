"""
Seguridad: contraseñas (bcrypt), tokens de acceso (JWT corto), refresh tokens opacos, política de contraseñas
y la dependencia `get_current_user` que protege la API.

Notas de diseño:
- El hash usa `bcrypt` directo con un prehash SHA-256 (evita el límite de 72 bytes). `passlib` 1.7.4 no es
  compatible con `bcrypt` 5 y por eso ya no se usa.
- El token de acceso dura pocos minutos y lleva `tv` (versión de tokens del usuario): subirla (cambio de
  contraseña, de rol o desactivación) invalida al instante todos los tokens ya emitidos.
- El refresh token es un valor aleatorio de 256 bits; en la base solo se guarda su hash SHA-256.
"""

from __future__ import annotations

import base64
import contextvars
import hashlib
import hmac
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db

BCRYPT_COSTO = 12
CLAVE_SECRETA_EJEMPLO = "change-me-to-a-random-secret-key-in-production"

# Usuario de la petición en curso y supervisor que autorizó (para que servicios síncronos como la bitácora de la
# Fiesta sepan quién actúa sin tener que recibir el usuario en cada llamada).
usuario_actual: contextvars.ContextVar[dict | None] = contextvars.ContextVar("usuario_actual", default=None)
autorizo_por: contextvars.ContextVar[str | None] = contextvars.ContextVar("autorizo_por", default=None)
ip_actual: contextvars.ContextVar[str | None] = contextvars.ContextVar("ip_actual", default=None)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ── Contraseñas ─────────────────────────────────────────────────────────────


def _prehash(plain: str) -> bytes:
    return base64.b64encode(hashlib.sha256(plain.encode("utf-8")).digest())


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(_prehash(plain_password), bcrypt.gensalt(BCRYPT_COSTO)).decode("ascii")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(plain_password), hashed_password.encode("ascii"))
    except (ValueError, TypeError):
        return False


_hash_falso: str | None = None


def gastar_tiempo_de_hash(plain_password: str) -> None:
    """Para un correo inexistente: hace el mismo trabajo que una verificación real (iguala tiempos)."""
    global _hash_falso
    if _hash_falso is None:
        _hash_falso = hash_password(secrets.token_urlsafe(8))
    verify_password(plain_password, _hash_falso)


_COMUNES = {
    "password", "contrasena", "contraseña", "12345678", "123456789", "1234567890", "qwertyuiop", "admin123",
    "bienvenido", "bienvenida", "mazatlan", "torresmazatlan", "hotel2026", "hotel2025", "password1", "abc12345",
}


def errores_politica(plain: str, email: str = "", nombre: str = "") -> list[str]:
    """Reglas de contraseña: ≥ 10 caracteres, 3 de 4 clases, sin ser el correo/nombre ni una común."""
    errores: list[str] = []
    if len(plain) < 10:
        errores.append("Debe tener al menos 10 caracteres.")
    if len(plain) > 128:
        errores.append("Debe tener máximo 128 caracteres.")
    clases = sum(bool(re.search(p, plain)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]"))
    if clases < 3:
        errores.append("Combina al menos 3 de: minúsculas, mayúsculas, números y símbolos.")
    bajo = plain.lower()
    usuario = email.split("@")[0].lower() if email else ""
    if (usuario and len(usuario) >= 4 and usuario in bajo) or (email and bajo == email.lower()):
        errores.append("No debe contener tu correo.")
    palabras = [p for p in re.split(r"\W+", nombre.lower()) if len(p) >= 4]
    if any(p in bajo for p in palabras):
        errores.append("No debe contener tu nombre.")
    if bajo in _COMUNES or bajo.strip("0123456789") in _COMUNES:
        errores.append("Es una contraseña demasiado común.")
    return errores


def generar_password_temporal() -> str:
    """Contraseña temporal que cumple la política (se muestra una sola vez y obliga a cambiarla)."""
    alfabeto = "abcdefghjkmnpqrstuvwxyz"
    mayus = "ABCDEFGHJKMNPQRSTUVWXYZ"
    digitos = "23456789"
    simbolos = "!#$%&*+-?"
    while True:
        partes = [secrets.choice(alfabeto) for _ in range(5)] + [secrets.choice(mayus) for _ in range(3)]
        partes += [secrets.choice(digitos) for _ in range(3)] + [secrets.choice(simbolos) for _ in range(2)]
        secrets.SystemRandom().shuffle(partes)
        candidata = "".join(partes)
        if not errores_politica(candidata):
            return candidata


# ── Tokens ──────────────────────────────────────────────────────────────────


def verificar_configuracion() -> None:
    """En producción no se arranca con la clave secreta de ejemplo (o una demasiado corta)."""
    if settings.entorno.lower() == "produccion" and settings.auth_enabled:
        if settings.secret_key == CLAVE_SECRETA_EJEMPLO or len(settings.secret_key) < 32:
            raise RuntimeError(
                "SECRET_KEY insegura: define en .env una clave aleatoria de al menos 32 caracteres "
                "(scripts/crear_admin.py la genera)."
            )


def _firmar(payload: dict, vigencia: timedelta) -> str:
    ahora = datetime.now(timezone.utc)
    return jwt.encode(
        {**payload, "iat": ahora, "exp": ahora + vigencia, "jti": uuid.uuid4().hex},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def create_access_token(usuario_id: int, token_version: int, rol: str | None) -> str:
    return _firmar(
        {"sub": str(usuario_id), "tv": token_version, "rol": rol, "typ": "acceso"},
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def decodificar(token: str, tipo: str) -> dict | None:
    try:
        datos = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None
    return datos if datos.get("typ") == tipo else None


AUTORIZACION_SEGUNDOS = 120


def create_autorizacion_token(supervisor_id: int, solicitante_id: int | None, supervisor_email: str = "") -> str:
    """Autorización de un solo uso (2 min) que un supervisor da, con su contraseña, a una acción sensible."""
    return _firmar(
        {"sub": str(supervisor_id), "solicitante": solicitante_id, "sup_email": supervisor_email, "typ": "autorizacion"},
        timedelta(seconds=AUTORIZACION_SEGUNDOS),
    )


_autorizaciones_usadas: dict[str, float] = {}


def consumir_autorizacion(token: str) -> dict | None:
    """Valida una autorización y la marca como usada (un solo uso). None si es inválida, vencida o ya usada."""
    datos = decodificar(token, "autorizacion")
    if datos is None:
        return None
    ahora = time.time()
    for jti in [j for j, vence in _autorizaciones_usadas.items() if vence < ahora]:
        _autorizaciones_usadas.pop(jti, None)
    if datos["jti"] in _autorizaciones_usadas:
        return None
    _autorizaciones_usadas[datos["jti"]] = ahora + AUTORIZACION_SEGUNDOS + 5
    return datos


def nuevo_refresh_token() -> tuple[str, str]:
    """(token para la cookie, hash para la base)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def comparar(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


# ── Límite de intentos por IP (en memoria) ──────────────────────────────────

_intentos_ip: dict[str, list[float]] = {}


def limite_excedido(clave: str, maximo: int, ventana_seg: int) -> bool:
    """True si `clave` ya hizo `maximo` intentos en la ventana; registra el intento actual."""
    ahora = time.monotonic()
    recientes = [t for t in _intentos_ip.get(clave, []) if ahora - t < ventana_seg]
    excedido = len(recientes) >= maximo
    recientes.append(ahora)
    _intentos_ip[clave] = recientes[-(maximo + 1):]
    return excedido


# ── Usuario actual ──────────────────────────────────────────────────────────

USUARIO_LOCAL = {
    "id": 0,
    "email": "admin@local.com",
    "nombre": "Administrador local",
    "rol": "administrador",
    "rol_nombre": "Administrador",
    "es_admin": True,
    "must_change_password": False,
    "permisos": {},  # se completa con todos los módulos en nivel 2 (ver core.permisos)
    "bypass": True,
}

# Rutas que un usuario con contraseña pendiente de cambiar SÍ puede usar.
_RUTAS_CAMBIO_PASSWORD = ("/auth/cambiar-password", "/auth/yo", "/auth/logout")


def _no_autenticado(detalle: str = "No has iniciado sesión.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detalle,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def permisos_de_rol(db: AsyncSession, rol_id: int | None) -> dict[str, int]:
    from app.models.usuario import PermisoRol

    if rol_id is None:
        return {}
    res = await db.execute(select(PermisoRol.modulo, PermisoRol.nivel).where(PermisoRol.rol_id == rol_id))
    return {modulo: nivel for modulo, nivel in res.all()}


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Usuario autenticado a partir del token de acceso. Con `AUTH_ENABLED=false` (solo desarrollo/pruebas)
    devuelve un administrador local para conservar el acceso abierto de siempre.
    """
    from app.core.permisos import TODOS_LOS_MODULOS
    from app.models.usuario import Usuario

    usuario_actual.set(None)
    autorizo_por.set(None)
    ip_actual.set(request.client.host if request.client else None)
    if not settings.auth_enabled:
        usuario = {**USUARIO_LOCAL, "permisos": {m: 2 for m in TODOS_LOS_MODULOS}}
        request.state.usuario = usuario
        usuario_actual.set(usuario)
        return usuario

    if not token:
        raise _no_autenticado()
    datos = decodificar(token, "acceso")
    if datos is None:
        raise _no_autenticado("La sesión expiró. Vuelve a iniciar sesión.")
    res = await db.execute(select(Usuario).where(Usuario.id == int(datos["sub"])).options(selectinload(Usuario.rol)))
    fila = res.scalar_one_or_none()
    if fila is None or not fila.is_active or fila.token_version != datos.get("tv"):
        raise _no_autenticado("La sesión ya no es válida. Vuelve a iniciar sesión.")

    permisos = await permisos_de_rol(db, fila.rol_id)
    usuario = {
        "id": fila.id,
        "email": fila.email,
        "nombre": fila.nombre,
        "rol": fila.rol.clave if fila.rol else None,
        "rol_nombre": fila.rol.nombre if fila.rol else None,
        "es_admin": permisos.get("administracion", 0) >= 2,
        "must_change_password": fila.must_change_password,
        "permisos": permisos,
        "bypass": False,
    }
    if fila.must_change_password and not request.url.path.endswith(_RUTAS_CAMBIO_PASSWORD):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Debes cambiar tu contraseña antes de continuar.")
    request.state.usuario = usuario
    usuario_actual.set(usuario)
    return usuario
