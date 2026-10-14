"""
BalanzaCuenta model — la balanza contable vigente de la empresa (módulo
Facturación), usada para comparar contra "Ventas por punto de venta". A
diferencia de FacturacionTablaFormaPagoDetalle, no se guarda por periodo:
cada subida reemplaza por completo las filas existentes, ya que solo importa
la balanza más reciente.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BalanzaCuenta(Base):
    __tablename__ = "balanza_cuenta"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    codigo_cuenta: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)

    saldo_anterior: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    debitos_mes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    creditos_mes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    saldo_mes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    saldo_actual: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<BalanzaCuenta codigo={self.codigo_cuenta} descripcion={self.descripcion}>"
