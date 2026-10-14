"""
ComandaEmitidaDetalle model — detalle de productos ordenados por cuenta
(módulo "Catálogo de Productos", Restaurante), primer archivo con
granularidad de día/hora real de este sistema ("Inteligencia de Negocio",
Fase 1). Independiente de Productos Vendidos (que sigue siendo mensual, sin
fecha) y del flujo de Ingresos/Pagos/Conciliación/Facturación/Pagos de
Recepción.

Se sube el reporte "Comandas Emitidas" del POS, que cubre varios días en un
solo archivo (semanal o mensual); cada fila trae su propia `Fecha`, así que
el reemplazo al volver a subir es por día (ver `api/comandas_emitidas.py`),
no por archivo completo. El archivo no trae turno — se calcula desde `Hora`
(`services/turnos.py`). `grupo`/`categoria_tipo`/`seccion_menu` se heredan
del Catálogo de Productos (Restaurante) por nombre de producto al momento
de subir, igual que en Productos Vendidos — no se recalculan después si el
catálogo cambia.

`cuenta` se guarda como texto (no Integer): en Recibos Emitidos la misma
cuenta aparece como "<numero>/<codigo>" (confirmado con archivo real), y
aquí llega como el número simple ("450957") — guardarlo como texto en
ambas tablas deja listo un join `Comandas.cuenta ==
split(Recibos.cuenta, "/")[0]` para una fase futura, sin migrar tipos.
"""

from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, Index, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ComandaEmitidaDetalle(Base):
    __tablename__ = "comandas_emitidas_detalle"
    __table_args__ = (
        Index("ix_comandas_fecha_turno", "fecha", "turno"),
        Index("ix_comandas_fecha_grupo", "fecha", "grupo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora: Mapped[time] = mapped_column(Time, nullable=False)
    turno: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    mesa: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cuenta: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    producto: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    grupo: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    categoria_tipo: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    seccion_menu: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    producto_catalogo_encontrado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    cantidad: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Texto crudo del archivo, sin filtrar — el único valor confirmado
    # contra un archivo real hasta ahora es "Vendido"; no se ha visto
    # ningún estado de cancelación/anulación todavía, así que no se
    # descarta ninguna fila por este campo.
    estatus: Mapped[str | None] = mapped_column(String(50), nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<ComandaEmitidaDetalle fecha={self.fecha} turno={self.turno} producto={self.producto}>"
