"""
Reporte de revisión de producción y ventas de Carnes y Mariscos — inventario
diario de porciones que el porcionador (área de producción) y cocina llenaban
a mano ("FORMATO PORCIONADOR Y COCINA.xlsx", 2 hojas). Independiente de los
demás módulos de Catálogo de Productos.

- `ReporteProduccionRenglon`: catálogo editable de los renglones fijos del
  formato (producto / presentación / gramaje), uno por hoja.
- `ReporteProduccionCaptura`: lo capturado un día en un renglón. La existencia
  final NO se guarda: se calcula en cadena (`inicial + entradas − salidas`, el
  inicial de un día es la existencia final del día previo con captura — ver
  `services/reporte_produccion.py::calcular_cadena_renglon`). `inicial` y
  `conteo_fisico` (= existencia final editada a mano) son correcciones
  opcionales de cualquier día: si se capturan mandan sobre el arrastre. `salidas` es "Salidas a
  cocina" en la hoja porcionador y "Ventas" en cocina.
- `ReporteProduccionDia`: responsable que firma cada hoja y notas del día.
"""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReporteProduccionRenglon(Base):
    __tablename__ = "reporte_produccion_renglones"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    hoja: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # 'porcionador' | 'cocina'
    seccion: Mapped[str] = mapped_column(String(80), nullable=False)
    producto: Mapped[str] = mapped_column(String(160), nullable=False)
    presentacion: Mapped[str | None] = mapped_column(String(160), nullable=True)
    gramaje: Mapped[str | None] = mapped_column(String(40), nullable=True)
    unidad: Mapped[str] = mapped_column(String(20), nullable=False, default="PORCION")
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # producto+presentación normalizados; liga salidas-porcionador con entradas-cocina
    clave_cruce: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    # Rendimiento (hoja PORCIONADOR del libro de inventario): gramaje numérico en kg por unidad capturada y la
    # prueba bruto→limpio de la que sale el factor (factor = prueba_bruto_kg / prueba_limpio_kg; no se guarda).
    # Vacío ≠ 1: sin prueba no se inventa un factor.
    gramaje_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    prueba_bruto_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    prueba_limpio_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    # ¿Es el producto CRUDO que el porcionador limpia? (se descuenta solo con el bruto pesado: "usado en limpieza").
    # None = regla automática (el producto tiene una sola presentación en KG); True/False = decisión del usuario.
    es_crudo: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # ¿Es producto ya LIMPIO que sobra de la limpieza (p. ej. los filetitos de pechuga)? Solo aplica a presentaciones en KG:
    # su cantidad son kg LIMPIOS (se pasan a bruto con el factor del producto) y su movimiento se netea en la
    # producción: las "entradas" son limpio que sobró (cuenta como producido) y las "salidas" son lo que se usó para
    # hacer porciones (se descuenta, porque esas porciones ya estaban contadas).
    es_limpio: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    def __repr__(self) -> str:
        return f"<ReporteProduccionRenglon {self.hoja} {self.producto}/{self.presentacion}>"


class ReporteProduccionCaptura(Base):
    __tablename__ = "reporte_produccion_capturas"
    __table_args__ = (UniqueConstraint("fecha", "renglon_id", name="uq_reporte_produccion_fecha_renglon"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    renglon_id: Mapped[int] = mapped_column(ForeignKey("reporte_produccion_renglones.id"), nullable=False, index=True)
    inicial: Mapped[float | None] = mapped_column(Float, nullable=True)
    entradas: Mapped[float | None] = mapped_column(Float, nullable=True)
    salidas: Mapped[float | None] = mapped_column(Float, nullable=True)
    conteo_fisico: Mapped[float | None] = mapped_column(Float, nullable=True)

    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ReporteProduccionDia(Base):
    __tablename__ = "reporte_produccion_dias"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    responsable_porcionador: Mapped[str | None] = mapped_column(String(120), nullable=True)
    responsable_cocina: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notas: Mapped[str | None] = mapped_column(String(500), nullable=True)

    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ReporteProduccionProductoBase(Base):
    """Precio por kg (bruto) de un producto base (el texto de `producto` de los renglones), para valuar el inventario."""

    __tablename__ = "reporte_produccion_productos_base"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    producto: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    precio_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class ReporteProduccionPesaje(Base):
    """Pesaje de limpieza: lo que el porcionador recibe en bruto y lo que le queda limpio (la diferencia es la merma).

    De ahí sale el factor de rendimiento real del día (Σbruto / Σlimpio) con el que se pasa a bruto lo que se
    produce y lo que queda en inventario. Varios pesajes por producto y día (varias piezas o lotes).
    """

    __tablename__ = "reporte_produccion_pesajes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    producto: Mapped[str] = mapped_column(String(160), nullable=False, index=True)  # producto base de los renglones
    bruto_kg: Mapped[float] = mapped_column(Float, nullable=False)
    limpio_kg: Mapped[float] = mapped_column(Float, nullable=False)

    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
