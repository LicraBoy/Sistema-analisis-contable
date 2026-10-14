"""
Async database engine, session factory, and FastAPI dependency.
"""

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
)



def configurar_sqlite(engine) -> None:
    """Varias cajas escriben a la vez: WAL deja leer mientras otra escribe y `busy_timeout` hace esperar (en vez de
    fallar con "database is locked"). Solo aplica a SQLite."""
    if not str(engine.url).startswith("sqlite"):
        return

    @event.listens_for(engine.sync_engine, "connect")
    def _pragmas(conexion, _):  # noqa: ANN001
        cursor = conexion.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=15000")
        cursor.close()


configurar_sqlite(engine)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
