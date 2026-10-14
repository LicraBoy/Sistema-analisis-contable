"""
HistorialEliminacionPago model — foto de un Pago al momento de eliminarlo,
para el reporte de auditoría. Sin FK a pagos.id a propósito: el registro
original desaparece, pero este rastro debe sobrevivir.
"""

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HistorialEliminacionPago(Base):
    __tablename__ = "historial_eliminaciones_pago"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    pago_id_original: Mapped[int] = mapped_column(nullable=False)

    tipo_movimiento: Mapped[str | None] = mapped_column(String(100), nullable=True)
    factura: Mapped[str | None] = mapped_column(String(100), nullable=True)
    uuid: Mapped[str | None] = mapped_column(String(36), nullable=True)
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    estado: Mapped[str | None] = mapped_column(String(20), nullable=True)
    monto: Mapped[str | None] = mapped_column(String(50), nullable=True)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)

    fecha_eliminacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<HistorialEliminacionPago pago_id_original={self.pago_id_original} factura={self.factura}>"
