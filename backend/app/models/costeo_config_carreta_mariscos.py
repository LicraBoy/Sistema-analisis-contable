"""
Configuración del Costeo de Recetas — La Carreta de Mariscos. Mismo patrón
que `models/costeo_config_cafeteria.py` pero en tablas propias e
independientes: cada punto de venta tiene sus propios grupos y su propio
IVA/objetivo de costo.
"""

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ConfiguracionCosteoCarretaMariscos(Base):
    """Fila por parámetro (clave/valor) — iva_factor, descuento_pct, pct_costo_objetivo, incremento_default."""

    __tablename__ = "configuracion_costeo_carreta_mariscos"

    clave: Mapped[str] = mapped_column(String(50), primary_key=True)
    valor: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<ConfiguracionCosteoCarretaMariscos {self.clave}={self.valor}>"


class CosteoIncrementoGrupoCarretaMariscos(Base):
    """% de incremento de precio sugerido por `grupo` de catalogo_productos_carreta_mariscos."""

    __tablename__ = "costeo_incremento_grupo_carreta_mariscos"

    grupo: Mapped[str] = mapped_column(String(100), primary_key=True)
    pct_incremento: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<CosteoIncrementoGrupoCarretaMariscos grupo={self.grupo} pct_incremento={self.pct_incremento}>"


class CosteoPrecioSugeridoOverrideCarretaMariscos(Base):
    """Ajuste manual del `precio_sugerido` de un producto puntual de La Carreta de Mariscos, ligado a su nombre."""

    __tablename__ = "costeo_precio_sugerido_override_carreta_mariscos"

    nombre_producto: Mapped[str] = mapped_column(String(255), primary_key=True)
    precio_sugerido: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<CosteoPrecioSugeridoOverrideCarretaMariscos nombre_producto={self.nombre_producto} precio_sugerido={self.precio_sugerido}>"
