"""
Administración de seguridad (solo rol con acceso a `administracion`): usuarios, roles, matriz de permisos
y bitácora. Se monta en `main.py` con `requiere("administracion")` (GET = ver, el resto = editar).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permisos import (
    CAPACIDADES,
    MODULO_ADMIN,
    MODULOS_MATRIZ,
    NIVEL_EDITAR,
)
from app.core.security import errores_politica, generar_password_temporal, get_current_user, hash_password
from app.db.session import get_db
from app.models.usuario import Auditoria, PermisoRol, Rol, Sesion, Usuario
from app.services.seguridad import auditar

router = APIRouter()

_EMAIL = re.compile(r"^[a-z0-9][a-z0-9._@-]{2,59}$")  # usuario de acceso: nombre corto o correo
_CLAVE = re.compile(r"^[a-z][a-z0-9_]{2,39}$")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class UsuarioNuevo(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    nombre: str = Field(min_length=1, max_length=150)
    rol_id: int


class UsuarioCambios(BaseModel):
    nombre: str | None = Field(default=None, max_length=150)
    rol_id: int | None = None
    is_active: bool | None = None


class RolNuevo(BaseModel):
    clave: str
    nombre: str = Field(min_length=1, max_length=80)
    descripcion: str | None = Field(default=None, max_length=255)
    copiar_de: int | None = None


class RolCambios(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    descripcion: str | None = Field(default=None, max_length=255)


class RestablecerPassword(BaseModel):
    password: str | None = Field(default=None, max_length=128)


class PermisosRol(BaseModel):
    permisos: dict[str, int]


def _usuario_dict(u: Usuario) -> dict:
    bloqueo = _aware(u.locked_until)
    return {
        "id": u.id,
        "email": u.email,
        "nombre": u.nombre,
        "rol_id": u.rol_id,
        "rol": u.rol.nombre if u.rol else None,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "bloqueado": bool(bloqueo and bloqueo > _ahora()),
        "locked_until": bloqueo.isoformat() if bloqueo else None,
        "failed_attempts": u.failed_attempts,
        "last_login_at": _aware(u.last_login_at).isoformat() if u.last_login_at else None,
        "created_at": _aware(u.created_at).isoformat() if u.created_at else None,
    }


async def _administradores_activos(db: AsyncSession, excluyendo: int | None = None) -> int:
    consulta = (
        select(func.count(Usuario.id))
        .join(PermisoRol, PermisoRol.rol_id == Usuario.rol_id)
        .where(Usuario.is_active.is_(True), PermisoRol.modulo == MODULO_ADMIN, PermisoRol.nivel >= NIVEL_EDITAR)
    )
    if excluyendo is not None:
        consulta = consulta.where(Usuario.id != excluyendo)
    return (await db.execute(consulta)).scalar_one()


async def _usuario(db: AsyncSession, usuario_id: int) -> Usuario:
    u = (await db.execute(select(Usuario).where(Usuario.id == usuario_id).options(selectinload(Usuario.rol)))).scalar_one_or_none()
    if u is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    return u


async def _cerrar_sesiones(db: AsyncSession, u: Usuario) -> None:
    u.token_version += 1
    await db.execute(update(Sesion).where(Sesion.usuario_id == u.id, Sesion.revocada_en.is_(None)).values(revocada_en=_ahora()))


# ── Catálogo de módulos ─────────────────────────────────────────────────────


@router.get("/modulos")
async def modulos() -> dict:
    return {
        "modulos": [{"clave": c, "nombre": n, "descripcion": d} for c, n, d in MODULOS_MATRIZ],
        "capacidades": [{"clave": c, "nombre": n, "descripcion": d} for c, n, d in CAPACIDADES],
        "niveles": [{"valor": 0, "nombre": "Sin acceso"}, {"valor": 1, "nombre": "Solo ver"}, {"valor": 2, "nombre": "Ver y editar"}],
    }


# ── Usuarios ────────────────────────────────────────────────────────────────


@router.get("/usuarios")
async def listar_usuarios(db: AsyncSession = Depends(get_db)) -> list[dict]:
    filas = (await db.execute(select(Usuario).options(selectinload(Usuario.rol)).order_by(Usuario.nombre, Usuario.email))).scalars().all()
    return [_usuario_dict(u) for u in filas]


@router.post("/usuarios", status_code=201)
async def crear_usuario(body: UsuarioNuevo, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    if not _EMAIL.match(email):
        raise HTTPException(status_code=422, detail="El usuario debe tener de 3 a 60 caracteres: letras, números, punto, guion o guion bajo.")
    if (await db.execute(select(Usuario.id).where(Usuario.email == email))).first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese nombre de usuario.")
    if (await db.get(Rol, body.rol_id)) is None:
        raise HTTPException(status_code=422, detail="El rol no existe.")
    temporal = generar_password_temporal()
    u = Usuario(
        email=email,
        nombre=body.nombre.strip(),
        rol_id=body.rol_id,
        hashed_password=hash_password(temporal),
        must_change_password=True,
        password_changed_at=_ahora(),
    )
    db.add(u)
    await db.flush()
    await auditar(db, evento="usuario_creado", request=request, usuario=actual, detalle=f"{email} (rol {body.rol_id})", modulo=MODULO_ADMIN)
    u = await _usuario(db, u.id)
    # La contraseña temporal solo se muestra esta vez.
    return {**_usuario_dict(u), "password_temporal": temporal}


@router.patch("/usuarios/{usuario_id}")
async def editar_usuario(usuario_id: int, body: UsuarioCambios, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    u = await _usuario(db, usuario_id)
    es_yo = usuario_id == actual.get("id")
    cambios: list[str] = []
    if body.nombre is not None and body.nombre.strip() != u.nombre:
        u.nombre = body.nombre.strip()
        cambios.append("nombre")
    if body.rol_id is not None and body.rol_id != u.rol_id:
        if es_yo:
            raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol.")
        rol = await db.get(Rol, body.rol_id)
        if rol is None:
            raise HTTPException(status_code=422, detail="El rol no existe.")
        if u.is_active and await _administradores_activos(db, excluyendo=u.id) == 0:
            raise HTTPException(status_code=409, detail="Debe quedar al menos un administrador activo.")
        u.rol_id = body.rol_id
        await _cerrar_sesiones(db, u)
        cambios.append(f"rol→{rol.clave}")
    if body.is_active is not None and body.is_active != u.is_active:
        if es_yo and not body.is_active:
            raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta.")
        if not body.is_active and await _administradores_activos(db, excluyendo=u.id) == 0:
            raise HTTPException(status_code=409, detail="Debe quedar al menos un administrador activo.")
        u.is_active = body.is_active
        if not body.is_active:
            await _cerrar_sesiones(db, u)
        cambios.append("activado" if body.is_active else "desactivado")
    if cambios:
        await auditar(db, evento="usuario_editado", request=request, usuario=actual, detalle=f"{u.email}: {', '.join(cambios)}", modulo=MODULO_ADMIN)
    await db.flush()
    await db.refresh(u, ["rol"])
    return _usuario_dict(u)


@router.post("/usuarios/{usuario_id}/desbloquear")
async def desbloquear(usuario_id: int, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    u = await _usuario(db, usuario_id)
    u.failed_attempts = 0
    u.locked_until = None
    await auditar(db, evento="usuario_desbloqueado", request=request, usuario=actual, detalle=u.email, modulo=MODULO_ADMIN)
    return _usuario_dict(u)


@router.post("/usuarios/{usuario_id}/restablecer-password")
async def restablecer_password(usuario_id: int, request: Request, datos: RestablecerPassword | None = None, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    """Las contraseñas no se pueden consultar (solo se guarda su huella): se asigna una temporal nueva, generada o escrita por el administrador."""
    u = await _usuario(db, usuario_id)
    if datos and datos.password:
        errores = errores_politica(datos.password, u.email, u.nombre)
        if errores:
            raise HTTPException(status_code=422, detail=" ".join(errores))
        temporal = datos.password
    else:
        temporal = generar_password_temporal()
    u.hashed_password = hash_password(temporal)
    u.must_change_password = True
    u.password_changed_at = _ahora()
    u.failed_attempts = 0
    u.locked_until = None
    await _cerrar_sesiones(db, u)
    await auditar(db, evento="password_restablecida", request=request, usuario=actual, detalle=u.email, modulo=MODULO_ADMIN)
    return {**_usuario_dict(u), "password_temporal": temporal}


@router.post("/usuarios/{usuario_id}/cerrar-sesiones")
async def cerrar_sesiones(usuario_id: int, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    u = await _usuario(db, usuario_id)
    await _cerrar_sesiones(db, u)
    await auditar(db, evento="sesiones_cerradas", request=request, usuario=actual, detalle=u.email, modulo=MODULO_ADMIN)
    return {"ok": True}


# ── Roles y matriz ──────────────────────────────────────────────────────────


async def _rol_dict(db: AsyncSession, rol: Rol) -> dict:
    permisos = {m: n for m, n in (await db.execute(select(PermisoRol.modulo, PermisoRol.nivel).where(PermisoRol.rol_id == rol.id))).all()}
    usuarios = (await db.execute(select(func.count(Usuario.id)).where(Usuario.rol_id == rol.id))).scalar_one()
    return {
        "id": rol.id,
        "clave": rol.clave,
        "nombre": rol.nombre,
        "descripcion": rol.descripcion,
        "es_sistema": rol.es_sistema,
        "usuarios": usuarios,
        "permisos": permisos,
    }


@router.get("/roles")
async def listar_roles(db: AsyncSession = Depends(get_db)) -> list[dict]:
    roles = (await db.execute(select(Rol).order_by(Rol.id))).scalars().all()
    return [await _rol_dict(db, r) for r in roles]


@router.post("/roles", status_code=201)
async def crear_rol(body: RolNuevo, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    clave = body.clave.strip().lower()
    if not _CLAVE.match(clave):
        raise HTTPException(status_code=422, detail="La clave usa minúsculas, números y guion bajo (3 a 40 caracteres).")
    if (await db.execute(select(Rol.id).where(Rol.clave == clave))).first():
        raise HTTPException(status_code=409, detail="Ya existe un rol con esa clave.")
    rol = Rol(clave=clave, nombre=body.nombre.strip(), descripcion=body.descripcion, es_sistema=False)
    db.add(rol)
    await db.flush()
    base: dict[str, int] = {}
    if body.copiar_de is not None:
        base = {m: n for m, n in (await db.execute(select(PermisoRol.modulo, PermisoRol.nivel).where(PermisoRol.rol_id == body.copiar_de))).all()}
    for modulo in [m[0] for m in MODULOS_MATRIZ] + [c[0] for c in CAPACIDADES] + [MODULO_ADMIN]:
        # El acceso a administración nunca se hereda por copia.
        db.add(PermisoRol(rol_id=rol.id, modulo=modulo, nivel=0 if modulo == MODULO_ADMIN else base.get(modulo, 0)))
    await auditar(db, evento="rol_creado", request=request, usuario=actual, detalle=clave, modulo=MODULO_ADMIN)
    await db.flush()
    return await _rol_dict(db, rol)


@router.patch("/roles/{rol_id}")
async def editar_rol(rol_id: int, body: RolCambios, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    rol = await db.get(Rol, rol_id)
    if rol is None:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    if body.nombre is not None:
        rol.nombre = body.nombre.strip()
    if body.descripcion is not None:
        rol.descripcion = body.descripcion
    await auditar(db, evento="rol_editado", request=request, usuario=actual, detalle=rol.clave, modulo=MODULO_ADMIN)
    return await _rol_dict(db, rol)


@router.put("/roles/{rol_id}/permisos")
async def guardar_permisos(rol_id: int, body: PermisosRol, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    rol = await db.get(Rol, rol_id)
    if rol is None:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    validos = {m[0] for m in MODULOS_MATRIZ} | {c[0] for c in CAPACIDADES}
    for modulo, nivel in body.permisos.items():
        if modulo not in validos:
            raise HTTPException(status_code=422, detail=f"Módulo desconocido: {modulo}.")
        if nivel not in (0, 1, 2):
            raise HTTPException(status_code=422, detail="El nivel debe ser 0, 1 o 2.")
    if rol.es_sistema:
        raise HTTPException(status_code=409, detail="El rol Administrador no se puede modificar.")
    actuales = {p.modulo: p for p in (await db.execute(select(PermisoRol).where(PermisoRol.rol_id == rol.id))).scalars().all()}
    cambios: list[str] = []
    for modulo, nivel in body.permisos.items():
        fila = actuales.get(modulo)
        if fila is None:
            db.add(PermisoRol(rol_id=rol.id, modulo=modulo, nivel=nivel))
            cambios.append(f"{modulo}={nivel}")
        elif fila.nivel != nivel:
            cambios.append(f"{modulo}:{fila.nivel}→{nivel}")
            fila.nivel = nivel
    if cambios:
        # Quienes tienen este rol deben volver a cargar sus permisos: se invalidan sus tokens de acceso.
        await db.execute(update(Usuario).where(Usuario.rol_id == rol.id).values(token_version=Usuario.token_version + 1))
        await auditar(db, evento="permisos_editados", request=request, usuario=actual, detalle=f"{rol.clave}: {', '.join(cambios)}", modulo=MODULO_ADMIN)
    await db.flush()
    return await _rol_dict(db, rol)


@router.delete("/roles/{rol_id}")
async def borrar_rol(rol_id: int, request: Request, actual: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    rol = await db.get(Rol, rol_id)
    if rol is None:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")
    if rol.es_sistema:
        raise HTTPException(status_code=409, detail="Los roles de sistema no se pueden borrar.")
    en_uso = (await db.execute(select(func.count(Usuario.id)).where(Usuario.rol_id == rol.id))).scalar_one()
    if en_uso:
        raise HTTPException(status_code=409, detail=f"Hay {en_uso} usuario(s) con este rol. Cámbialos de rol primero.")
    await auditar(db, evento="rol_borrado", request=request, usuario=actual, detalle=rol.clave, modulo=MODULO_ADMIN)
    await db.delete(rol)
    return {"ok": True}


# ── Bitácora ────────────────────────────────────────────────────────────────


@router.get("/auditoria")
async def bitacora(
    evento: str | None = None,
    email: str | None = None,
    solo_fallos: bool = False,
    desde: str | None = Query(default=None, description="YYYY-MM-DD"),
    hasta: str | None = Query(default=None, description="YYYY-MM-DD"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    filtros = []
    if evento:
        filtros.append(Auditoria.evento == evento)
    if email:
        filtros.append(Auditoria.email.ilike(f"%{email.strip()}%"))
    if solo_fallos:
        filtros.append(Auditoria.exito.is_(False))
    try:
        if desde:
            filtros.append(Auditoria.ts >= datetime.fromisoformat(desde).replace(tzinfo=timezone.utc))
        if hasta:
            filtros.append(Auditoria.ts < datetime.fromisoformat(hasta).replace(tzinfo=timezone.utc) + timedelta(days=1))
    except ValueError:
        raise HTTPException(status_code=422, detail="Fecha inválida (usa YYYY-MM-DD).")
    total = (await db.execute(select(func.count(Auditoria.id)).where(*filtros))).scalar_one()
    filas = (
        await db.execute(select(Auditoria).where(*filtros).order_by(Auditoria.id.desc()).offset((pagina - 1) * por_pagina).limit(por_pagina))
    ).scalars().all()
    eventos = [e for (e,) in (await db.execute(select(Auditoria.evento).distinct().order_by(Auditoria.evento))).all()]
    return {
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "eventos": eventos,
        "filas": [
            {
                "id": a.id,
                "ts": _aware(a.ts).isoformat(),
                "evento": a.evento,
                "email": a.email,
                "modulo": a.modulo,
                "detalle": a.detalle,
                "exito": a.exito,
                "ip": a.ip,
            }
            for a in filas
        ],
    }
