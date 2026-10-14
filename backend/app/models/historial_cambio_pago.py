"""
HistorialCambioPago model — registro de auditoría de correcciones manuales
de UUID/factura en un Pago (quién fue el UUID viejo, cuál el nuevo, y por qué).
"""

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HistorialCambioPago(Base):
    __tablename__ = "historial_cambios_pago"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    pago_id: Mapped[int] = mapped_column(
        ForeignKey("pagos.id", ondelete="CASCADE"),
        nullable=False,
    )
    pago = relationship("Pago")

    uuid_anterior: Mapped[str | None] = mapped_column(String(36), nullable=True)
    uuid_nuevo: Mapped[str | None] = mapped_column(String(36), nullable=True)
    factura_anterior: Mapped[str | None] = mapped_column(String(100), nullable=True)
    factura_nuevo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)

    # Fecha del Pago corregido (no la fecha en que se hizo la corrección) —
    # es la que se usa para filtrar el reporte por mes, ya que el usuario
    # espera ver "los cambios hechos a pagos de julio" sin importar qué día
    # hizo el clic.
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)

    fecha_cambio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<HistorialCambioPago pago_id={self.pago_id} {self.uuid_anterior} -> {self.uuid_nuevo}>"
