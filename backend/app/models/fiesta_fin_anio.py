"""
Módulo Fiesta de Fin de Año — venta de boletos por mesa/silla con croquis.

Reemplaza al Excel "CROQUIS RESERV FIN DE AÑO" (una hoja por mesa). Una
reservación agrupa varias sillas de un mismo cliente y cualquier número de
pagos. Una silla solo puede estar en UNA reservación activa a la vez (índice
único parcial `uq_fiesta_silla_activa`), lo que impide la doble venta aunque
dos cajas capturen al mismo tiempo.
"""

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class FiestaEvento(Base):
    __tablename__ = "fiesta_evento"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    anio: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    fecha_evento: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Ventas con fecha <= corte_preventa usan precio de preventa; después, normal.
    corte_preventa: Mapped[date | None] = mapped_column(Date, nullable=True)
    iva_factor: Mapped[float] = mapped_column(Float, nullable=False, default=1.16)
    propina_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.15)
    # Total de pagos según contabilidad al día; se compara contra lo cobrado.
    total_contabilidad_al_dia: Mapped[float | None] = mapped_column(Float, nullable=True)
    # PIN del supervisor (salt$hash, PBKDF2). NULL = aún sin configurar: las acciones sensibles quedan abiertas.
    pin_supervisor_hash: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Texto al pie de la confirmación que se manda al cliente (datos de depósito, políticas, contacto).
    mensaje_confirmacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)

    precios: Mapped[list["FiestaPrecio"]] = relationship(back_populates="evento", cascade="all, delete-orphan")
    mesas: Mapped[list["FiestaMesa"]] = relationship(back_populates="evento", cascade="all, delete-orphan")


