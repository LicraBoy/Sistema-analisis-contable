"""
PagoRecepcionDia model — snapshot diario, ya conciliado, de "Pagos del Mes"
(módulo Pagos de Recepción). Guarda las cuentas de la Tabla 2 que sí
encontraron un pago en el archivo de Movimiento, para un día que el usuario
elige a mano al guardar (no se infiere de "Fecha de Emisión"); también los
pagos de Movimiento que no amarraron con ninguna cuenta (`es_sin_cuenta`,
ver `api/pagos_recepcion.py::guardar_pagos_del_mes`) — lo que de verdad se
cobró ese día no debe perderse solo porque no encontró su factura.
"""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PagoRecepcionDia(Base):
    __tablename__ = "pagos_recepcion_dia"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cuenta: Mapped[int] = mapped_column(Integer, nullable=False)
    habitacion: Mapped[str | None] = mapped_column(String(50), nullable=True)
    huesped: Mapped[str | None] = mapped_column(String(255), nullable=True)
    es_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Fila es_manual=True generada SOLA al guardar el día, desde un pago de
    # Movimiento que no amarró con ninguna cuenta de Tabla 2 — se reemplaza en
    # cada guardado, a diferencia de una fila manual real (es_manual=True,
    # es_sin_cuenta=False) que el usuario tecleó por su cuenta y nunca se toca.
    es_sin_cuenta: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    efectivo: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    amex: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    visa: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mcard: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    credito: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    totales: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    subtotal1: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    iva16: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ish3: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    subtotal2: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    gravado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tasa0: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    propina: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<PagoRecepcionDia fecha={self.fecha} cuenta={self.cuenta}>"
