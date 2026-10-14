"""
ArchivoProcesado model — historial de archivos Excel subidos y su resultado.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TipoArchivo(str, enum.Enum):
    """Tipo de archivo procesado."""

    INGRESOS = "ingresos"
    PAGOS = "pagos"


class EstadoProcesamiento(str, enum.Enum):
    """Estado del procesamiento del archivo."""

    PENDIENTE = "pendiente"
    PROCESANDO = "procesando"
    COMPLETADO = "completado"
    ERROR = "error"


class ArchivoProcesado(Base):
    __tablename__ = "archivos_procesados"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre_archivo: Mapped[str] = mapped_column(String(500), nullable=False)
    tipo: Mapped[TipoArchivo] = mapped_column(
        Enum(TipoArchivo, name="tipo_archivo"),
        nullable=False,
    )
    estado_procesamiento: Mapped[EstadoProcesamiento] = mapped_column(
        Enum(EstadoProcesamiento, name="estado_procesamiento"),
        nullable=False,
        default=EstadoProcesamiento.PENDIENTE,
    )

    # ── Métricas de resultado ───────────────────────────
    total_registros: Mapped[int] = mapped_column(Integer, default=0)
    uuid_encontrados: Mapped[int] = mapped_column(Integer, default=0)
    uuid_no_encontrados: Mapped[int] = mapped_column(Integer, default=0)
    mensaje_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # ── Quién lo subió ──────────────────────────────────
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Timestamps ──────────────────────────────────────
    fecha_subida: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    fecha_completado: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relaciones ──────────────────────────────────────
    pagos = relationship("Pago", back_populates="archivo", lazy="selectin")

    def __repr__(self) -> str:
        return f"<ArchivoProcesado {self.nombre_archivo} ({self.estado_procesamiento.value})>"
