"""
ProductoVendidoDetalleCafeteria model — igual criterio que ProductoVendidoDetalle
(models/producto_vendido.py, Restaurante), pero para Cafetería. Sin
`categoria_tipo`/`seccion_menu`: el Catálogo de Productos de Cafetería
(CatalogoProductoCafeteria) todavía no tiene esa clasificación, así que no
hay nada que heredar — la navegación de este POS se queda en 2 niveles
(Grupo → Tabla) en vez de los 4 de Restaurante.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProductoVendidoDetalleCafeteria(Base):
    __tablename__ = "productos_vendidos_detalle_cafeteria"
    __table_args__ = (
        Index("ix_productos_vendidos_cafeteria_periodo_grupo", "periodo", "grupo"),
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

    producto_catalogo_encontrado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Costo/Precio de Venta del Catálogo (estándar de receta) del producto
    # matcheado — separados de `costo`/`precio_venta` de arriba (los que
    # trae el Excel de ventas ese mes), mismo criterio que Restaurante.
    costo_catalogo: Mapped[float | None] = mapped_column(Float, nullable=True)
    precio_venta_catalogo: Mapped[float | None] = mapped_column(Float, nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<ProductoVendidoDetalleCafeteria periodo={self.periodo} grupo={self.grupo} producto={self.nombre_producto}>"
