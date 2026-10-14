"""
CatalogoProducto model — catálogo maestro de productos/recetas (módulo
"Catálogo de costeo de recetas y ventas"), independiente del flujo de
Ingresos/Pagos/Conciliación/Facturación/Pagos de Recepción.

Se sube un único Excel de catálogo por punto de venta; al subir uno nuevo
se reemplaza todo el contenido existente (no hay periodo/fecha — es un
catálogo vigente, no un histórico). `punto_venta` ya queda como columna
propia para cuando se sumen más puntos de venta además de "restaurante".
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CatalogoProducto(Base):
    __tablename__ = "catalogo_productos"
    __table_args__ = (
        Index("ix_catalogo_punto_venta_grupo", "punto_venta", "grupo"),
        Index("ix_catalogo_categoria_grupo", "categoria_tipo", "grupo"),
        Index("ix_catalogo_seccion_categoria", "seccion_menu", "categoria_tipo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    punto_venta: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    grupo: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    nombre_producto: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    categoria_tipo: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    seccion_menu: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    dia_tematica: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    evento_especial: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    costo: Mapped[float | None] = mapped_column(Float, nullable=True)
    precio_venta: Mapped[float | None] = mapped_column(Float, nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<CatalogoProducto punto_venta={self.punto_venta} grupo={self.grupo} producto={self.nombre_producto}>"
