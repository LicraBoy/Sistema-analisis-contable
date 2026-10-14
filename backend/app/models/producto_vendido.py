"""
ProductoVendidoDetalle model — detalle de ventas reales por producto (módulo
"Productos Vendidos", Fase 2 de Catálogo de Productos), independiente del
flujo de Ingresos/Pagos/Conciliación/Facturación/Pagos de Recepción.

Se sube un reporte "Productos Vendidos" del POS por lote (un día, una
semana o un mes — lo que cubra el archivo, elegido por el usuario vía
`fecha_desde`/`fecha_hasta`); a diferencia del propio Catálogo de Productos
(vigente, sin historial), aquí sí se guarda historial por lote, porque la
idea es poder revisar/comparar periodos ya cerrados más adelante.
`categoria_tipo`/`seccion_menu` se heredan del Catálogo de Productos por
nombre de producto al momento de subir el archivo (no se recalculan
después si el catálogo cambia).

El archivo de origen no trae una columna de fecha por fila (a diferencia
de Comandas Emitidas/Recibos Emitidos) — solo un rango "Desde/Hasta" en el
título del reporte que aplica a todas sus filas por igual. Por eso
`fecha_desde`/`fecha_hasta` describen el lote completo, no cada fila
individual, y el reemplazo al volver a subir es por **solape de rango**
(ver `api/productos_vendidos.py`): dos lotes guardados nunca se traslapan,
así que `fecha_desde` por sí solo ya es una llave única de lote.
"""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProductoVendidoDetalle(Base):
    __tablename__ = "productos_vendidos_detalle"
    __table_args__ = (
        Index("ix_productos_vendidos_fecha_desde_grupo", "fecha_desde", "grupo"),
        Index("ix_productos_vendidos_fecha_desde_categoria", "fecha_desde", "categoria_tipo"),
        Index("ix_productos_vendidos_fecha_desde_seccion", "fecha_desde", "seccion_menu"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    fecha_desde: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    fecha_hasta: Mapped[date] = mapped_column(Date, nullable=False, index=True)
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
    seccion_menu: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    producto_catalogo_encontrado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Costo/Precio de Venta del Catálogo (estándar de receta) del producto
    # matcheado — deliberadamente separados de `costo`/`precio_venta` de
    # arriba (que son los que trae el Excel de ventas ese mes, con su
    # propia variación real) para poder calcular "% costo" con el mismo
    # criterio que el motor de Costeo, sin perder ninguno de los dos datos.
    costo_catalogo: Mapped[float | None] = mapped_column(Float, nullable=True)
    precio_venta_catalogo: Mapped[float | None] = mapped_column(Float, nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<ProductoVendidoDetalle fecha_desde={self.fecha_desde} grupo={self.grupo} producto={self.nombre_producto}>"
