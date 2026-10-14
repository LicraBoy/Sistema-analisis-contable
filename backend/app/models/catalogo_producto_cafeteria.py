"""
CatalogoProductoCafeteria — catálogo maestro de productos de Cafetería,
módulo independiente de `catalogo_producto.py` (restaurante). Mismo formato
de Excel de origen (columnas B/C/G/K/O/Q desde la fila 6), pero grupos y
productos completamente distintos a los del restaurante — no comparte tabla
ni clasificación con él.

Paso 1 (este modelo): solo el catálogo agrupado por `grupo`, sin
`categoria_tipo`/`seccion_menu`/`dia_tematica`/`evento_especial` — esos se
agregarán en un paso posterior, cuando se conozcan los grupos reales de
cafetería (igual que en el restaurante, que tampoco los tuvo desde el
inicio).

Se sube un único Excel por carga; al subir uno nuevo se reemplaza todo el
contenido existente (no hay periodo/fecha — catálogo vigente, no histórico).
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CatalogoProductoCafeteria(Base):
    __tablename__ = "catalogo_productos_cafeteria"
    __table_args__ = (
        Index("ix_catalogo_cafeteria_punto_venta_grupo", "punto_venta", "grupo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    punto_venta: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    grupo: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    nombre_producto: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    costo: Mapped[float | None] = mapped_column(Float, nullable=True)
    precio_venta: Mapped[float | None] = mapped_column(Float, nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<CatalogoProductoCafeteria punto_venta={self.punto_venta} grupo={self.grupo} producto={self.nombre_producto}>"
