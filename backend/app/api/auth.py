"""
Auth router — inicio de sesión con bloqueo por intentos, sesiones con refresh token rotativo, cambio de
contraseña y autorización de supervisor (un solo uso).

Ojo: `get_db` revierte la transacción cuando se lanza una excepción. Todo lo que debe quedar guardado aunque
la respuesta sea un error (intentos fallidos, bloqueos, auditoría) responde con `JSONResponse`, no con `raise`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.permisos import CAPACIDADES, NIVEL_EDITAR, TODOS_LOS_MODULOS, nivel_de
from app.core.security import (
    create_access_token,
    create_autorizacion_token,
    errores_politica,
    gastar_tiempo_de_hash,
    get_current_user,
    hash_password,
    hash_token,
    limite_excedido,
    nuevo_refresh_token,
    permisos_de_rol,
    verify_password,
)
from app.db.session import get_db
from app.models.usuario import Sesion, Usuario
from app.schemas.auth import AutorizarRequest, CambiarPasswordRequest, LoginRequest, PerfilRequest
from app.services.seguridad import auditar, ip_de

router = APIRouter()

COOKIE_REFRESH = "refresh_token"
_ERROR_CREDENCIALES = "Correo o contraseña incorrectos."
_GRACIA_REUSO_SEG = 10


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite devuelve fechas sin zona; todas las guardamos en UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _error(codigo: int, mensaje: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=codigo, content={"detail": mensaje, **extra})


def _poner_cookie(respuesta: Response, token: str, expira: datetime) -> None:
    respuesta.set_cookie(
        COOKIE_REFRESH,
        token,
        max_age=max(int((expira - _ahora()).total_seconds()), 1),
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
        path="/",
    )


def _quitar_cookie(respuesta: Response) -> None:
    respuesta.delete_cookie(COOKIE_REFRESH, path="/", httponly=True, samesite="strict", secure=settings.cookie_secure)


def _perfil(usuario: Usuario, permisos: dict[str, int]) -> dict:
    return {
        "id": usuario.id,
        "email": usuario.email,
        "nombre": usuario.nombre,
        "rol": usuario.rol.clave if usuario.rol else None,
        "rol_nombre": usuario.rol.nombre if usuario.rol else None,
        "es_admin": permisos.get("administracion", 0) >= NIVEL_EDITAR,
        "must_change_password": usuario.must_change_password,
        "permisos": permisos,
    }


async def _abrir_sesion(db: AsyncSession, usuario: Usuario, request: Request, familia: str | None = None, vence_absoluto: datetime | None = None) -> tuple[str, datetime]:
    ahora = _ahora()
    vence_absoluto = vence_absoluto or ahora + timedelta(hours=settings.sesion_max_horas)
    expira = min(ahora + timedelta(minutes=settings.sesion_inactividad_min), vence_absoluto)
    token, hash_ = nuevo_refresh_token()
    agente = request.headers.get("user-agent")
    db.add(
        Sesion(
            usuario_id=usuario.id,
            token_hash=hash_,
            familia=familia or uuid.uuid4().hex,
            expira_en=expira,
            vence_absoluto=vence_absoluto,
            ip=ip_de(request),
            user_agent=agente[:255] if agente else None,
        )
    )
    await db.flush()
    return token, expira


async def _revocar_familia(db: AsyncSession, familia: str) -> None:
    await db.execute(update(Sesion).where(Sesion.familia == familia, Sesion.revocada_en.is_(None)).values(revocada_en=_ahora()))


async def _respuesta_con_sesion(db: AsyncSession, usuario: Usuario, request: Request, **kw) -> JSONResponse:
    permisos = await permisos_de_rol(db, usuario.rol_id)
    token, expira = await _abrir_sesion(db, usuario, request, **kw)
    acceso = create_access_token(usuario.id, usuario.token_version, usuario.rol.clave if usuario.rol else None)
    respuesta = JSONResponse(
        content={
            "access_token": acceso,
            "token_type": "bearer",
            "expira_en_seg": settings.access_token_expire_minutes * 60,
            "usuario": _perfil(usuario, permisos),
        }
    )
    _poner_cookie(respuesta, token, expira)
    return respuesta


def _minutos(segundos: float) -> int:
    return max(int(-(-segundos // 60)), 1)


@router.post("/login")
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = ip_de(request) or "?"
    email = body.email.strip().lower()
    if limite_excedido(f"login:{ip}", 20, 300):
        await auditar(db, evento="login_limite_ip", request=request, email=email, exito=False, detalle="Demasiados intentos desde esta IP")
        return _error(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.")

    usuario = (
        await db.execute(select(Usuario).where(Usuario.email == email).options(selectinload(Usuario.rol)))
    ).scalar_one_or_none()
    if usuario is None:
        gastar_tiempo_de_hash(body.password)
        await auditar(db, evento="login_fallido", request=request, email=email, exito=False, detalle="Usuario inexistente")
        return _error(401, _ERROR_CREDENCIALES)

    ahora = _ahora()
    bloqueo = _aware(usuario.locked_until)
    if bloqueo is not None and bloqueo > ahora:
        restante = (bloqueo - ahora).total_seconds()
        await auditar(db, evento="login_bloqueado", request=request, usuario_id=usuario.id, email=email, exito=False, detalle="Cuenta bloqueada")
        return _error(423, f"Cuenta bloqueada por intentos fallidos. Inténtalo en {_minutos(restante)} min.", bloqueada_minutos=_minutos(restante))

    if not verify_password(body.password, usuario.hashed_password) or not usuario.is_active:
        if not usuario.is_active:
            await auditar(db, evento="login_fallido", request=request, usuario_id=usuario.id, email=email, exito=False, detalle="Cuenta desactivada")
            return _error(401, _ERROR_CREDENCIALES)
        usuario.failed_attempts += 1
        detalle = f"Intento {usuario.failed_attempts}"
        if usuario.failed_attempts % settings.login_max_intentos == 0:
            # 1.er bloqueo 15 min, 2.º 30, 3.º 60… (tope 4 h)
            escalon = usuario.failed_attempts // settings.login_max_intentos
            minutos = min(settings.login_bloqueo_min * 2 ** (escalon - 1), 240)
            usuario.locked_until = ahora + timedelta(minutes=minutos)
            detalle += f" — cuenta bloqueada {minutos} min"
        await auditar(db, evento="login_fallido", request=request, usuario_id=usuario.id, email=email, exito=False, detalle=detalle)
        return _error(401, _ERROR_CREDENCIALES)

    usuario.failed_attempts = 0
    usuario.locked_until = None
    usuario.last_login_at = ahora
    await auditar(db, evento="login", request=request, usuario_id=usuario.id, email=email)
    return await _respuesta_con_sesion(db, usuario, request)


@router.post("/refresh")
async def refresh(request: Request, db: AsyncSession = Depends(get_db)):
    # Cabecera que un formulario de otro sitio no puede mandar: defensa extra contra CSRF.
    if request.headers.get("x-requested-with") != "XMLHttpRequest":
        return _error(400, "Solicitud no válida.")
    token = request.cookies.get(COOKIE_REFRESH)
    if not token:
        return _error(401, "No hay sesión activa.")
    sesion = (await db.execute(select(Sesion).where(Sesion.token_hash == hash_token(token)))).scalar_one_or_none()
    respuesta_401 = _error(401, "La sesión expiró. Vuelve a iniciar sesión.")
    _quitar_cookie(respuesta_401)
    if sesion is None:
        return respuesta_401

    ahora = _ahora()
    revocada = _aware(sesion.revocada_en)
    if revocada is not None:
        if (ahora - revocada).total_seconds() > _GRACIA_REUSO_SEG:
            # Un refresh token ya usado volvió a presentarse: posible robo → se cierra toda la cadena.
            await _revocar_familia(db, sesion.familia)
            await auditar(db, evento="refresh_reutilizado", request=request, usuario_id=sesion.usuario_id, exito=False, detalle="Se revocó la sesión completa")
        return respuesta_401
    if _aware(sesion.expira_en) <= ahora or _aware(sesion.vence_absoluto) <= ahora:
        sesion.revocada_en = ahora
        return respuesta_401

    usuario = (
        await db.execute(select(Usuario).where(Usuario.id == sesion.usuario_id).options(selectinload(Usuario.rol)))
    ).scalar_one_or_none()
    if usuario is None or not usuario.is_active:
        await _revocar_familia(db, sesion.familia)
        return respuesta_401

    sesion.revocada_en = ahora
    sesion.ultimo_uso = ahora
    return await _respuesta_con_sesion(db, usuario, request, familia=sesion.familia, vence_absoluto=_aware(sesion.vence_absoluto))


@router.post("/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(COOKIE_REFRESH)
    if token:
        sesion = (await db.execute(select(Sesion).where(Sesion.token_hash == hash_token(token)))).scalar_one_or_none()
        if sesion is not None:
            await _revocar_familia(db, sesion.familia)
            await auditar(db, evento="logout", request=request, usuario_id=sesion.usuario_id)
    respuesta = JSONResponse(content={"ok": True})
    _quitar_cookie(respuesta)
    return respuesta


@router.post("/logout-todas")
async def logout_todas(request: Request, usuario: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Cierra todas las sesiones del usuario (incluida ésta) e invalida sus tokens de acceso."""
    if not usuario.get("bypass"):
        fila = (await db.execute(select(Usuario).where(Usuario.id == usuario["id"]))).scalar_one()
        fila.token_version += 1
        await db.execute(update(Sesion).where(Sesion.usuario_id == fila.id, Sesion.revocada_en.is_(None)).values(revocada_en=_ahora()))
        await auditar(db, evento="logout_todas", request=request, usuario=usuario)
    respuesta = JSONResponse(content={"ok": True})
    _quitar_cookie(respuesta)
    return respuesta


