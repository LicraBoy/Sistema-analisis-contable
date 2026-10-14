"""
Autorización de TODAS las rutas de la API (QA previo al lanzamiento).

Recorre `app.routes` y comprueba, sin escribir en la BD real:
  · toda ruta (salvo las públicas listadas) cuelga de `requiere(<módulo>)` — si alguien agrega un router sin
    permiso, esta prueba falla;
  · sin token → 401;
  · un rol sin acceso al módulo → 403 (GET y escrituras);
  · un rol con "solo ver" → las escrituras dan 403;
  · lo exclusivo del administrador y las capacidades (p. ej. auditoría de la Fiesta) → 403 para los demás.
"""

import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.permisos import ROLES_INICIALES
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.usuario import Rol, Usuario
from app.services.seguridad import sembrar_roles

pytestmark = pytest.mark.anyio

# Rutas públicas a propósito (login, refresh, estado, salud y documentación).
PUBLICAS_EXACTAS = {"/health", "/docs", "/openapi.json", "/redoc", "/docs/oauth2-redirect"}
PUBLICAS_PREFIJO = ("/auth/",)
# Dentro de /auth/ solo estas piden sesión; el resto es público (login, refresh, estado, logout).
AUTH_CON_SESION = {"/auth/yo", "/auth/cambiar-password", "/auth/logout-todas", "/auth/autorizar", "/auth/perfil"}

ESCRITURAS = {"POST", "PUT", "PATCH", "DELETE"}


def _rutas_protegidas():
    for r in app.routes:
        if not isinstance(r, APIRoute) or r.path in PUBLICAS_EXACTAS:
            continue
        if r.path.startswith(PUBLICAS_PREFIJO) and r.path not in AUTH_CON_SESION:
            continue
        for metodo in sorted(r.methods - {"HEAD", "OPTIONS"}):
            yield r, metodo


def _modulo_y_capacidad(ruta: APIRoute):
    modulo = capacidad = None
    for d in ruta.dependencies:
        modulo = getattr(d.dependency, "modulo", modulo)
        capacidad = getattr(d.dependency, "capacidad", capacidad)
    # capacidades declaradas dentro del endpoint (Depends(requiere_capacidad(...)))
    for d in ruta.dependant.dependencies:
        capacidad = getattr(d.call, "capacidad", capacidad)
    return modulo, capacidad


def _url_con_ids(ruta: APIRoute) -> str:
    import re

    return re.sub(r"\{[^}]+\}", "1", ruta.path)


@pytest.fixture
async def mundo(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with fabrica() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    monkeypatch.setattr(settings, "auth_enabled", True)
    app.dependency_overrides[get_db] = _get_db
    tokens: dict[str, dict[str, str]] = {}
    async with fabrica() as s:
        await sembrar_roles(s)
        for rol in (await s.execute(select(Rol))).scalars():
            u = Usuario(email=f"{rol.clave}@t.com", nombre=rol.clave, rol_id=rol.id, hashed_password=hash_password("Clave-Segura-2026"))
            s.add(u)
        await s.commit()
        for u in (await s.execute(select(Usuario))).scalars():
            rol = await s.get(Rol, u.rol_id)
            tokens[rol.clave] = {"Authorization": f"Bearer {create_access_token(u.id, u.token_version, rol.clave)}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, tokens
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


def test_toda_ruta_protegida_tiene_permiso_de_modulo():
    """Un router agregado a main.py sin `requiere(...)` hace fallar esta prueba."""
    # /auth/yo, /auth/perfil… piden sesión pero no un módulo: es a propósito (todo usuario las necesita).
    sin_permiso = sorted(
        {f"{m} {r.path}" for r, m in _rutas_protegidas() if r.path not in AUTH_CON_SESION and _modulo_y_capacidad(r) == (None, None)}
    )
    assert not sin_permiso, f"Rutas sin permiso por módulo: {sin_permiso}"


async def test_sin_token_todas_las_rutas_dan_401(mundo):
    c, _ = mundo
    fallos = []
    for r, metodo in _rutas_protegidas():
        resp = await c.request(metodo, _url_con_ids(r))
        if resp.status_code != 401:
            fallos.append(f"{metodo} {r.path} → {resp.status_code}")
    assert not fallos, fallos


async def test_rol_sin_acceso_al_modulo_recibe_403(mundo):
    c, tokens = mundo
    permisos_cajera = ROLES_INICIALES["cajera_fiesta"][2]
    fallos = []
    for r, metodo in _rutas_protegidas():
        modulo, capacidad = _modulo_y_capacidad(r)
        if modulo is None or permisos_cajera.get(modulo, 0) > 0:
            continue  # la cajera sí tiene acceso a este módulo (Fiesta)
        resp = await c.request(metodo, _url_con_ids(r), headers=tokens["cajera_fiesta"])
        if resp.status_code != 403:
            fallos.append(f"{metodo} {r.path} [{modulo}] → {resp.status_code}")
    assert not fallos, fallos


async def test_rol_solo_ver_no_puede_escribir(mundo):
    c, tokens = mundo
    permisos = ROLES_INICIALES["contralor"][2]
    fallos = []
    for r, metodo in _rutas_protegidas():
        modulo, _ = _modulo_y_capacidad(r)
        if modulo is None or permisos.get(modulo, 0) != 1 or metodo not in ESCRITURAS:
            continue
        resp = await c.request(metodo, _url_con_ids(r), headers=tokens["contralor"])
        if resp.status_code != 403:
            fallos.append(f"{metodo} {r.path} [{modulo}] → {resp.status_code}")
    assert not fallos, fallos


async def test_administracion_solo_para_administrador(mundo):
    c, tokens = mundo
    fallos = []
    for r, metodo in _rutas_protegidas():
        if not r.path.startswith("/administracion"):
            continue
        for rol in ("contralor", "supervisor_fiesta", "cajera_fiesta"):
            resp = await c.request(metodo, _url_con_ids(r), headers=tokens[rol])
            if resp.status_code != 403:
                fallos.append(f"{rol} {metodo} {r.path} → {resp.status_code}")
    assert not fallos, fallos


async def test_capacidades_de_la_fiesta_no_las_tiene_la_cajera(mundo):
    c, tokens = mundo
    fallos = []
    for r, metodo in _rutas_protegidas():
        _, capacidad = _modulo_y_capacidad(r)
        if capacidad != "fiesta_auditoria":
            continue
        resp = await c.request(metodo, _url_con_ids(r), headers=tokens["cajera_fiesta"])
        if resp.status_code != 403:
            fallos.append(f"{metodo} {r.path} → {resp.status_code}")
    assert not fallos, fallos
