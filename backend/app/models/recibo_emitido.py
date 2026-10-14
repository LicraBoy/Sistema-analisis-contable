"""
ReciboEmitidoDetalle model — totales financieros por cuenta cerrada (módulo
"Catálogo de Productos", Restaurante, "Inteligencia de Negocio" Fase 1).

⚠️ Nombre de archivo idéntico a uno *no relacionado* que ya usa el módulo de
Facturación (`services/facturacion.py`, `combinar_formas_pago_y_recibos*`) —
ese archivo no tiene modelo/tabla propia (es solo un merge de DataFrames) y
sus columnas no tienen nada que ver con las de aquí; no confundir ni
reusar ningún parser entre los dos.

Una fila por cuenta cerrada, con sus totales — no hay detalle de producto
aquí (eso lo cubre Comandas Emitidas). El archivo real trae, además de las
filas de cuenta, filas de "desglose por tipo de producto" intercaladas
(Tipo=ALIMENTOS/BEBIDAS con solo `Subtotal Tipo Producto` lleno y todo lo
demás vacío, incluida `Cuenta`) — esas se descartan al parsear
(`services/recibos_emitidos.py`), esta tabla solo guarda las filas de
cuenta real.

A diferencia de Comandas Emitidas, `turno` NO se calcula aquí: se toma tal
cual de la columna `Turno` del propio archivo (ya viene clasificado por el
POS), solo normalizando texto (`services/turnos.py::normalizar_turno_pos`).

`pagada` se guarda como texto crudo — confirmado contra archivo real que NO
es un booleano, es el nombre de una persona (cajera/responsable de la
cuenta, ej. "SALAS, ANA PAOLA"), no "sí/no" como se asumió inicialmente.

`cuenta` es texto "<numero>/<codigo>" (ej. "450913/9A*506D") — el mismo
número inicial es el `cuenta` plano que trae Comandas Emitidas; ver nota en
`models/comanda_emitida.py` sobre el join futuro entre ambas tablas.
"""

from datetime import date, datetime, time, timezone

from sqlalchemy import DateTime, Date, Float, Index, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReciboEmitidoDetalle(Base):
    __tablename__ = "recibos_emitidos_detalle"
    __table_args__ = (
        Index("ix_recibos_fecha_turno", "fecha", "turno"),
        Index("ix_recibos_fecha_cuenta", "fecha", "cuenta"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora: Mapped[time] = mapped_column(Time, nullable=False)
    turno: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    pos: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cuenta: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    factura: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pagada: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tipo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    room_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    num_cubiertos: Mapped[int | None] = mapped_column(Integer, nullable=True)

    subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    descuento: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tax: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    room_serv: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    servicio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    propina: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    subtotal_tipo_producto: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    segmento: Mapped[str | None] = mapped_column(String(100), nullable=True)
    clientes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    fila_excel: Mapped[int | None] = mapped_column(Integer, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<ReciboEmitidoDetalle fecha={self.fecha} turno={self.turno} cuenta={self.cuenta}>"
