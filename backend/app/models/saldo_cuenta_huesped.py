"""
SaldoCuentaHuespedLinea — una línea capturable del reporte RCP170 ("Saldo en
Cuenta Huésped") de Novohit, por periodo (`YYYY-MM`). Cada fila es una línea
de cuenta de una habitación (agencia/"Principal" o sub-cuenta con folio) o,
en la sección "Varios", el folio mismo. Los datos del RCP170 se reemplazan al
re-subir el mes; GRAVADO/TASA 0/SUBTOTAL/IVA/propina/IEPS/ISH no existen en el reporte (los captura
el usuario) y se conservan si la misma línea vuelve a aparecer.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SaldoCuentaHuespedLinea(Base):
    __tablename__ = "saldo_cuenta_huesped_linea"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    periodo: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # "YYYY-MM"
    orden: Mapped[int] = mapped_column(Integer, nullable=False)  # posición en el reporte
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)  # "habitacion" | "varios"

    habitacion: Mapped[str] = mapped_column(String(20), nullable=False)
    codigo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    huesped: Mapped[str | None] = mapped_column(String(255), nullable=True)
    adultos_ninos: Mapped[str | None] = mapped_column(String(20), nullable=True)
    llegada: Mapped[str | None] = mapped_column(String(10), nullable=True)  # dd/mm/yyyy tal cual el reporte
    salida: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tarifa: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    garantia: Mapped[str | None] = mapped_column(String(60), nullable=True)
    saldo_habitacion: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    es_primera_linea: Mapped[bool] = mapped_column(nullable=False, default=True)  # abre el grupo de la habitación
    agencia: Mapped[str | None] = mapped_column(String(255), nullable=True)  # solo 1ª línea ("Agencia")
    linea_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)  # "Principal" o "NOMBRE*folio*"
    monto: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    gravado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tasa0: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    iva: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    propina: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ieps: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ish: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
