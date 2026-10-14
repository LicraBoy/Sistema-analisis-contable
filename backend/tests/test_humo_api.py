"""
Prueba de humo de TODAS las lecturas (GET) de la API con una base vacía y un administrador: ninguna debe
terminar en error 500. Parámetros de ruta de ejemplo = 1; los obligatorios de query/archivo darán 4xx, que es válido.
"""

import re

import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app

pytestmark = pytest.mark.anyio

# Rutas que generan descargas pesadas o requieren archivos subidos antes: se prueban en sus módulos.
OMITIR = ("/docs", "/openapi.json", "/redoc")


@pytest.fixture
async def cliente_admin(monkeypatch):
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

    monkeypatch.setattr(settings, "auth_enabled", False)
    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def test_ningun_get_termina_en_500_con_base_vacia(cliente_admin):
    c = cliente_admin
    rutas = [r for r in app.routes if isinstance(r, APIRoute) and "GET" in r.methods and r.path not in OMITIR]
    assert len(rutas) > 80  # sanity: se están recorriendo las rutas de verdad
    fallos = []
    for r in rutas:
        url = re.sub(r"\{[^}]+\}", "1", r.path)
        try:
            resp = await c.get(url)
        except Exception as e:  # noqa: BLE001 — una excepción no controlada equivale a un 500
            fallos.append(f"GET {r.path} → EXCEPCIÓN {type(e).__name__}: {str(e)[:120]}")
            continue
        if resp.status_code >= 500:
            fallos.append(f"GET {r.path} → {resp.status_code}")
    assert not fallos, "\n".join(fallos)
