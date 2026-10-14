"""
Pytest fixtures for the test suite.
"""

import os

# Las pruebas existentes asumen el acceso abierto de siempre; `tests/test_auth.py` lo enciende por prueba.
os.environ.setdefault("AUTH_ENABLED", "false")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.main import app
from app.models import *  # noqa: F401,F403 — registra todos los modelos en Base.metadata

settings.auth_enabled = False


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session():
    """
    Sesión async sobre una base de datos SQLite en memoria, completamente
    aislada de local_db.sqlite3 (la BD real del usuario) — para tests que
    necesitan insertar Pago/CfdiIngreso sin tocar datos reales.
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()
