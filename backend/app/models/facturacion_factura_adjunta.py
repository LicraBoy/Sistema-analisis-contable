"""
FacturacionFacturaAdjunta model — registro suelto de una factura (XML/PDF
del CFDI) para un día (periodo) del módulo Facturación. Independiente de
FacturacionTablaFormaPagoDetalle: no está ligado a ninguna cuenta de las 7
tablas, solo sirve como constancia de que ese día se facturó algo — un día
puede tener varias (normalmente hasta 4, a veces solo 1), sin límite fijo.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FacturacionFacturaAdjunta(Base):
    __tablename__ = "facturacion_factura_adjunta"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    periodo: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # El archivo vive en disco (services/facturacion.py: guardar_adjunto_factura),
    # aquí solo la ruta relativa + metadata de exhibición — deliberadamente
    # NO el binario: con muchas facturas, un BLOB en SQLite infla el propio
    # archivo .sqlite3 y degrada cada consulta de esta tabla.
    xml_ruta: Mapped[str | None] = mapped_column(String(255), nullable=True)
    xml_nombre_original: Mapped[str | None] = mapped_column(String(255), nullable=True)
    xml_tamano_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_ruta: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_nombre_original: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_tamano_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<FacturacionFacturaAdjunta periodo={self.periodo} id={self.id}>"
