"""
CfdiIngreso model — registros del módulo de Ingresos Recibidos.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CfdiIngreso(Base):
    __tablename__ = "cfdi_ingresos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    regimen_fiscal_receptor: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    regimen_fiscal_emisor: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    rfc_emisor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    nombre_emisor: Mapped[str | None] = mapped_column(Text, nullable=True)
    datos_extra: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Resto de columnas originales del Excel para no perder información",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<CfdiIngreso uuid={self.uuid}>"
