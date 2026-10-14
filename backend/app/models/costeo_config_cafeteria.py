"""
Configuración del Costeo de Recetas — Cafetería. Mismo patrón que
`models/costeo_config.py` (restaurante) pero en tablas propias e
independientes: Cafetería tiene sus propios grupos y su propio IVA/objetivo
de costo, así que un cambio de parámetros de uno no debe afectar al otro, y
no hay riesgo de colisión si algún nombre de grupo coincide entre ambos
catálogos.
"""

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ConfiguracionCosteoCafeteria(Base):
    """Fila por parámetro (clave/valor) — iva_factor, descuento_pct, pct_costo_objetivo, incremento_default."""

    __tablename__ = "configuracion_costeo_cafeteria"

    clave: Mapped[str] = mapped_column(String(50), primary_key=True)
    valor: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<ConfiguracionCosteoCafeteria {self.clave}={self.valor}>"


class CosteoIncrementoGrupoCafeteria(Base):
    """% de incremento de precio sugerido por `grupo` de catalogo_productos_cafeteria."""

    __tablename__ = "costeo_incremento_grupo_cafeteria"

    grupo: Mapped[str] = mapped_column(String(100), primary_key=True)
    pct_incremento: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<CosteoIncrementoGrupoCafeteria grupo={self.grupo} pct_incremento={self.pct_incremento}>"


class CosteoPrecioSugeridoOverrideCafeteria(Base):
    """Ajuste manual del `precio_sugerido` de un producto puntual de Cafetería, ligado a su nombre (mismo criterio que el del restaurante)."""

    __tablename__ = "costeo_precio_sugerido_override_cafeteria"

    nombre_producto: Mapped[str] = mapped_column(String(255), primary_key=True)
    precio_sugerido: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<CosteoPrecioSugeridoOverrideCafeteria nombre_producto={self.nombre_producto} precio_sugerido={self.precio_sugerido}>"
