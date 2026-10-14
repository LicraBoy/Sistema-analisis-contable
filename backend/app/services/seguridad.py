"""
Servicios de seguridad: bitácora de auditoría y semilla (idempotente) de roles y matriz de permisos.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permisos import MODULOS_Y_CAPACIDADES, MODULO_ADMIN, ROLES_INICIALES
from app.models.usuario import Auditoria, PermisoRol, Rol


def ip_de(request: Request | None) -> str | None:
    if request is None or request.client is None:
        return None
    return request.client.host


async def auditar(
    db: AsyncSession,
    *,
    evento: str,
    request: Request | None = None,
    usuario: dict | None = None,
    usuario_id: int | None = None,
    email: str | None = None,
    modulo: str | None = None,
    detalle: str | None = None,
    exito: bool = True,
) -> None:
    """Agrega un renglón a la bitácora (el commit lo hace quien llama o `get_db`)."""
    if usuario is not None:
        usuario_id = usuario.get("id") if not usuario.get("bypass") else None
        email = email or usuario.get("email")
    agente = request.headers.get("user-agent") if request is not None else None
    db.add(
        Auditoria(
            usuario_id=usuario_id,
            email=(email or None),
            evento=evento,
            modulo=modulo,
            detalle=detalle,
            exito=exito,
            ip=ip_de(request),
            user_agent=agente[:255] if agente else None,
        )
    )
    await db.flush()


async def sembrar_roles(db: AsyncSession) -> None:
    """Crea los roles iniciales y completa la matriz. Nunca pisa lo que el administrador ya editó."""
    for clave, (nombre, descripcion, permisos) in ROLES_INICIALES.items():
        rol = (await db.execute(select(Rol).where(Rol.clave == clave))).scalar_one_or_none()
        es_nuevo = rol is None
        if rol is None:
            rol = Rol(clave=clave, nombre=nombre, descripcion=descripcion, es_sistema=(clave == "administrador"))
            db.add(rol)
            await db.flush()
        existentes = {
            m for (m,) in (await db.execute(select(PermisoRol.modulo).where(PermisoRol.rol_id == rol.id))).all()
        }
        for modulo in MODULOS_Y_CAPACIDADES + [MODULO_ADMIN]:
            if modulo in existentes:
                continue
            # Un módulo nuevo en un rol ya existente arranca sin acceso, salvo el administrador.
            nivel = permisos.get(modulo, 0) if (es_nuevo or clave == "administrador") else 0
            db.add(PermisoRol(rol_id=rol.id, modulo=modulo, nivel=nivel))
    await db.flush()