@router.get("/yo")
async def yo(usuario: dict = Depends(get_current_user)) -> dict:
    """Perfil del usuario actual (con sus permisos por módulo). Con la autenticación apagada, un administrador local."""
    return {**{k: v for k, v in usuario.items() if k != "bypass"}, "auth_activa": settings.auth_enabled}


@router.get("/estado")
async def estado() -> dict:
    """Público: dice si el sistema exige inicio de sesión (el frontend lo usa para decidir si muestra el login)."""
    return {"auth_activa": settings.auth_enabled, "inactividad_min": settings.sesion_inactividad_min}


@router.patch("/perfil")
async def editar_perfil(
    body: PerfilRequest,
    request: Request,
    usuario: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """El usuario edita su propio perfil (nombre). El usuario de acceso y el rol solo los cambia el administrador."""
    if usuario.get("bypass"):
        raise HTTPException(status_code=400, detail="La autenticación está desactivada.")
    fila = (await db.execute(select(Usuario).where(Usuario.id == usuario["id"]).options(selectinload(Usuario.rol)))).scalar_one()
    nombre = body.nombre.strip()
    if len(nombre) < 2:
        raise HTTPException(status_code=422, detail="El nombre es muy corto.")
    anterior = fila.nombre
    fila.nombre = nombre
    await auditar(db, evento="perfil_editado", request=request, usuario=usuario, detalle=f"{anterior} → {nombre}")
    return _perfil(fila, await permisos_de_rol(db, fila.rol_id))


@router.post("/cambiar-password")
async def cambiar_password(
    body: CambiarPasswordRequest,
    request: Request,
    usuario: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if usuario.get("bypass"):
        raise HTTPException(status_code=400, detail="La autenticación está desactivada.")
    fila = (await db.execute(select(Usuario).where(Usuario.id == usuario["id"]).options(selectinload(Usuario.rol)))).scalar_one()
    if not verify_password(body.actual, fila.hashed_password):
        await auditar(db, evento="cambio_password", request=request, usuario=usuario, exito=False, detalle="Contraseña actual incorrecta")
        return _error(400, "La contraseña actual no es correcta.")
    errores = errores_politica(body.nueva, fila.email, fila.nombre)
    if verify_password(body.nueva, fila.hashed_password):
        errores.append("Debe ser distinta de la actual.")
    if errores:
        return _error(422, "La contraseña no cumple la política de seguridad.", errores=errores)

    fila.hashed_password = hash_password(body.nueva)
    fila.must_change_password = False
    fila.password_changed_at = _ahora()
    fila.token_version += 1  # invalida los tokens de acceso anteriores
    await db.execute(update(Sesion).where(Sesion.usuario_id == fila.id, Sesion.revocada_en.is_(None)).values(revocada_en=_ahora()))
    await auditar(db, evento="cambio_password", request=request, usuario=usuario)
    # Se abre una sesión nueva para que quien cambió la contraseña siga dentro.
    return await _respuesta_con_sesion(db, fila, request)


@router.post("/autorizar")
async def autorizar(
    body: AutorizarRequest,
    request: Request,
    usuario: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Un supervisor confirma su contraseña y recibe una autorización de un solo uso (2 min) para una acción
    sensible. Si quien opera ya es supervisor, basta con su propia contraseña.
    """
    capacidades = {c[0] for c in CAPACIDADES}
    if body.capacidad not in capacidades:
        raise HTTPException(status_code=400, detail="Capacidad desconocida.")
    if limite_excedido(f"autorizar:{ip_de(request)}", 10, 300):
        return _error(429, "Demasiados intentos. Espera unos minutos.")

    email = (body.email or "").strip().lower()
    if usuario.get("bypass"):
        return {"autorizacion": "", "supervisor": "Autenticación desactivada", "expira_en_seg": 0}
    if not email or email == usuario["email"].lower():
        supervisor = (await db.execute(select(Usuario).where(Usuario.id == usuario["id"]).options(selectinload(Usuario.rol)))).scalar_one()
    else:
        supervisor = (await db.execute(select(Usuario).where(Usuario.email == email).options(selectinload(Usuario.rol)))).scalar_one_or_none()

    ok = supervisor is not None and supervisor.is_active and verify_password(body.password, supervisor.hashed_password)
    if supervisor is None:
        gastar_tiempo_de_hash(body.password)
    if ok:
        permisos = await permisos_de_rol(db, supervisor.rol_id)
        ok = nivel_de({"permisos": permisos}, body.capacidad) >= NIVEL_EDITAR
        if not ok:
            await auditar(db, evento="autorizacion_denegada", request=request, usuario=usuario, exito=False, detalle=f"{supervisor.email} no tiene {body.capacidad}")
            return _error(403, "Esa cuenta no es de supervisor.")
    if not ok:
        await auditar(db, evento="autorizacion_fallida", request=request, usuario=usuario, exito=False, detalle=f"Supervisor: {email or usuario['email']}")
        return _error(401, "Correo o contraseña del supervisor incorrectos.")

    await auditar(db, evento="autorizacion", request=request, usuario=usuario, detalle=f"Autorizó {supervisor.email}")
    return {
        "autorizacion": create_autorizacion_token(supervisor.id, usuario["id"], supervisor.email),
        "supervisor": supervisor.nombre or supervisor.email,
        "supervisor_email": supervisor.email,
        "expira_en_seg": 120,
    }


__all__ = ["router", "TODOS_LOS_MODULOS"]
