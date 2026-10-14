"""
NotaFechaHeatmap model — nota manual opcional de una línea que el usuario
asocia a una fecha del Heatmap de Ventas (ej. "Fiesta Mexicana" en un día con
un pico de ventas detectado automáticamente), para explicar picos que el
sistema no puede inferir por sí solo. Una fila por fecha (Restaurante).
"""

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NotaFechaHeatmap(Base):
    __tablename__ = "notas_fecha_heatmap"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    nota: Mapped[str] = mapped_column(String(280), nullable=False)

    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<NotaFechaHeatmap fecha={self.fecha}>"
