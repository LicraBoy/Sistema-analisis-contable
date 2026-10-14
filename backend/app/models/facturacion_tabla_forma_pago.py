"""
FacturacionTablaFormaPagoDetalle model — snapshot del detalle por cuenta de
la hoja Tablas_Forma_Pago (módulo Facturación), guardado en el momento en
que el usuario sube ese archivo ya corregido a mano por contabilidad para el
"Paso 2" (agregar-pue-ppd). A diferencia de PagoRecepcionDia, Cuenta/Fecha
se guardan como texto libre (no Integer/Date): en Facturación no hay
garantía de formato consistente tras la corrección manual, mismo criterio
de "posición fija, sin asumir tipos estrictos" que ya usa todo el módulo.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FacturacionTablaFormaPagoDetalle(Base):
    __tablename__ = "facturacion_tabla_forma_pago_detalle"
    __table_args__ = (
        Index("ix_facturacion_periodo_tabla", "periodo", "tabla_origen"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    periodo: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    tabla_origen: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    categoria_pue_ppd: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)

    revision: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fecha_texto: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pos: Mapped[str | None] = mapped_column(String(100), nullable=True)
    forma_de_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cuenta: Mapped[str | None] = mapped_column(String(100), nullable=True)

    subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    descuento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    gravado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ingtasa_0: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    desc_tasa_0: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    subtasa_0: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    iva: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    propina: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pago_proveedor: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<FacturacionTablaFormaPagoDetalle periodo={self.periodo} tabla={self.tabla_origen} cuenta={self.cuenta}>"