class FiestaPrecio(Base):
    __tablename__ = "fiesta_precio"
    __table_args__ = (UniqueConstraint("evento_id", "tipo", name="uq_fiesta_precio_evento_tipo"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("fiesta_evento.id"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)  # "adulto" | "nino" | "cortesia"
    precio_preventa: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    precio_normal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    evento: Mapped[FiestaEvento] = relationship(back_populates="precios")


class FiestaMesa(Base):
    __tablename__ = "fiesta_mesa"
    __table_args__ = (UniqueConstraint("evento_id", "numero", name="uq_fiesta_mesa_evento_numero"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("fiesta_evento.id"), nullable=False, index=True)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    zona: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Posición en el croquis, en unidades de cuadrícula (el frontend las escala).
    x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    capacidad: Mapped[int] = mapped_column(Integer, nullable=False, default=10)

    evento: Mapped[FiestaEvento] = relationship(back_populates="mesas")
    sillas: Mapped[list["FiestaSilla"]] = relationship(
        back_populates="mesa", cascade="all, delete-orphan", order_by="FiestaSilla.numero"
    )


class FiestaSilla(Base):
    __tablename__ = "fiesta_silla"
    __table_args__ = (UniqueConstraint("mesa_id", "numero", name="uq_fiesta_silla_mesa_numero"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mesa_id: Mapped[int] = mapped_column(ForeignKey("fiesta_mesa.id"), nullable=False, index=True)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    # Silla fuera de venta: solo el supervisor (PIN) la bloquea o la habilita.
    bloqueada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    bloqueo_motivo: Mapped[str | None] = mapped_column(String(255), nullable=True)

    mesa: Mapped[FiestaMesa] = relationship(back_populates="sillas")


class FiestaReservacion(Base):
    __tablename__ = "fiesta_reservacion"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("fiesta_evento.id"), nullable=False, index=True)
    cliente: Mapped[str] = mapped_column(String(255), nullable=False)
    telefono_o_cuarto: Mapped[str | None] = mapped_column(String(80), nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Permiso para respetar el precio de preventa aunque la fecha de venta ya pasó el corte.
    preventa_autorizada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    preventa_autorizada_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    preventa_motivo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Las cortesías las autoriza un supervisor y siempre llevan motivo.
    cortesia_motivo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cortesia_autorizada_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fecha_venta: Mapped[date] = mapped_column(Date, nullable=False)
    capturado_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    estatus: Mapped[str] = mapped_column(String(10), nullable=False, default="activa")  # "activa" | "cancelada"
    motivo_cancelacion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cancelado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)

    sillas: Mapped[list["FiestaReservacionSilla"]] = relationship(
        back_populates="reservacion", cascade="all, delete-orphan"
    )
    pagos: Mapped[list["FiestaPago"]] = relationship(
        back_populates="reservacion", cascade="all, delete-orphan", order_by="FiestaPago.fecha"
    )
    devoluciones: Mapped[list["FiestaDevolucion"]] = relationship(
        back_populates="reservacion", cascade="all, delete-orphan", order_by="FiestaDevolucion.fecha"
    )
    solicitudes_cortesia: Mapped[list["FiestaSolicitudCortesia"]] = relationship(
        back_populates="reservacion", cascade="all, delete-orphan", order_by="FiestaSolicitudCortesia.id"
    )


class FiestaReservacionSilla(Base):
    __tablename__ = "fiesta_reservacion_silla"
    __table_args__ = (
        # Una silla solo puede estar en una reservación activa a la vez.
        Index(
            "uq_fiesta_silla_activa",
            "silla_id",
            unique=True,
            sqlite_where=text("activa = 1"),
            postgresql_where=text("activa"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    reservacion_id: Mapped[int] = mapped_column(ForeignKey("fiesta_reservacion.id"), nullable=False, index=True)
    silla_id: Mapped[int] = mapped_column(ForeignKey("fiesta_silla.id"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)  # "adulto" | "nino" | "cortesia"
    # Precio congelado al vender: cambiar la tabla de precios no altera ventas hechas.
    precio_aplicado: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    preventa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # se vendió a precio de preventa
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    reservacion: Mapped[FiestaReservacion] = relationship(back_populates="sillas")
    silla: Mapped[FiestaSilla] = relationship()


class FiestaPago(Base):
    __tablename__ = "fiesta_pago"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    reservacion_id: Mapped[int] = mapped_column(ForeignKey("fiesta_reservacion.id"), nullable=False, index=True)
    referencia: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    importe: Mapped[float] = mapped_column(Float, nullable=False)
    forma_pago: Mapped[str | None] = mapped_column(String(30), nullable=True)
    capturado_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    cancelado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Sillas (ids separados por coma) a las que se aplica el abono; NULL = toda la reservación (cascada).
    silla_ids: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # JSON {silla_id: importe}: lo que este abono puso en cada silla. NULL = abono antiguo (se reparte al leer).
    reparto: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Agrupa los pagos de un mismo cobro con varias formas de pago (efectivo + tarjeta…): cuentan como UN Pago N.
    cobro_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)

    reservacion: Mapped[FiestaReservacion] = relationship(back_populates="pagos")


class FiestaSolicitudCortesia(Base):
    """Aviso a un supervisor/administrador: una cajera apartó sillas de cortesía y falta que se autoricen.

    Mientras está `pendiente` las sillas quedan apartadas sin cobro; al aprobar quedan como cortesía; al rechazar se
    liberan (y si la reservación se queda sin sillas, se cancela). Un supervisor que da la cortesía la autoriza solo.
    """

    __tablename__ = "fiesta_solicitud_cortesia"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    reservacion_id: Mapped[int] = mapped_column(ForeignKey("fiesta_reservacion.id"), nullable=False, index=True)
    silla_ids: Mapped[str] = mapped_column(String(200), nullable=False)  # ids separados por coma
    motivo: Mapped[str] = mapped_column(String(255), nullable=False)
    estado: Mapped[str] = mapped_column(String(10), nullable=False, default="pendiente", index=True)  # pendiente|aprobada|rechazada
    solicitado_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    resuelto_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    resuelto_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nota_resolucion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)

    reservacion: Mapped[FiestaReservacion] = relationship(back_populates="solicitudes_cortesia")


class FiestaDevolucion(Base):
    """Dinero que se le regresó al cliente (reservación cancelada o con excedente). Resta del cobrado neto."""

    __tablename__ = "fiesta_devolucion"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    reservacion_id: Mapped[int] = mapped_column(ForeignKey("fiesta_reservacion.id"), nullable=False, index=True)
    importe: Mapped[float] = mapped_column(Float, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    forma_pago: Mapped[str | None] = mapped_column(String(30), nullable=True)
    referencia: Mapped[str | None] = mapped_column(String(80), nullable=True)
    motivo: Mapped[str] = mapped_column(String(255), nullable=False)
    capturado_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    autorizado_por: Mapped[str | None] = mapped_column(String(80), nullable=True)
    cancelada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)

    reservacion: Mapped[FiestaReservacion] = relationship(back_populates="devoluciones")


class FiestaPolizaDia(Base):
    """Total que contabilidad registró en póliza para un día (columna "Total s/ póliza contable" de Cobros)."""

    __tablename__ = "fiesta_poliza_dia"
    __table_args__ = (UniqueConstraint("evento_id", "fecha", name="uq_fiesta_poliza_evento_fecha"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("fiesta_evento.id"), nullable=False, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    importe: Mapped[float] = mapped_column(Float, nullable=False)


class FiestaHistorico(Base):
    """Acumulado diario de reservas de ediciones anteriores (comparativo)."""

    __tablename__ = "fiesta_historico"
    __table_args__ = (UniqueConstraint("anio", "fecha", name="uq_fiesta_historico_anio_fecha"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    anio: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    reservados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pagados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    anticipos: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sin_anticipo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cortesias: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Solo se conocen en el cierre de la edición (Resumen del Excel): adultos y niños vendidos.
    adultos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ninos: Mapped[int | None] = mapped_column(Integer, nullable=True)


class FiestaBitacora(Base):
    __tablename__ = "fiesta_bitacora"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evento_id: Mapped[int | None] = mapped_column(ForeignKey("fiesta_evento.id"), nullable=True, index=True)
    accion: Mapped[str] = mapped_column(String(40), nullable=False)
    entidad: Mapped[str] = mapped_column(String(40), nullable=False)
    entidad_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usuario: Mapped[str | None] = mapped_column(String(80), nullable=True)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Auditoría: quién (id), sobre qué reservación/cliente/mesa, qué había antes y qué quedó, y desde dónde.
    usuario_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    reservacion_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    cliente: Mapped[str | None] = mapped_column(String(80), nullable=True)
    mesa: Mapped[int | None] = mapped_column(Integer, nullable=True)
    antes: Mapped[str | None] = mapped_column(Text, nullable=True)
    despues: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)
