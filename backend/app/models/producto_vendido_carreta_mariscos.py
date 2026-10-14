"""
ProductoVendidoDetalleCarretaMariscos model — igual criterio que
ProductoVendidoDetalle (models/producto_vendido.py, Restaurante), pero para
La Carreta de Mariscos. Tiene `categoria_tipo` (el Catálogo de Carreta de
Mariscos sí lo clasifica) pero NO `seccion_menu` (ese catálogo no lo
tiene) — la navegación de este POS queda en 3 niveles (Categoría → Grupo →
Tabla) en vez de los 4 de Restaurante.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProductoVendidoDetalleCarretaMariscos(Base):
    __tablename__ = "productos_vendidos_detalle_carreta_mariscos"
    __table_args__ = (
        Index("ix_productos_vendidos_carreta_periodo_grupo", "periodo", "grupo"),
        Index("ix_productos_vendidos_carreta_periodo_categoria", "periodo", "categoria_tipo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    periodo: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    punto_venta: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    grupo: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    nombre_producto: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    costo: Mapped[float | None] = mapped_column(Float, nullable=True)
    precio_venta: Mapped[float | None] = mapped_column(Float, nullable=True)
    cantidad: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_costo: Mapped[float | None] = mapped_column(Float, nullable=True)
    descuento: Mapped[float | None] = mapped_column(Float, nullable=True)
    subtotal: Mapped[float | None] = mapped_column(Float, nullable=True)
    impuesto: Mapped[float | None] = mapped_column(Float, nullable=True)
    total: Mapped[float | None] = mapped_column(Float, nullable=True)

    categoria_tipo: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    producto_catalogo_encontrado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    costo_catalogo: Mapped[float | None] = mapped_column(Float, nullable=True)
    precio_venta_catalogo: Mapped[float | None] = mapped_column(Float, nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<ProductoVendidoDetalleCarretaMariscos periodo={self.periodo} grupo={self.grupo} producto={self.nombre_producto}>"
