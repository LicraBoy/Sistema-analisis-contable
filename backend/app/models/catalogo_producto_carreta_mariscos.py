"""
CatalogoProductoCarretaMariscos — catálogo maestro de productos de La
Carreta de Mariscos, módulo independiente de `catalogo_producto.py`
(restaurante) y de `catalogo_producto_cafeteria.py`. Mismo formato de Excel
de origen (columnas B/C/G/K/O/Q desde la fila 6), pero grupos y productos
propios — no comparte tabla ni clasificación con los otros dos puntos de
venta.

Sí tiene `categoria_tipo` (Alimentos/Bebidas/Otros, derivada de la columna
`tipo` del Excel con el mismo clasificador tolerante que el restaurante,
copiado en `services/catalogo_productos_carreta_mariscos.py`) — para
identificar mejor los grupos al navegar el catálogo y para poder costear
por categoría. Sin `seccion_menu`/`dia_tematica`/`evento_especial` (esos
conceptos son específicos de las secciones de menú del restaurante).

Se sube un único Excel por carga; al subir uno nuevo se reemplaza todo el
contenido existente (no hay periodo/fecha — catálogo vigente, no histórico).
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CatalogoProductoCarretaMariscos(Base):
    __tablename__ = "catalogo_productos_carreta_mariscos"
    __table_args__ = (
        Index("ix_catalogo_carreta_mariscos_punto_venta_grupo", "punto_venta", "grupo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    punto_venta: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    grupo: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    nombre_producto: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    categoria_tipo: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    costo: Mapped[float | None] = mapped_column(Float, nullable=True)
    precio_venta: Mapped[float | None] = mapped_column(Float, nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<CatalogoProductoCarretaMariscos punto_venta={self.punto_venta} grupo={self.grupo} producto={self.nombre_producto}>"
