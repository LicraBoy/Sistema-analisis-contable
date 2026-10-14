"""
AmarreCostoPeriodo — snapshot mensual del "Amarre de Costo de Ventas"
(módulo Inventarios). Cada fila representa un periodo (`YYYY-MM`) y se va
llenando incrementalmente conforme se sube cada uno de los 12 archivos
fuente (balanza, 4 conteos físicos, 2 reportes de salidas, 5 de entradas) —
ver `services/amarre_costo_parsing.py`. Los campos marcados como "hueco"
(nullable, sin default calculado) son huecos reales sin fuente en ningún
reporte de origen (confirmado contra datos reales de agosto 2026): nunca se
recalculan al re-subir un archivo, solo se editan vía
`PATCH /amarre-costo/{periodo}/manual`.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AmarreCostoPeriodo(Base):
    __tablename__ = "amarre_costo_periodo"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    periodo: Mapped[str] = mapped_column(String(7), nullable=False, unique=True, index=True)  # "YYYY-MM"

    # ── Inventario Inicial (Amarre COSTO C18:C23) — Saldo Ant de 1BALANZA
    inv_inicial_alm_gral: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)          # cuenta 1007101
    inv_inicial_tienda: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)             # cuenta 1007102
    inv_inicial_restaurant: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)         # cuenta 1007103.001
    inv_inicial_bar: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)                # cuenta 1007103.002
    inv_inicial_cafeteria: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)          # cuenta 1007108

    # ── Inventario Final (Amarre COSTO G34:G39) — Gran Total del conteo físico
    inv_final_alm_gral: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    inv_final_restaurant: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    inv_final_bar: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    inv_final_cafeteria: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    inv_final_tienda: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    inv_final_mantenimiento: Mapped[float | None] = mapped_column(Float, nullable=True)  # HUECO — sin fuente

    # ── Almacén General por concepto (4Resumen INV filas 8:17, 10 conceptos)
    # Guardado también desglosado para poder mostrar "Saldo Real" por rubro
    # en 4Resumen INV, no solo el Gran Total.
    alm_gral_alimentos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_bebidas: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_tabaqueria: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_papeleria: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_higienicos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_medicinas: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_material_mantto: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_stock_mantenimiento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_servicios: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    alm_gral_ropa_uniformes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Tienda por concepto (4Resumen INV filas 20:27, 8 conceptos)
    tienda_alimentos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tienda_bebidas: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tienda_tabaqueria: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tienda_periodicos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tienda_higienicos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tienda_medicinas: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tienda_ropa: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tienda_artesanias: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Cafetería (sin Bebidas — hueco real) y Restaurant-Bar por concepto
    cafeteria_alimentos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cafeteria_souvenirs: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    restaurant_alimentos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    bar_bebidas: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── 2DATOS ENTRYSAL — Despachos/Salidas (D8, D9)
    entrysal_despacho_gasto: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)   # "Total General DESPACHOS..." crudo (U1645)
    entrysal_despacho_centro_costo: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # "Total de DESPACHOS a CENTRO DE COSTO:" crudo (U1644) — D8 real = despacho_gasto - despacho_centro_costo
    entrysal_despacho_mtto: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)    # Mantenimiento

    # ── 2DATOS ENTRYSAL — Sub Totales por departamento (D12, D14:D19)
    entrysal_cafeteria_alimentos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    entrysal_cafeteria_bebidas: Mapped[float | None] = mapped_column(Float, nullable=True)  # HUECO — sin sección en el reporte
    entrysal_souvenirs_cafe: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    entrysal_carreta_alimentos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    entrysal_carreta_bebidas: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    entrysal_restaurant: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    entrysal_palapa_bar: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    entrysal_tienda: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── 2DATOS ENTRYSAL — Entradas por almacén (D30:H34): Subtotal/Descuento/IVA/Total
    ent_cafeteria_subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_cafeteria_descuento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_cafeteria_iva: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_cafeteria_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_alm_gral_subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_alm_gral_descuento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_alm_gral_iva: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_alm_gral_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_mtto_subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_mtto_descuento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_mtto_iva: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_mtto_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_rest_subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_rest_descuento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_rest_iva: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_rest_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_tienda_subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_tienda_descuento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_tienda_iva: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ent_tienda_total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── Saldo Contable (4Resumen INV col E) — Saldo Actual de 1BALANZA, por almacén
    saldo_contable_alm_gral: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    saldo_contable_tienda: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    saldo_contable_cafeteria: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    saldo_contable_restaurant: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    saldo_contable_bar: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # ── 4Resumen INV — huecos manuales sin fuente
    resumen_lavanderia: Mapped[float | None] = mapped_column(Float, nullable=True)   # Fichas de Lavandería

    # ── Metadatos de auditoría de carga (qué archivos ya se subieron este periodo)
    archivos_cargados: Mapped[str] = mapped_column(String(500), nullable=False, default="")  # lista separada por comas

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    renglones_consignacion: Mapped[list["AmarreCostoConsignacionRenglon"]] = relationship(
        back_populates="periodo_obj", cascade="all, delete-orphan"
    )
    archivos_originales: Mapped[list["AmarreCostoArchivoOriginal"]] = relationship(
        back_populates="periodo_obj", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<AmarreCostoPeriodo periodo={self.periodo}>"


class AmarreCostoConsignacionRenglon(Base):
    """
    Renglones de la tabla "Mercancía en Consignación / No Forma Parte del
    Inventario" de Amarre COSTO — lista de longitud variable (confirmado
    ~9 renglones reales: Consignación/Tabaquería varios, Tarjetas Ladatel,
    Fichas), cada uno concepto + monto capturado a mano. Se suman para
    alimentar "4Resumen INV" → Mercancía en Consignación.
    """

    __tablename__ = "amarre_costo_consignacion_renglon"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    periodo_id: Mapped[int] = mapped_column(ForeignKey("amarre_costo_periodo.id", ondelete="CASCADE"), nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    concepto: Mapped[str] = mapped_column(String(255), nullable=False)
    monto: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    periodo_obj: Mapped["AmarreCostoPeriodo"] = relationship(back_populates="renglones_consignacion")

    def __repr__(self) -> str:
        return f"<AmarreCostoConsignacionRenglon concepto={self.concepto} monto={self.monto}>"


class AmarreCostoArchivoOriginal(Base):
    """
    Uno por cada archivo crudo de Novohit subido en un periodo (uno de
    TIPOS_VALIDOS en `api/amarre_costo.py`, unique junto con `periodo_id`).
    Guardado además de parsearse (ver `services/amarre_costo_storage.py`)
    para poder regenerar el clon completo del libro maestro con fórmulas
    vivas (`services/amarre_costo_workbook.py`), que pega cada archivo tal
    cual en su propia hoja — no alcanza con los valores ya extraídos.
    """

    __tablename__ = "amarre_costo_archivo_original"
    __table_args__ = (UniqueConstraint("periodo_id", "tipo", name="uq_amarre_costo_archivo_periodo_tipo"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    periodo_id: Mapped[int] = mapped_column(ForeignKey("amarre_costo_periodo.id", ondelete="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    nombre_original: Mapped[str] = mapped_column(String(255), nullable=False)
    ruta_relativa: Mapped[str] = mapped_column(String(500), nullable=False)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    periodo_obj: Mapped["AmarreCostoPeriodo"] = relationship(back_populates="archivos_originales")

    def __repr__(self) -> str:
        return f"<AmarreCostoArchivoOriginal tipo={self.tipo} ruta={self.ruta_relativa}>"
