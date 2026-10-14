"""
Configuración del módulo de Costeo de Recetas — parámetros de negocio
editables (IVA, % descuento, % costo objetivo, % incremento por grupo), no
productos. Vive junto a `catalogo_productos` (mismo módulo "Catálogo de
costeo de recetas y ventas") pero en tablas separadas y chicas: conceptos
de configuración estrechamente relacionados, agrupados en un solo archivo
en vez de uno por tabla.

Todos los campos calculados de costeo (% costo, precio sugerido, etc.) se
computan en `services/costeo_recetas.py` a partir de estos parámetros y de
`CatalogoProducto.costo`/`precio_venta` — nunca se guardan, para que no se
desincronicen si el catálogo o la configuración cambian. La única excepción
es `CosteoPrecioSugeridoOverride`: un ajuste manual explícito del usuario
sobre el `precio_sugerido` de un producto puntual (cuando el resultado de
la fórmula no le convence), que sí se guarda — y a propósito se guarda
ligado al *nombre* del producto, no a su id: cada carga de un Excel nuevo
borra y vuelve a crear todos los productos de `catalogo_productos` con ids
nuevos, así que un ajuste ligado a un id se perdería solo en la siguiente
carga.
"""

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ConfiguracionCosteo(Base):
    """Fila por parámetro (clave/valor) — iva_factor, descuento_pct, pct_costo_objetivo, incremento_default."""

    __tablename__ = "configuracion_costeo"

    clave: Mapped[str] = mapped_column(String(50), primary_key=True)
    valor: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<ConfiguracionCosteo {self.clave}={self.valor}>"


class CosteoIncrementoGrupo(Base):
    """% de incremento de precio sugerido por `grupo` de catalogo_productos (no hay FK: grupo es texto libre, igual que en CatalogoProducto)."""

    __tablename__ = "costeo_incremento_grupo"

    grupo: Mapped[str] = mapped_column(String(100), primary_key=True)
    pct_incremento: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<CosteoIncrementoGrupo grupo={self.grupo} pct_incremento={self.pct_incremento}>"


class CosteoPrecioSugeridoOverride(Base):
    """Ajuste manual del `precio_sugerido` de un producto puntual, ligado a su nombre (ver docstring del módulo)."""

    __tablename__ = "costeo_precio_sugerido_override"

    nombre_producto: Mapped[str] = mapped_column(String(255), primary_key=True)
    precio_sugerido: Mapped[float] = mapped_column(Float, nullable=False)

    def __repr__(self) -> str:
        return f"<CosteoPrecioSugeridoOverride nombre_producto={self.nombre_producto} precio_sugerido={self.precio_sugerido}>"
