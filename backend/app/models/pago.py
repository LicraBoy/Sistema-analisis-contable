"""
Pago model — registros del módulo de Análisis de Pagos.
"""

import enum
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EstadoPago(str, enum.Enum):
    """Estados posibles de un registro de pago tras el análisis."""

    ENCONTRADO = "encontrado"
    NO_PAGADO = "no_pagado"
    DUPLICADO = "duplicado"


class Pago(Base):
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tipo_movimiento: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    fecha: Mapped[date | None] = mapped_column(Date, nullable=True)
    factura: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    uuid: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    estado: Mapped[EstadoPago] = mapped_column(
        Enum(EstadoPago, name="estado_pago"),
        nullable=False,
        default=EstadoPago.DUPLICADO,
    )
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    datos_extra: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Columnas adicionales del Excel original",
    )

    # ── Relación con archivo procesado ──────────────────
    archivo_id: Mapped[int | None] = mapped_column(
        ForeignKey("archivos_procesados.id", ondelete="SET NULL"),
        nullable=True,
    )
    archivo = relationship("ArchivoProcesado", back_populates="pagos")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<Pago factura={self.factura} estado={self.estado.value}>"
