"""
Fiesta de Fin de Año — router. Venta de boletos por mesa/silla con croquis
interactivo (reemplaza al Excel "CROQUIS RESERV FIN DE AÑO"). Las reglas de
negocio (precios, estados, resumen, cobros) viven en
`services/fiesta_fin_anio.py`; aquí solo se consulta y se persiste.

Una silla solo puede estar en una reservación activa a la vez: se valida antes
de guardar y, como respaldo ante dos cajas capturando a la vez, lo garantiza el
índice único parcial `uq_fiesta_silla_activa` (responde 409).
"""

import io
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.permisos import requiere_capacidad, tiene_capacidad
from app.services.fiesta_auditoria import GRUPOS as GRUPOS_AUDITORIA, clasificar, fila_a_dict, pares_de_grupo
from app.core.security import autorizo_por, consumir_autorizacion, get_current_user, ip_actual, usuario_actual
from app.db.session import get_db
from app.models import (
    FiestaBitacora,
    FiestaDevolucion,
    FiestaEvento,
    FiestaHistorico,
    FiestaMesa,
    FiestaPago,
    FiestaPolizaDia,
    FiestaPrecio,
    FiestaReservacion,
    FiestaReservacionSilla,
    FiestaSilla,
    FiestaSolicitudCortesia,
)
from app.services.fiesta_fin_anio import (
    calcular_por_devolver,
    calcular_reservacion,
    conciliar_contabilidad,
    construir_cobros,
    construir_cobros_diarios,
    construir_resumen,
    desglose_fiscal,
    es_preventa,
    es_silla_extra,
    estado_silla,
    MAX_SILLAS_MESA,
    distribuir_abono,
    mesas_semilla,
    precio_aplicable,
    repartir_pagos_por_silla,
    resumir_pagos_historicos,
)

logger = logging.getLogger(__name__)

from app.services.fiesta_fin_anio_historico import HISTORICO  # noqa: E402
from app.services.fiesta_fin_anio_historico_pagos import HISTORICO_PAGOS, NINOS_ESPERADOS, TIPOS_CON_DINERO  # noqa: E402

router = APIRouter()

TipoBoleto = Literal["adulto", "nino", "cortesia"]

# Los montos no se siembran: el usuario captura los precios del año en Configuración.
PRECIOS_INICIALES = {"adulto": (0.0, 0.0), "nino": (0.0, 0.0), "cortesia": (0.0, 0.0)}


# ── Esquemas de entrada ─────────────────────────────────────────────────────


class SillaIn(BaseModel):
    silla_id: int
    tipo: TipoBoleto


class PagoIn(BaseModel):
    importe: float = Field(gt=0)
    fecha: date | None = None
    referencia: str | None = Field(default=None, max_length=80)
    forma_pago: str | None = Field(default=None, max_length=30)
    capturado_por: str | None = Field(default=None, max_length=80)
    # Sillas de la reservación a las que se aplica el abono; vacío = toda la reservación (cascada).
    silla_ids: list[int] | None = None


_RE_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validar_telefono_obligatorio(v: str | None) -> str:
    """Teléfono de contacto obligatorio al reservar: al menos 7 dígitos (se aceptan espacios, guiones y +)."""
    v = (v or "").strip()
    if len(re.sub(r"\D", "", v)) < 7:
        raise ValueError("Captura el teléfono del cliente (mínimo 7 dígitos).")
    return v


def _validar_correo_obligatorio(v: str | None) -> str:
    v = _validar_correo(v)
    if not v:
        raise ValueError("Captura el correo del cliente.")
    return v


def _validar_correo(v: str | None) -> str | None:
    """Correo opcional: vacío → None; si viene, formato básico usuario@dominio.ext."""
    v = (v or "").strip()
    if not v:
        return None
    if not _RE_CORREO.match(v):
        raise ValueError("El correo no tiene un formato válido (ej. nombre@correo.com).")
    return v


class PreventaIn(BaseModel):
    """Autorización para respetar el precio de preventa aunque ya pasó el corte."""

    por: str = Field(min_length=3, max_length=80)
    motivo: str = Field(min_length=3, max_length=255)


class ReservacionIn(BaseModel):
    """Para reservar son OBLIGATORIOS el nombre, el teléfono y el correo del cliente."""

    cliente: str = Field(min_length=1, max_length=255)
    telefono_o_cuarto: str = Field(max_length=80)
    correo: str = Field(max_length=255)
    preventa_autorizada: PreventaIn | None = None
    # Si hay sillas de cortesía: motivo obligatorio + autorización de supervisor.
    cortesia_motivo: str | None = Field(default=None, max_length=255)
    notas: str | None = None

    @field_validator("cliente")
    @classmethod
    def _cliente_ok(cls, v):
        v = (v or "").strip()
        if len(v) < 2:
            raise ValueError("Captura el nombre del cliente.")
        return v

    @field_validator("telefono_o_cuarto")
    @classmethod
    def _telefono_ok(cls, v):
        return _validar_telefono_obligatorio(v)

    @field_validator("correo")
    @classmethod
    def _correo_ok(cls, v):
        return _validar_correo_obligatorio(v)

    fecha_venta: date | None = None
    capturado_por: str | None = Field(default=None, max_length=80)
    sillas: list[SillaIn] = Field(min_length=1)
    pago_inicial: PagoIn | None = None


class PagosMultiplesIn(BaseModel):
    """Un cobro con varias formas de pago (p. ej. parte en efectivo y parte con tarjeta)."""

    pagos: list[PagoIn] = Field(min_length=1, max_length=8)


class BloqueoIn(BaseModel):
    """Bloquea (o habilita) sillas: las indicadas o todas las de una mesa. Solo supervisor."""

    bloquear: bool
    silla_ids: list[int] | None = None
    mesa: int | None = None  # número de mesa: afecta a todas sus sillas libres (bloquear) o bloqueadas (habilitar)
    motivo: str | None = Field(default=None, max_length=255)
    capturado_por: str | None = Field(default=None, max_length=80)


class PagoPatch(BaseModel):
    importe: float | None = Field(default=None, gt=0)
    fecha: date | None = None
    referencia: str | None = Field(default=None, max_length=80)
    forma_pago: str | None = Field(default=None, max_length=30)
    capturado_por: str | None = Field(default=None, max_length=80)
    silla_ids: list[int] | None = None  # [] = quitar el destino (toda la reservación)


class PrecioSillaIn(BaseModel):
    """Precio manual de una silla ya vendida (lo autoriza el supervisor con su contraseña)."""

    silla_id: int
    precio: float = Field(ge=0)
    motivo: str = Field(min_length=3, max_length=255)


class ReservacionPatch(BaseModel):
    cliente: str | None = Field(default=None, min_length=1, max_length=255)
    telefono_o_cuarto: str | None = Field(default=None, max_length=80)
    correo: str | None = Field(default=None, max_length=255)
    preventa_autorizada: PreventaIn | None = None  # autoriza (y reprecia sus sillas a preventa)
    quitar_preventa: bool = False  # revoca la autorización
    cortesia_motivo: str | None = Field(default=None, max_length=255)  # obligatorio al agregar/cambiar sillas a cortesía
    notas: str | None = None

    @field_validator("telefono_o_cuarto")
    @classmethod
    def _telefono_no_vacio(cls, v):
        # Si se envía, no puede quedar en blanco (las reservaciones antiguas con "cuarto" siguen editables).
        if v is not None and not v.strip():
            raise ValueError("El teléfono no puede quedar vacío.")
        return v

    @field_validator("correo")
    @classmethod
    def _correo_ok(cls, v):
        if v is not None:
            return _validar_correo_obligatorio(v)  # si se envía: válido y no vacío
        return v

    sillas_agregar: list[SillaIn] = Field(default_factory=list)
    sillas_quitar: list[int] = Field(default_factory=list)  # silla_id
    sillas_cambiar_tipo: list[SillaIn] = Field(default_factory=list)  # silla ya en la reservación + tipo nuevo
    sillas_cambiar_precio: list[PrecioSillaIn] = Field(default_factory=list)  # precio manual (supervisor)
    capturado_por: str | None = Field(default=None, max_length=80)


class EventoIn(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    mensaje_confirmacion: str | None = Field(default=None, max_length=2000)
    fecha_evento: date | None = None
    corte_preventa: date | None = None
    iva_factor: float | None = Field(default=None, gt=0)
    propina_pct: float | None = Field(default=None, ge=0)
    total_contabilidad_al_dia: float | None = None
    limpiar_contabilidad: bool = False  # true → borra total_contabilidad_al_dia


class PrecioIn(BaseModel):
    tipo: TipoBoleto
    precio_preventa: float = Field(ge=0)
    precio_normal: float = Field(ge=0)


class MesaPatch(BaseModel):
    x: float | None = None
    y: float | None = None
    zona: str | None = Field(default=None, max_length=40)
    capacidad: int | None = Field(default=None, ge=1, le=MAX_SILLAS_MESA)


class PosicionIn(BaseModel):
    id: int
    x: float
    y: float


# ── Utilidades ──────────────────────────────────────────────────────────────


# ── Autorización de supervisor ──────────────────────────────────────────────
# Las acciones que cambian precios o preventa exigen una autorización de un solo uso (cabecera X-Autorizacion)
# que un supervisor da con su contraseña (`POST /auth/autorizar`). Quien autorizó queda en la bitácora.
# Con la autenticación apagada (solo desarrollo/pruebas) las acciones quedan abiertas, como antes sin PIN.


def _capturista(texto: str | None) -> str | None:
    """Quién capturó: con login real es el usuario autenticado, no el texto que mande el cliente."""
    actual = usuario_actual.get()
    if settings.auth_enabled and actual is not None:
        return actual.get("nombre") or actual.get("email")
    return texto


def _exigir_supervisor(evento: FiestaEvento, autorizacion: str | None) -> bool:
    """403 si falta la autorización de supervisor o ya no vale. True si se validó una."""
    if not settings.auth_enabled:
        return False
    if not autorizacion:
        raise HTTPException(status_code=403, detail="Esta acción requiere la autorización de un supervisor.")
    datos = consumir_autorizacion(autorizacion)
    actual = usuario_actual.get()
    if datos is None or (actual is not None and datos.get("solicitante") != actual.get("id")):
        raise HTTPException(status_code=403, detail="La autorización de supervisor venció o ya se usó. Pídela de nuevo.")
    autorizo_por.set(datos.get("sup_email"))
    return True


def _es_supervisor() -> bool:
    """¿Quien hace la petición puede autorizar cortesías por sí mismo? (sin login real, como antes, todo abierto)."""
    if not settings.auth_enabled:
        return True
    actual = usuario_actual.get()
    return actual is not None and tiene_capacidad(actual, "fiesta_supervisor")


def _nombre_usuario() -> str | None:
    actual = usuario_actual.get()
    return (actual.get("nombre") or actual.get("email")) if actual else None


async def _evento_activo(db: AsyncSession) -> FiestaEvento:
    res = await db.execute(
        select(FiestaEvento).where(FiestaEvento.activo.is_(True)).order_by(FiestaEvento.anio.desc()).limit(1)
    )
    evento = res.scalar_one_or_none()
    if evento is None:
        raise HTTPException(
            status_code=404,
            detail="No hay evento configurado. Ejecuta POST /fiesta-fin-anio/sembrar para crearlo.",
        )
    return evento


async def _precios(db: AsyncSession, evento_id: int) -> dict[str, tuple[float, float]]:
    res = await db.execute(select(FiestaPrecio).where(FiestaPrecio.evento_id == evento_id))
    return {p.tipo: (p.precio_preventa, p.precio_normal) for p in res.scalars().all()}


def _opciones_reservacion():
    return (
        selectinload(FiestaReservacion.sillas)
        .selectinload(FiestaReservacionSilla.silla)
        .selectinload(FiestaSilla.mesa),
        selectinload(FiestaReservacion.pagos),
        selectinload(FiestaReservacion.devoluciones),
        selectinload(FiestaReservacion.solicitudes_cortesia),
    )


async def _reservaciones_evento(
    db: AsyncSession, evento_id: int, solo_activas: bool = False
) -> list[FiestaReservacion]:
    consulta = (
        select(FiestaReservacion)
        .where(FiestaReservacion.evento_id == evento_id)
        .options(*_opciones_reservacion())
        .order_by(FiestaReservacion.id)
    )
    if solo_activas:
        consulta = consulta.where(FiestaReservacion.estatus == "activa")
    res = await db.execute(consulta)
    return list(res.scalars().all())


async def _cargar_reservacion(db: AsyncSession, reservacion_id: int, evento_id: int) -> FiestaReservacion:
    res = await db.execute(
        select(FiestaReservacion)
        .where(FiestaReservacion.id == reservacion_id, FiestaReservacion.evento_id == evento_id)
        .options(*_opciones_reservacion())
        .execution_options(populate_existing=True)
    )
    reservacion = res.scalar_one_or_none()
    if reservacion is None:
        raise HTTPException(status_code=404, detail="Reservación no encontrada")
    return reservacion


def _calculo(reservacion: FiestaReservacion) -> dict:
    return calcular_reservacion(
        [
            {"tipo": s.tipo, "precio_aplicado": s.precio_aplicado, "activa": s.activa}
            for s in reservacion.sillas
        ],
        [{"importe": p.importe, "cancelado": p.cancelado} for p in reservacion.pagos],
    )


def _ids_a_texto(ids: list[int] | None) -> str | None:
    """Ids de silla → texto para la columna (NULL si no hay destino)."""
    limpios = sorted(set(ids or []))
    return ",".join(str(i) for i in limpios) if limpios else None


def _ids_de_texto(texto: str | None) -> list[int]:
    return [int(x) for x in (texto or "").split(",") if x.strip().isdigit()]


def _reparto_de_texto(texto: str | None) -> dict[int, float]:
    try:
        crudo = json.loads(texto) if texto else {}
    except ValueError:
        return {}
    return {int(k): float(v) for k, v in crudo.items()}


def _reparto_a_texto(reparto: dict[int, float]) -> str | None:
    limpio = {str(k): round(v, 2) for k, v in reparto.items() if v > 0.004}
    return json.dumps(limpio) if limpio else None


def _precio_y_preventa(
    tipo: str,
    fecha_venta: date,
    evento: FiestaEvento,
    precios: dict[str, tuple[float, float]],
    preventa_autorizada: bool,
) -> tuple[float, bool]:
    """Precio de un boleto y si es de preventa; la autorización fuerza preventa pasado el corte."""
    if preventa_autorizada and tipo != "cortesia":
        return precios.get(tipo, (0.0, 0.0))[0], True
    precio = precio_aplicable(tipo, fecha_venta, evento.corte_preventa, precios)
    return precio, es_preventa(fecha_venta, evento.corte_preventa) and tipo != "cortesia"


def _validar_destino_nuevas(sillas: list, ids: list[int]) -> None:
    """Al crear la reservación: el destino del primer abono debe estar entre las sillas que se venden."""
    vendidas = {s.silla_id for s in sillas}
    ajenas = [i for i in ids if i not in vendidas]
    if ajenas:
        raise HTTPException(status_code=400, detail=f"Esas sillas no están en la reservación: {ajenas}")


def _validar_destino(reservacion: FiestaReservacion, ids: list[int] | None) -> None:
    """Las sillas de destino deben estar activas en la reservación (400 si no)."""
    if not ids:
        return
    activas = {s.silla_id for s in reservacion.sillas if s.activa}
    ajenas = [i for i in ids if i not in activas]
    if ajenas:
        raise HTTPException(status_code=400, detail=f"Esas sillas no están activas en la reservación: {ajenas}")


def _reparto_por_silla(reservacion: FiestaReservacion) -> dict[int, dict]:
    """Pagos de la reservación reflejados silla por silla (se derivan al leer, no se guardan)."""
    return repartir_pagos_por_silla(
        [
            {
                "silla_id": s.silla_id,
                "precio_aplicado": s.precio_aplicado,
                "activa": s.activa,
                "orden": (s.silla.mesa.numero, s.silla.numero),
            }
            for s in reservacion.sillas
        ],
        [
            {
                "id": p.id,
                "importe": p.importe,
                "fecha": p.fecha,
                "referencia": p.referencia,
                "forma_pago": p.forma_pago,
                "cobro_id": p.cobro_id,
                "cancelado": p.cancelado,
                "silla_ids": _ids_de_texto(p.silla_ids),
                "reparto": _reparto_de_texto(p.reparto),
            }
            for p in reservacion.pagos
        ],
    )


def _devoluciones_dict(reservacion: FiestaReservacion) -> list[dict]:
    return [{"importe": d.importe, "cancelada": d.cancelada, "fecha": d.fecha} for d in reservacion.devoluciones]


def _solicitud_a_dict(s: FiestaSolicitudCortesia) -> dict:
    return {
        "id": s.id,
        "reservacion_id": s.reservacion_id,
        "silla_ids": _ids_de_texto(s.silla_ids),
        "motivo": s.motivo,
        "estado": s.estado,
        "solicitado_por": s.solicitado_por or "",
        "resuelto_por": s.resuelto_por or "",
        "resuelto_en": s.resuelto_en,
        "nota_resolucion": s.nota_resolucion or "",
        "creado_en": s.creado_en,
    }


def _reservacion_a_dict(reservacion: FiestaReservacion) -> dict:
    calculo = _calculo(reservacion)
    reparto = _reparto_por_silla(reservacion)
    por_autorizar = {
        i for s in reservacion.solicitudes_cortesia if s.estado == "pendiente" for i in _ids_de_texto(s.silla_ids)
    }
    return {
        "cortesias_por_autorizar": sum(
            1 for s in reservacion.sillas if s.activa and s.silla_id in por_autorizar
        ),
        "solicitudes_cortesia": [_solicitud_a_dict(s) for s in reservacion.solicitudes_cortesia],
        "id": reservacion.id,
        "cliente": reservacion.cliente,
        "telefono_o_cuarto": reservacion.telefono_o_cuarto or "",
        "correo": reservacion.correo or "",
        "preventa_autorizada": {
            "activa": bool(reservacion.preventa_autorizada),
            "por": reservacion.preventa_autorizada_por or "",
            "motivo": reservacion.preventa_motivo or "",
        },
        "cortesia": {
            "motivo": reservacion.cortesia_motivo or "",
            "autorizada_por": reservacion.cortesia_autorizada_por or "",
        },
        "notas": reservacion.notas or "",
        "fecha_venta": reservacion.fecha_venta,
        "capturado_por": reservacion.capturado_por or "",
        "estatus": reservacion.estatus,
        "motivo_cancelacion": reservacion.motivo_cancelacion or "",
        **calculo,
        **calcular_por_devolver(calculo["excedente"], _devoluciones_dict(reservacion)),
        "devoluciones": [
            {
                "id": d.id,
                "importe": d.importe,
                "fecha": d.fecha,
                "forma_pago": d.forma_pago or "",
                "referencia": d.referencia or "",
                "motivo": d.motivo,
                "capturado_por": d.capturado_por or "",
                "autorizado_por": d.autorizado_por or "",
                "cancelada": d.cancelada,
            }
            for d in reservacion.devoluciones
        ],
        "sillas": sorted(
            (
                {
                    "silla_id": s.silla_id,
                    "mesa": s.silla.mesa.numero,
                    "silla": s.silla.numero,
                    "tipo": s.tipo,
                    "precio_aplicado": s.precio_aplicado,
                    "preventa": s.preventa,
                    "activa": s.activa,
                    "por_autorizar": s.silla_id in por_autorizar,
                    # Reflejo por silla (Pago 1/2/3, Pagado, Saldo como en la hoja de mesa del Excel)
                    "pagado": reparto.get(s.silla_id, {}).get("pagado", 0.0),
                    "saldo": reparto.get(s.silla_id, {}).get("saldo", 0.0),
                    "estado_pago": reparto.get(s.silla_id, {}).get("estado"),
                    "pagos": reparto.get(s.silla_id, {}).get("pagos", []),
                }
                for s in reservacion.sillas
            ),
            key=lambda d: (not d["activa"], d["mesa"], d["silla"]),
        ),
        "pagos": [
            {
                "id": p.id,
                "referencia": p.referencia or "",
                "fecha": p.fecha,
                "importe": p.importe,
                "forma_pago": p.forma_pago or "",
                "capturado_por": p.capturado_por or "",
                "cancelado": p.cancelado,
                "silla_ids": _ids_de_texto(p.silla_ids),
                "cobro_id": p.cobro_id,
            }
            for p in reservacion.pagos
        ],
    }


def _evento_a_dict(evento: FiestaEvento, precios: dict[str, tuple[float, float]]) -> dict:
    return {
        "id": evento.id,
        "nombre": evento.nombre,
        "anio": evento.anio,
        "fecha_evento": evento.fecha_evento,
        "corte_preventa": evento.corte_preventa,
        "iva_factor": evento.iva_factor,
        "propina_pct": evento.propina_pct,
        "total_contabilidad_al_dia": evento.total_contabilidad_al_dia,
        "mensaje_confirmacion": evento.mensaje_confirmacion or "",
        "precios": [
            {"tipo": tipo, "precio_preventa": preventa, "precio_normal": normal}
            for tipo, (preventa, normal) in sorted(precios.items())
        ],
    }


def _bitacora(
    db: AsyncSession,
    evento: FiestaEvento,
    accion: str,
    entidad: str,
    entidad_id: int | None,
    usuario: str | None,
    detalle: str | None = None,
    *,
    reservacion: FiestaReservacion | None = None,
    antes: dict | None = None,
    despues: dict | None = None,
) -> None:
    """Anexa un renglón a la auditoría de la Fiesta (solo se agrega, nunca se borra ni se edita).

    `reservacion` liga el movimiento a una reservación (cliente y mesa salen de ella); `antes`/`despues` guardan el
    valor anterior y el nuevo como JSON para mostrarlos en la pantalla de Auditoría."""
    actual = usuario_actual.get()
    usuario_id = None
    if settings.auth_enabled and actual is not None:
        usuario = actual.get("nombre") or actual.get("email")  # el usuario real, no el texto que mande el cliente
        usuario_id = actual.get("id")
    autorizo = autorizo_por.get()
    if autorizo:
        detalle = f"{detalle or ''} · autorizó: {autorizo}".strip(" ·")
    cliente = mesa = reservacion_id = None
    if reservacion is not None:
        reservacion_id = reservacion.id
        cliente = (reservacion.cliente or "")[:80] or None
        try:
            vivas = [s for s in reservacion.sillas if s.activa] or list(reservacion.sillas)  # canceladas: sus sillas ya se liberaron
            numeros = sorted({s.silla.mesa.numero for s in vivas})
            mesa = numeros[0] if numeros else None
        except Exception:  # noqa: BLE001 — relaciones sin cargar: la auditoría no debe romper la operación
            mesa = None
    elif entidad == "reservacion" and entidad_id:
        reservacion_id = entidad_id

    def _json(valor: dict | None) -> str | None:
        return json.dumps(valor, ensure_ascii=False, default=str) if valor else None

    db.add(
        FiestaBitacora(
            evento_id=evento.id,
            accion=accion,
            entidad=entidad,
            entidad_id=entidad_id,
            usuario=usuario,
            detalle=detalle,
            usuario_id=usuario_id,
            reservacion_id=reservacion_id,
            cliente=cliente,
            mesa=mesa,
            antes=_json(antes),
            despues=_json(despues),
            ip=ip_actual.get(),
        )
    )


async def _sillas_ocupadas(db: AsyncSession, silla_ids: list[int]) -> dict[int, tuple[int, int, str]]:
    """silla_id → (mesa, silla, cliente) de las que ya están en una reservación activa."""
    if not silla_ids:
        return {}
    res = await db.execute(
        select(FiestaReservacionSilla.silla_id, FiestaMesa.numero, FiestaSilla.numero, FiestaReservacion.cliente)
        .join(FiestaSilla, FiestaSilla.id == FiestaReservacionSilla.silla_id)
        .join(FiestaMesa, FiestaMesa.id == FiestaSilla.mesa_id)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaReservacionSilla.reservacion_id)
        .where(FiestaReservacionSilla.silla_id.in_(silla_ids), FiestaReservacionSilla.activa.is_(True))
    )
    return {silla_id: (mesa, silla, cliente) for silla_id, mesa, silla, cliente in res.all()}


async def _agregar_sillas(
    db: AsyncSession,
    evento: FiestaEvento,
    reservacion: FiestaReservacion,
    sillas: list[SillaIn],
    fecha_venta: date,
) -> None:
    """Valida y agrega sillas a la reservación (409 si alguna ya está tomada)."""
    ids = [s.silla_id for s in sillas]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Hay sillas repetidas en la solicitud.")

    res = await db.execute(
        select(FiestaSilla.id, FiestaMesa.evento_id).join(FiestaMesa, FiestaMesa.id == FiestaSilla.mesa_id)
        .where(FiestaSilla.id.in_(ids))
    )
    del_evento = {silla_id for silla_id, evento_id in res.all() if evento_id == evento.id}
    desconocidas = [i for i in ids if i not in del_evento]
    if desconocidas:
        raise HTTPException(status_code=400, detail=f"Sillas inexistentes en este evento: {desconocidas}")

    ocupadas = await _sillas_ocupadas(db, ids)
    if ocupadas:
        detalle = ", ".join(f"mesa {m} silla {s} ({c})" for m, s, c in ocupadas.values())
        raise HTTPException(status_code=409, detail=f"Ya están ocupadas: {detalle}")
    bloq = await db.execute(
        select(FiestaMesa.numero, FiestaSilla.numero)
        .join(FiestaMesa, FiestaMesa.id == FiestaSilla.mesa_id)
        .where(FiestaSilla.id.in_(ids), FiestaSilla.bloqueada.is_(True))
    )
    bloqueadas = bloq.all()
    if bloqueadas:
        detalle = ", ".join(f"mesa {m} silla {s}" for m, s in bloqueadas)
        raise HTTPException(status_code=409, detail=f"Están bloqueadas (solo el supervisor puede habilitarlas): {detalle}")

    precios = await _precios(db, evento.id)
    for s in sillas:
        precio, preventa = _precio_y_preventa(s.tipo, fecha_venta, evento, precios, bool(reservacion.preventa_autorizada))
        reservacion.sillas.append(
            FiestaReservacionSilla(silla_id=s.silla_id, tipo=s.tipo, precio_aplicado=precio, preventa=preventa, activa=True)
        )


# ── Evento, precios y semilla ───────────────────────────────────────────────


@router.post("/sembrar")
async def sembrar(
    anio: int | None = Query(default=None, ge=2000, le=2100, description="Por defecto, el año en curso"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    Crea (idempotente) el evento del año con precios en 0 (se capturan en
    Configuración) y las 72 mesas con sus sillas (estructura tomada del Excel).
    Lo que ya existe no se toca.
    """
    anio = anio or date.today().year
    res = await db.execute(select(FiestaEvento).where(FiestaEvento.anio == anio))
    evento = res.scalar_one_or_none()
    creado_evento = evento is None
    if evento is None:
        evento = FiestaEvento(
            nombre=f"Fiesta de Fin de Año {anio}",
            anio=anio,
            fecha_evento=date(anio, 12, 31),
            corte_preventa=date(anio, 12, 10),
            iva_factor=1.16,
            propina_pct=0.15,
            activo=True,
        )
        db.add(evento)
        await db.flush()
        for tipo, (preventa, normal) in PRECIOS_INICIALES.items():
            db.add(FiestaPrecio(evento_id=evento.id, tipo=tipo, precio_preventa=preventa, precio_normal=normal))

    n_mesas = (
        await db.execute(select(func.count(FiestaMesa.id)).where(FiestaMesa.evento_id == evento.id))
    ).scalar_one()
    mesas_creadas = sillas_creadas = 0
    if n_mesas == 0:
        for datos in mesas_semilla():
            mesa = FiestaMesa(evento_id=evento.id, **datos)
            mesa.sillas = [FiestaSilla(numero=n) for n in range(1, datos["capacidad"] + 1)]
            db.add(mesa)
            mesas_creadas += 1
            sillas_creadas += datos["capacidad"]

    return {
        "evento_id": evento.id,
        "evento_creado": creado_evento,
        "mesas_creadas": mesas_creadas,
        "sillas_creadas": sillas_creadas,
    }


@router.get("/evento")
async def obtener_evento(db: AsyncSession = Depends(get_db), _user: dict = Depends(get_current_user)):
    evento = await _evento_activo(db)
    return _evento_a_dict(evento, await _precios(db, evento.id))


@router.put("/evento")
async def actualizar_evento(
    datos: EventoIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    evento = await _evento_activo(db)
    cambios = datos.model_dump(exclude_unset=True, exclude={"limpiar_contabilidad"})
    # El corte de preventa y los factores de IVA/propina cambian lo que se cobra: los autoriza el supervisor.
    if any(c in cambios and cambios[c] != getattr(evento, c) for c in ("corte_preventa", "iva_factor", "propina_pct")):
        _exigir_supervisor(evento, autorizacion)
    anulables = {"fecha_evento", "corte_preventa", "total_contabilidad_al_dia"}
    for campo, valor in cambios.items():
        if valor is not None or campo in anulables:
            setattr(evento, campo, valor)
    if datos.limpiar_contabilidad:
        evento.total_contabilidad_al_dia = None
    _bitacora(db, evento, "actualizar", "evento", evento.id, None, str(cambios))
    await db.flush()
    return _evento_a_dict(evento, await _precios(db, evento.id))


@router.put("/precios")
async def actualizar_precios(
    precios: list[PrecioIn],
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    """Los precios nuevos solo aplican a ventas futuras; lo ya vendido conserva su precio. Requiere supervisor."""
    evento = await _evento_activo(db)
    _exigir_supervisor(evento, autorizacion)
    res = await db.execute(select(FiestaPrecio).where(FiestaPrecio.evento_id == evento.id))
    actuales = {p.tipo: p for p in res.scalars().all()}
    for p in precios:
        fila = actuales.get(p.tipo)
        if fila is None:
            db.add(
                FiestaPrecio(
                    evento_id=evento.id, tipo=p.tipo, precio_preventa=p.precio_preventa, precio_normal=p.precio_normal
                )
            )
        else:
            fila.precio_preventa = p.precio_preventa
            fila.precio_normal = p.precio_normal
    _bitacora(db, evento, "actualizar", "precios", None, None, str([p.model_dump() for p in precios]))
    await db.flush()
    return _evento_a_dict(evento, await _precios(db, evento.id))


# ── Mesas y croquis ─────────────────────────────────────────────────────────


@router.get("/mesas")
async def listar_mesas(db: AsyncSession = Depends(get_db), _user: dict = Depends(get_current_user)):
    """Croquis: mesas con sus sillas y el estado de cada una (libre/sin_pago/anticipo/pagada/cortesia)."""
    evento = await _evento_activo(db)
    mesas, totales = await _estado_mesas(db, evento)
    return {"evento": {"id": evento.id, "nombre": evento.nombre, "anio": evento.anio}, "mesas": mesas, "totales": totales}


async def _estado_mesas(db: AsyncSession, evento: FiestaEvento) -> tuple[list[dict], dict]:
    """Mesas con el estado de cada silla (uso interno: incluye cliente y reservación) y totales."""
    reservaciones = await _reservaciones_evento(db, evento.id, solo_activas=True)

    por_silla: dict[int, dict] = {}
    for r in reservaciones:
        estado_reservacion = _calculo(r)["estado"]
        reparto = _reparto_por_silla(r)
        for s in r.sillas:
            if s.activa:
                fila = reparto.get(s.silla_id, {})
                por_silla[s.silla_id] = {
                    "estado": estado_silla(s.tipo, estado_reservacion),
                    "tipo": s.tipo,
                    "reservacion_id": r.id,
                    "cliente": r.cliente,
                    "precio": s.precio_aplicado,
                    "pagado": fila.get("pagado", 0.0),
                    "saldo": fila.get("saldo", 0.0),
                    "estado_pago": fila.get("estado"),
                    "pagos": fila.get("pagos", []),
                }

    res = await db.execute(
        select(FiestaMesa)
        .where(FiestaMesa.evento_id == evento.id)
        .options(selectinload(FiestaMesa.sillas))
        .order_by(FiestaMesa.numero)
    )
    totales = {"libre": 0, "sin_pago": 0, "anticipo": 0, "pagada": 0, "cortesia": 0, "bloqueada": 0}
    mesas = []
    for mesa in res.scalars().all():
        sillas = []
        for silla in mesa.sillas:
            info = por_silla.get(silla.id)
            estado = info["estado"] if info else ("bloqueada" if silla.bloqueada else "libre")
            totales[estado] += 1
            sillas.append(
                {
                    "id": silla.id,
                    "numero": silla.numero,
                    "extra": es_silla_extra(silla.numero),
                    "bloqueada": bool(silla.bloqueada) and info is None,
                    "bloqueo_motivo": (silla.bloqueo_motivo or "") if silla.bloqueada and info is None else "",
                    "estado": estado,
                    "tipo": info["tipo"] if info else None,
                    "reservacion_id": info["reservacion_id"] if info else None,
                    "cliente": info["cliente"] if info else None,
                    "precio": info["precio"] if info else None,
                    "pagado": info["pagado"] if info else None,
                    "saldo": info["saldo"] if info else None,
                    "estado_pago": info["estado_pago"] if info else None,
                    "pagos": info["pagos"] if info else [],
                }
            )
        mesas.append(
            {
                "id": mesa.id,
                "numero": mesa.numero,
                "zona": mesa.zona,
                "x": mesa.x,
                "y": mesa.y,
                "capacidad": mesa.capacidad,
                "libres": sum(1 for s in sillas if s["estado"] == "libre"),
                "sillas": sillas,
            }
        )

    # Las bloqueadas están fuera de venta: no cuentan como lugares disponibles ni como ocupadas.
    capacidad = sum(v for k, v in totales.items() if k != "bloqueada")
    ocupadas = capacidad - totales["libre"]
    return mesas, {
        **totales,
        "capacidad": capacidad,
        "ocupadas": ocupadas,
        "pct_ocupacion": round(ocupadas / capacidad * 100, 1) if capacidad else None,
    }


@router.put("/mesas/posiciones")
async def guardar_posiciones(
    posiciones: list[PosicionIn], db: AsyncSession = Depends(get_db), _user: dict = Depends(get_current_user)
):
    """Guarda de golpe las posiciones del editor de croquis."""
    evento = await _evento_activo(db)
    res = await db.execute(select(FiestaMesa).where(FiestaMesa.evento_id == evento.id))
    mesas = {m.id: m for m in res.scalars().all()}
    for p in posiciones:
        mesa = mesas.get(p.id)
        if mesa is not None:
            mesa.x, mesa.y = p.x, p.y
    _bitacora(db, evento, "reacomodar", "mesas", None, None, f"{len(posiciones)} mesas")
    return {"actualizadas": sum(1 for p in posiciones if p.id in mesas)}


@router.patch("/mesas/{mesa_id}")
async def actualizar_mesa(
    mesa_id: int, datos: MesaPatch, db: AsyncSession = Depends(get_db), _user: dict = Depends(get_current_user)
):
    """Mueve la mesa, cambia su zona o su capacidad (agrega/quita sillas del final)."""
    evento = await _evento_activo(db)
    res = await db.execute(
        select(FiestaMesa)
        .where(FiestaMesa.id == mesa_id, FiestaMesa.evento_id == evento.id)
        .options(selectinload(FiestaMesa.sillas))
    )
    mesa = res.scalar_one_or_none()
    if mesa is None:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")

    cambios = datos.model_dump(exclude_unset=True)
    for campo in ("x", "y", "zona"):
        if campo in cambios and cambios[campo] is not None:
            setattr(mesa, campo, cambios[campo])

    nueva = cambios.get("capacidad")
    if nueva is not None and nueva != len(mesa.sillas):
        if nueva > len(mesa.sillas):
            for n in range(len(mesa.sillas) + 1, nueva + 1):
                mesa.sillas.append(FiestaSilla(numero=n))
        else:
            sobrantes = [s for s in mesa.sillas if s.numero > nueva]
            usadas = (
                await db.execute(
                    select(func.count(FiestaReservacionSilla.id)).where(
                        FiestaReservacionSilla.silla_id.in_([s.id for s in sobrantes])
                    )
                )
            ).scalar_one()
            if usadas:
                raise HTTPException(
                    status_code=409,
                    detail="No se pueden quitar sillas que tienen o tuvieron reservaciones.",
                )
            for s in sobrantes:
                mesa.sillas.remove(s)
        mesa.capacidad = nueva

    _bitacora(db, evento, "actualizar", "mesa", mesa.id, None, str(cambios))
    await db.flush()
    return {"id": mesa.id, "numero": mesa.numero, "x": mesa.x, "y": mesa.y, "zona": mesa.zona, "capacidad": mesa.capacidad}


# ── Reservaciones ───────────────────────────────────────────────────────────


@router.get("/reservaciones")
async def listar_reservaciones(
    estado: str | None = Query(default=None, description="sin_pago | anticipo | pagada | cortesia | cancelada"),
    mesa: int | None = Query(default=None),
    q: str | None = Query(default=None, description="Busca en cliente, teléfono/cuarto y notas"),
    con_saldo: bool = Query(default=False),
    incluir_canceladas: bool = Query(default=False, description="Devuelve también las canceladas (para la pestaña Canceladas)"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    evento = await _evento_activo(db)
    filas = []
    for r in await _reservaciones_evento(db, evento.id):
        d = _reservacion_a_dict(r)
        if estado == "cancelada":
            if r.estatus != "cancelada":
                continue
        elif (r.estatus == "cancelada" and not incluir_canceladas) or (estado and d["estado"] != estado):
            continue
        if mesa is not None and not any(s["mesa"] == mesa and s["activa"] for s in d["sillas"]):
            continue
        if con_saldo and d["saldo"] <= 0:
            continue
        if q:
            texto = f"{d['cliente']} {d['telefono_o_cuarto']} {d['correo']} {d['notas']}".lower()
            if q.lower() not in texto:
                continue
        filas.append(d)
    return {"reservaciones": list(reversed(filas)), "total": len(filas)}


@router.get("/reservaciones/{reservacion_id}")
async def obtener_reservacion(
    reservacion_id: int, db: AsyncSession = Depends(get_db), _user: dict = Depends(get_current_user)
):
    evento = await _evento_activo(db)
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion_id, evento.id))


async def _crear_solicitud_cortesia(
    db: AsyncSession,
    evento: FiestaEvento,
    reservacion: FiestaReservacion,
    motivo: str,
    silla_ids: list[int] | None = None,
) -> FiestaSolicitudCortesia | None:
    """Aparta las sillas de cortesía y avisa a los supervisores (aparece en su campana)."""
    ids = silla_ids if silla_ids is not None else [
        s.silla_id for s in reservacion.sillas if s.activa and s.tipo == "cortesia"
    ]
    if not ids:
        return None
    solicitud = FiestaSolicitudCortesia(
        reservacion_id=reservacion.id,
        silla_ids=_ids_a_texto(ids),
        motivo=motivo,
        estado="pendiente",
        solicitado_por=_nombre_usuario(),
    )
    reservacion.solicitudes_cortesia.append(solicitud)
    # Sin `reservacion=`: ahí se leerían relaciones perezosas (mesa de cada silla) y en async eso dispara un autoflush
    # fuera del greenlet. El cliente va en el detalle y la mesa en el renglón "crear/editar" de la misma operación.
    _bitacora(
        db, evento, "cortesia_solicitada", "reservacion", reservacion.id, None,
        f"{reservacion.cliente}: {len(ids)} silla(s) de cortesía por autorizar ({motivo})",
        despues={"sillas": len(ids), "motivo": motivo},
    )
    return solicitud


@router.post("/reservaciones", status_code=201)
async def crear_reservacion(
    datos: ReservacionIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    evento = await _evento_activo(db)
    hay_cortesia = any(s.tipo == "cortesia" for s in datos.sillas)
    if hay_cortesia and len((datos.cortesia_motivo or "").strip()) < 3:
        raise HTTPException(status_code=422, detail="Las cortesías llevan un motivo (mínimo 3 caracteres).")
    if datos.preventa_autorizada is not None:
        # Respetar la preventa después del corte lo autoriza un supervisor (contraseña de un solo uso).
        _exigir_supervisor(evento, autorizacion)
    # Las cortesías no piden contraseña: un supervisor las da directo; una cajera las aparta y se avisa a un supervisor.
    cortesia_directa = hay_cortesia and _es_supervisor()
    fecha_venta = datos.fecha_venta or date.today()
    reservacion = FiestaReservacion(
        evento_id=evento.id,
        cliente=datos.cliente.strip(),
        telefono_o_cuarto=datos.telefono_o_cuarto,
        correo=datos.correo,
        notas=datos.notas,
        fecha_venta=fecha_venta,
        capturado_por=_capturista(datos.capturado_por),
        estatus="activa",
        preventa_autorizada=datos.preventa_autorizada is not None,
        preventa_autorizada_por=datos.preventa_autorizada.por if datos.preventa_autorizada else None,
        preventa_motivo=datos.preventa_autorizada.motivo if datos.preventa_autorizada else None,
        cortesia_motivo=datos.cortesia_motivo.strip() if hay_cortesia else None,
        cortesia_autorizada_por=_nombre_usuario() if cortesia_directa else None,
        sillas=[],
        solicitudes_cortesia=[],  # colecciones inicializadas: en async no se puede cargar perezosamente
        pagos=[],
    )
    db.add(reservacion)
    await _agregar_sillas(db, evento, reservacion, datos.sillas, fecha_venta)
    if datos.pago_inicial is not None and datos.pago_inicial.silla_ids:
        _validar_destino_nuevas(datos.sillas, datos.pago_inicial.silla_ids)

    if datos.pago_inicial is not None:
        p = datos.pago_inicial
        reservacion.pagos.append(
            FiestaPago(
                referencia=p.referencia,
                fecha=p.fecha or fecha_venta,
                importe=p.importe,
                forma_pago=p.forma_pago,
                capturado_por=_capturista(p.capturado_por or datos.capturado_por),
                silla_ids=_ids_a_texto(p.silla_ids),
            )
        )
    try:
        await db.flush()
    except IntegrityError:
        # Otra caja tomó una silla entre la validación y el guardado.
        raise HTTPException(status_code=409, detail="Alguna de las sillas acaba de ser ocupada por otra caja.")

    _bitacora(
        db, evento, "crear", "reservacion", reservacion.id, datos.capturado_por,
        f"{reservacion.cliente}: {len(datos.sillas)} sillas"
        + (f"; preventa autorizada por {datos.preventa_autorizada.por}: {datos.preventa_autorizada.motivo}" if datos.preventa_autorizada else ""),
        reservacion=reservacion,
        despues={
            "cliente": reservacion.cliente,
            "sillas": len(datos.sillas),
            "telefono_o_cuarto": reservacion.telefono_o_cuarto,
            **({"cortesia_motivo": reservacion.cortesia_motivo} if hay_cortesia else {}),
        },
    )
    if hay_cortesia and not cortesia_directa:
        # Después de la bitácora de "crear" (ver el comentario en `_crear_solicitud_cortesia`).
        await _crear_solicitud_cortesia(db, evento, reservacion, datos.cortesia_motivo.strip())
        await db.flush()
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


@router.patch("/reservaciones/{reservacion_id}")
async def editar_reservacion(
    reservacion_id: int,
    datos: ReservacionPatch,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    """Edita datos del cliente y agrega/libera sillas. Las sillas nuevas se cobran al precio de hoy."""
    evento = await _evento_activo(db)
    # Sillas nuevas o cambiadas a cortesía: motivo obligatorio (se valida ANTES de gastar la autorización de un solo uso).
    hay_cortesia_nueva = any(s.tipo == "cortesia" for s in datos.sillas_agregar) or any(
        s.tipo == "cortesia" for s in datos.sillas_cambiar_tipo
    )
    if hay_cortesia_nueva and len((datos.cortesia_motivo or "").strip()) < 3:
        raise HTTPException(status_code=422, detail="Las cortesías llevan un motivo (mínimo 3 caracteres).")
    # Autorizar/quitar la preventa, cambiar el tipo de boleto (cambia el precio cobrado) y el precio manual lo autoriza
    # el supervisor con su contraseña. Las cortesías NO piden contraseña: ver abajo.
    cambia_tipo_normal = any(c.tipo != "cortesia" for c in datos.sillas_cambiar_tipo)
    if (
        datos.preventa_autorizada is not None or datos.quitar_preventa or cambia_tipo_normal
        or datos.sillas_cambiar_precio
    ):
        _exigir_supervisor(evento, autorizacion)
    regala_existentes = any(c.tipo == "cortesia" for c in datos.sillas_cambiar_tipo)
    if regala_existentes and not _es_supervisor():
        raise HTTPException(
            status_code=403,
            detail="Convertir una silla ya vendida en cortesía lo hace un supervisor. Agrega una silla nueva de cortesía o pídeselo.",
        )
    agrega_cortesia = any(s.tipo == "cortesia" for s in datos.sillas_agregar)
    cortesia_directa = hay_cortesia_nueva and _es_supervisor()
    reservacion = await _cargar_reservacion(db, reservacion_id, evento.id)
    if reservacion.estatus != "activa":
        raise HTTPException(status_code=409, detail="La reservación está cancelada.")
    sillas_antes = {s.silla_id for s in reservacion.sillas if s.activa}

    cambios = datos.model_dump(
        exclude_unset=True,
        exclude={
            "sillas_agregar", "sillas_quitar", "sillas_cambiar_tipo", "sillas_cambiar_precio",
            "capturado_por", "preventa_autorizada", "quitar_preventa", "cortesia_motivo",
        },
    )
    if hay_cortesia_nueva:
        # Se acumulan los motivos si ya había cortesías en la reservación.
        nuevo_motivo = datos.cortesia_motivo.strip()
        reservacion.cortesia_motivo = f"{reservacion.cortesia_motivo} | {nuevo_motivo}"[:255] if reservacion.cortesia_motivo else nuevo_motivo
        if cortesia_directa:
            reservacion.cortesia_autorizada_por = _nombre_usuario() or reservacion.cortesia_autorizada_por
    for campo, valor in cambios.items():
        setattr(reservacion, campo, valor.strip() if campo == "cliente" and valor else valor)

    precios = await _precios(db, evento.id)
    if datos.preventa_autorizada is not None:
        # Autoriza el precio de preventa: lo vendido y lo que se agregue después se cobra a preventa.
        reservacion.preventa_autorizada = True
        reservacion.preventa_autorizada_por = datos.preventa_autorizada.por
        reservacion.preventa_motivo = datos.preventa_autorizada.motivo
        for sil in reservacion.sillas:
            if sil.activa and sil.tipo != "cortesia" and not sil.preventa:
                sil.precio_aplicado, sil.preventa = _precio_y_preventa(sil.tipo, reservacion.fecha_venta, evento, precios, True)
        _bitacora(
            db, evento, "preventa_autorizada", "reservacion", reservacion.id, datos.preventa_autorizada.por,
            f"{reservacion.cliente}: {datos.preventa_autorizada.motivo}",
        )
    elif datos.quitar_preventa and reservacion.preventa_autorizada:
        reservacion.preventa_autorizada = False
        reservacion.preventa_autorizada_por = None
        reservacion.preventa_motivo = None
        if not es_preventa(reservacion.fecha_venta, evento.corte_preventa):
            for sil in reservacion.sillas:
                if sil.activa and sil.tipo != "cortesia" and sil.preventa:
                    sil.precio_aplicado, sil.preventa = _precio_y_preventa(sil.tipo, reservacion.fecha_venta, evento, precios, False)
        _bitacora(db, evento, "preventa_revocada", "reservacion", reservacion.id, datos.capturado_por, reservacion.cliente)

    if datos.sillas_quitar:
        activas = {s.silla_id: s for s in reservacion.sillas if s.activa}
        faltantes = [i for i in datos.sillas_quitar if i not in activas]
        if faltantes:
            raise HTTPException(status_code=400, detail=f"Esas sillas no están en la reservación: {faltantes}")
        if len(activas) - len(datos.sillas_quitar) + len(datos.sillas_agregar) < 1:
            raise HTTPException(status_code=400, detail="La reservación debe conservar al menos una silla; cancélala si ya no aplica.")
        for silla_id in datos.sillas_quitar:
            activas[silla_id].activa = False
        await db.flush()  # libera las sillas antes de volver a asignarlas (cambio de tipo)

    if datos.sillas_cambiar_tipo:
        # El cambio de tipo conserva la fecha de venta original: se cobra el precio (preventa/normal) con el
        # que se vendió la reservación, no el de hoy.
        activas = {s.silla_id: s for s in reservacion.sillas if s.activa}
        ajenas = [c.silla_id for c in datos.sillas_cambiar_tipo if c.silla_id not in activas]
        if ajenas:
            raise HTTPException(status_code=400, detail=f"Esas sillas no están en la reservación: {ajenas}")
        for c in datos.sillas_cambiar_tipo:
            silla = activas[c.silla_id]
            silla.tipo = c.tipo
            silla.precio_aplicado, silla.preventa = _precio_y_preventa(
                c.tipo, reservacion.fecha_venta, evento, precios, bool(reservacion.preventa_autorizada)
            )

    if datos.sillas_cambiar_precio:
        # Precio manual de una silla (corrige un error o da un precio especial): solo con autorización de supervisor.
        activas = {s.silla_id: s for s in reservacion.sillas if s.activa}
        ajenas = [c.silla_id for c in datos.sillas_cambiar_precio if c.silla_id not in activas]
        if ajenas:
            raise HTTPException(status_code=400, detail=f"Esas sillas no están en la reservación: {ajenas}")
        for c in datos.sillas_cambiar_precio:
            silla = activas[c.silla_id]
            antes = silla.precio_aplicado
            silla.precio_aplicado = round(c.precio, 2)
            _bitacora(
                db, evento, "precio_silla", "reservacion", reservacion.id, datos.capturado_por,
                f"{reservacion.cliente}, mesa {silla.silla.mesa.numero} silla {silla.silla.numero}: "
                f"${antes:,.2f} → ${c.precio:,.2f} ({c.motivo})",
                reservacion=reservacion,
                antes={"mesa": silla.silla.mesa.numero, "silla": silla.silla.numero, "precio": antes},
                despues={"mesa": silla.silla.mesa.numero, "silla": silla.silla.numero, "precio": round(c.precio, 2), "motivo": c.motivo},
            )

    if datos.sillas_agregar:
        await _agregar_sillas(db, evento, reservacion, datos.sillas_agregar, date.today())
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Alguna de las sillas acaba de ser ocupada por otra caja.")

    _bitacora(
        db, evento, "editar", "reservacion", reservacion.id, datos.capturado_por,
        f"datos={cambios} +sillas={[s.silla_id for s in datos.sillas_agregar]} -sillas={datos.sillas_quitar}"
        f" tipo={[(c.silla_id, c.tipo) for c in datos.sillas_cambiar_tipo]}",
        reservacion=reservacion,
        despues={
            "datos": cambios,
            "sillas_agregadas": [s.silla_id for s in datos.sillas_agregar],
            "sillas_quitadas": datos.sillas_quitar,
            "cambio_de_tipo": [{"silla_id": c.silla_id, "tipo": c.tipo} for c in datos.sillas_cambiar_tipo],
            **({"cortesia_motivo": datos.cortesia_motivo} if hay_cortesia_nueva else {}),
        },
    )
    if agrega_cortesia and not cortesia_directa:
        nuevas = [
            s.silla_id for s in reservacion.sillas
            if s.activa and s.tipo == "cortesia" and s.silla_id not in sillas_antes
        ]
        await _crear_solicitud_cortesia(db, evento, reservacion, datos.cortesia_motivo.strip(), nuevas)
        await db.flush()
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


@router.delete("/reservaciones/{reservacion_id}")
async def cancelar_reservacion(
    reservacion_id: int,
    motivo: str | None = Query(default=None, max_length=255),
    usuario: str | None = Query(default=None, max_length=80),
    cancelar_pagos: bool = Query(default=False, description="También cancela sus pagos vigentes (pruebas / reembolso total)"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    Cancelación lógica: libera las sillas y conserva el historial. Por omisión los pagos NO
    se borran (el dinero ya se cobró): cancélalos uno por uno cuando se devuelvan, o pasa
    `cancelar_pagos=true` para cancelarlos todos de una vez (desaparecen de Cobros).
    """
    evento = await _evento_activo(db)
    reservacion = await _cargar_reservacion(db, reservacion_id, evento.id)
    if reservacion.estatus == "cancelada":
        raise HTTPException(status_code=409, detail="La reservación ya estaba cancelada.")
    reservacion.estatus = "cancelada"
    reservacion.motivo_cancelacion = motivo
    reservacion.cancelado_en = datetime.now(timezone.utc)
    for s in reservacion.sillas:
        s.activa = False
    pagos_cancelados = 0.0
    if cancelar_pagos:
        for p in reservacion.pagos:
            if not p.cancelado:
                p.cancelado = True
                pagos_cancelados += p.importe
    pagado = _calculo(reservacion)["pagado"]
    _bitacora(
        db, evento, "cancelar", "reservacion", reservacion.id, usuario,
        f"{reservacion.cliente}; motivo={motivo}; pagado sin devolver={pagado}; pagos cancelados={pagos_cancelados}",
        reservacion=reservacion,
        antes={"estatus": "activa"},
        despues={"estatus": "cancelada", "motivo": motivo, "pagado_sin_devolver": pagado, "pagos_cancelados": pagos_cancelados},
    )
    return {
        "id": reservacion.id,
        "estatus": "cancelada",
        "pagado_sin_devolver": pagado,
        "pagos_cancelados": round(pagos_cancelados, 2),
    }


class FusionIn(BaseModel):
    origen_id: int
    capturado_por: str | None = Field(default=None, max_length=80)


@router.post("/reservaciones/{reservacion_id}/fusionar")
async def fusionar_reservaciones(
    reservacion_id: int,
    datos: FusionIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    Junta la reservación `origen_id` dentro de ésta: sus sillas y pagos vigentes pasan aquí
    (conservan el precio y la preventa con que se vendieron) y la de origen queda cancelada
    como "fusionada", sin dinero propio. Sirve cuando un mismo cliente se capturó dos veces.
    """
    if datos.origen_id == reservacion_id:
        raise HTTPException(status_code=400, detail="Elige otra reservación para combinar.")
    evento = await _evento_activo(db)
    destino = await _cargar_reservacion(db, reservacion_id, evento.id)
    origen = await _cargar_reservacion(db, datos.origen_id, evento.id)
    if destino.estatus != "activa" or origen.estatus != "activa":
        raise HTTPException(status_code=409, detail="Solo se pueden combinar reservaciones activas.")

    sillas = [s for s in origen.sillas if s.activa]
    pagos = [p for p in origen.pagos if not p.cancelado]
    for s in sillas:
        s.reservacion_id = destino.id
    for p in pagos:
        p.reservacion_id = destino.id
    origen.estatus = "cancelada"
    origen.motivo_cancelacion = f"Fusionada en la reservación #{destino.id}"
    origen.cancelado_en = datetime.now(timezone.utc)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="No se pudo combinar: alguna silla cambió mientras tanto.")

    _bitacora(
        db, evento, "fusionar", "reservacion", destino.id, datos.capturado_por,
        f"#{origen.id} ({origen.cliente}) → #{destino.id}: {len(sillas)} sillas, {len(pagos)} pagos",
        reservacion=destino,
        antes={"origen": origen.id, "cliente_origen": origen.cliente},
        despues={"destino": destino.id, "sillas": len(sillas), "pagos": len(pagos)},
    )
    return _reservacion_a_dict(await _cargar_reservacion(db, destino.id, evento.id))


# ── Pagos ───────────────────────────────────────────────────────────────────


async def _registrar_pago(db: AsyncSession, evento: FiestaEvento, reservacion: FiestaReservacion, datos: PagoIn, cobro_id: str | None = None) -> FiestaPago:
    """Crea un abono: lo reparte entre las sillas elegidas (o todas), proporcional a lo que les falta, y lo guarda
    así para poder corregirlo luego silla por silla."""
    _validar_destino(reservacion, datos.silla_ids)
    saldos = {sid: f["saldo"] for sid, f in _reparto_por_silla(reservacion).items()}
    elegidas = [i for i in (datos.silla_ids or []) if i in saldos]
    reparto, sobrante = distribuir_abono(datos.importe, {i: saldos[i] for i in elegidas} if elegidas else saldos)
    if sobrante > 0.004 and elegidas:  # lo que no cupo en las elegidas va a las demás
        resto_ids = {i: saldos[i] - reparto.get(i, 0.0) for i in saldos}
        extra, _ = distribuir_abono(sobrante, resto_ids)
        for i, m in extra.items():
            reparto[i] = round(reparto.get(i, 0.0) + m, 2)
    pago = FiestaPago(
        reservacion_id=reservacion.id,
        referencia=datos.referencia,
        fecha=datos.fecha or date.today(),
        importe=datos.importe,
        forma_pago=datos.forma_pago,
        capturado_por=_capturista(datos.capturado_por),
        silla_ids=_ids_a_texto(datos.silla_ids),
        reparto=_reparto_a_texto(reparto),
        cobro_id=cobro_id,
    )
    db.add(pago)
    reservacion.pagos.append(pago)  # el siguiente abono del mismo cobro ya ve este reparto
    await db.flush()
    _bitacora(
        db, evento, "pago", "reservacion", reservacion.id, datos.capturado_por,
        f"{reservacion.cliente}: ${datos.importe:,.2f} ({datos.forma_pago or 's/forma'})",
        reservacion=reservacion,
        despues={"importe": datos.importe, "forma_pago": datos.forma_pago, "fecha": pago.fecha, "referencia": datos.referencia, "cobro": cobro_id},
    )
    return pago


@router.post("/reservaciones/{reservacion_id}/pagos", status_code=201)
async def agregar_pago(
    reservacion_id: int,
    datos: PagoIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    evento = await _evento_activo(db)
    reservacion = await _cargar_reservacion(db, reservacion_id, evento.id)
    if reservacion.estatus != "activa":
        raise HTTPException(status_code=409, detail="No se puede abonar a una reservación cancelada.")
    await _registrar_pago(db, evento, reservacion, datos)
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


@router.post("/reservaciones/{reservacion_id}/pagos/multiple", status_code=201)
async def agregar_pagos_multiples(
    reservacion_id: int,
    datos: PagosMultiplesIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    Un cobro en varias formas de pago (parte en efectivo, parte con tarjeta…): se registra un pago por forma,
    todos o ninguno, y cada uno aparece en Cobros con su forma. Cada pago se reparte entre las sillas elegidas.
    """
    evento = await _evento_activo(db)
    reservacion = await _cargar_reservacion(db, reservacion_id, evento.id)
    if reservacion.estatus != "activa":
        raise HTTPException(status_code=409, detail="No se puede abonar a una reservación cancelada.")
    cobro_id = uuid.uuid4().hex if len(datos.pagos) > 1 else None  # varias formas = un solo cobro
    for pago_in in datos.pagos:
        await _registrar_pago(db, evento, reservacion, pago_in, cobro_id)
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


# ── Bloqueo de mesas y sillas ───────────────────────────────────────────────


@router.post("/bloqueos")
async def bloquear_sillas(
    datos: BloqueoIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    """
    Saca de venta (bloquear) o vuelve a habilitar sillas. Solo con autorización de supervisor. Solo se bloquean sillas
    libres; las bloqueadas no se pueden reservar, agregar ni transferir hasta que el supervisor las habilite.
    """
    evento = await _evento_activo(db)
    _exigir_supervisor(evento, autorizacion)
    if not datos.silla_ids and datos.mesa is None:
        raise HTTPException(status_code=400, detail="Indica las sillas o la mesa.")
    if datos.bloquear and len((datos.motivo or "").strip()) < 3:
        raise HTTPException(status_code=400, detail="Indica el motivo del bloqueo.")

    consulta = (
        select(FiestaSilla)
        .join(FiestaMesa, FiestaMesa.id == FiestaSilla.mesa_id)
        .options(selectinload(FiestaSilla.mesa))
        .where(FiestaMesa.evento_id == evento.id)
    )
    if datos.silla_ids:
        consulta = consulta.where(FiestaSilla.id.in_(datos.silla_ids))
    else:
        consulta = consulta.where(FiestaMesa.numero == datos.mesa)
    sillas = list((await db.execute(consulta)).scalars().all())
    if not sillas:
        raise HTTPException(status_code=404, detail="No se encontraron esas sillas.")

    ocupadas = await _sillas_ocupadas(db, [s.id for s in sillas])
    explicitas = bool(datos.silla_ids)
    cambiadas, omitidas = [], 0
    for s in sillas:
        if datos.bloquear:
            if s.id in ocupadas:
                if explicitas:
                    m, n, cliente = ocupadas[s.id]
                    raise HTTPException(status_code=409, detail=f"La mesa {m} silla {n} está reservada ({cliente}): no se puede bloquear.")
                omitidas += 1
                continue
            if s.bloqueada:
                continue
            s.bloqueada, s.bloqueo_motivo = True, datos.motivo.strip()
        else:
            if not s.bloqueada:
                continue
            s.bloqueada, s.bloqueo_motivo = False, None
        cambiadas.append(f"mesa {s.mesa.numero} silla {s.numero}")
    await db.flush()
    _bitacora(
        db, evento, "bloquear" if datos.bloquear else "habilitar", "silla", None, datos.capturado_por,
        f"{', '.join(cambiadas) or 'sin cambios'}" + (f" — {datos.motivo.strip()}" if datos.bloquear else ""),
    )
    return {"cambiadas": len(cambiadas), "omitidas_por_estar_reservadas": omitidas}


@router.patch("/pagos/{pago_id}")
async def editar_pago(
    pago_id: int,
    datos: PagoPatch,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    """Corrige importe, fecha, forma de pago o referencia de un pago vigente (queda el cambio en la bitácora).
    Editar un pago ya capturado lo autoriza un supervisor."""
    evento = await _evento_activo(db)
    # Corregir pagos lo hace también la cajera (queda en la bitácora con su usuario); no pide supervisor.
    res = await db.execute(
        select(FiestaPago)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaPago.reservacion_id)
        .where(FiestaPago.id == pago_id, FiestaReservacion.evento_id == evento.id)
    )
    pago = res.scalar_one_or_none()
    if pago is None:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if pago.cancelado:
        raise HTTPException(status_code=409, detail="El pago está cancelado y ya no se puede editar.")
    reservacion = await _cargar_reservacion(db, pago.reservacion_id, evento.id)
    if reservacion.estatus != "activa":
        raise HTTPException(status_code=409, detail="La reservación está cancelada.")

    antes = f"${pago.importe:,.2f} {pago.fecha} {pago.forma_pago or ''} {pago.referencia or ''}".strip()
    antes_d = {"importe": pago.importe, "fecha": pago.fecha, "forma_pago": pago.forma_pago, "referencia": pago.referencia}
    cambios = datos.model_dump(exclude_unset=True, exclude={"capturado_por", "silla_ids"})
    for campo, valor in cambios.items():
        if campo in ("importe", "fecha") and valor is None:
            continue  # estos dos no pueden quedar vacíos
        setattr(pago, campo, valor)
    if "silla_ids" in datos.model_fields_set:
        _validar_destino(reservacion, datos.silla_ids)
        pago.silla_ids = _ids_a_texto(datos.silla_ids)
        pago.reparto = None  # nuevo destino: se vuelve a repartir entre esas sillas
    elif pago.reparto and "importe" in cambios and cambios["importe"] is not None:
        guardado = _reparto_de_texto(pago.reparto)
        if cambios["importe"] <= sum(guardado.values()):
            nuevo, _ = distribuir_abono(cambios["importe"], guardado)
            pago.reparto = _reparto_a_texto(nuevo)
    await db.flush()
    despues = f"${pago.importe:,.2f} {pago.fecha} {pago.forma_pago or ''} {pago.referencia or ''}".strip()
    _bitacora(
        db, evento, "editar_pago", "pago", pago.id, datos.capturado_por, f"{antes} → {despues}",
        reservacion=reservacion, antes=antes_d,
        despues={"importe": pago.importe, "fecha": pago.fecha, "forma_pago": pago.forma_pago, "referencia": pago.referencia},
    )
    return _reservacion_a_dict(await _cargar_reservacion(db, pago.reservacion_id, evento.id))


class PagoSillaIn(BaseModel):
    importe: float = Field(ge=0)
    capturado_por: str | None = Field(default=None, max_length=80)


@router.patch("/pagos/{pago_id}/sillas/{silla_id}")
async def editar_pago_de_silla(
    pago_id: int,
    silla_id: int,
    datos: PagoSillaIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    """
    Corrige cuánto de este pago puso una silla (Pago 1/2/3 de la hoja de mesa). El importe del pago pasa a
    ser la suma de lo que puso en cada silla, así que Cobros se actualiza. 0 quita esa porción.
    Editar un pago ya capturado lo autoriza un supervisor.
    """
    evento = await _evento_activo(db)
    # Corregir pagos lo hace también la cajera (queda en la bitácora con su usuario); no pide supervisor.
    res = await db.execute(
        select(FiestaPago)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaPago.reservacion_id)
        .where(FiestaPago.id == pago_id, FiestaReservacion.evento_id == evento.id)
    )
    pago = res.scalar_one_or_none()
    if pago is None:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if pago.cancelado:
        raise HTTPException(status_code=409, detail="El pago está cancelado y ya no se puede editar.")
    reservacion = await _cargar_reservacion(db, pago.reservacion_id, evento.id)
    if reservacion.estatus != "activa":
        raise HTTPException(status_code=409, detail="La reservación está cancelada.")
    activas = {s.silla_id: s for s in reservacion.sillas if s.activa}
    if silla_id not in activas:
        raise HTTPException(status_code=400, detail="Esa silla no está activa en la reservación.")

    # Lo que cada silla recibe hoy de este pago (reparto guardado + lo que se derivó), como base de la edición.
    vigente = _reparto_por_silla(reservacion)
    actual = {
        sid: round(sum(x["importe"] for x in fila["pagos"] if x["pago_id"] == pago.id), 2)
        for sid, fila in vigente.items()
    }
    actual = {sid: m for sid, m in actual.items() if m > 0}
    en_silla = actual.get(silla_id, 0.0)
    otros_en_silla = round(vigente[silla_id]["pagado"] - en_silla, 2)
    nuevo = round(datos.importe, 2)
    if otros_en_silla + nuevo > activas[silla_id].precio_aplicado + 0.005:
        raise HTTPException(
            status_code=400,
            detail=f"Esa silla cuesta ${activas[silla_id].precio_aplicado:,.2f}: con ese monto quedaría pagada de más.",
        )
    sin_asignar = max(round(pago.importe - sum(actual.values()), 2), 0.0)  # excedente que no cupo en ninguna silla
    antes_importe = pago.importe
    actual[silla_id] = nuevo
    nuevo_importe = round(sum(actual.values()) + sin_asignar, 2)
    if nuevo_importe <= 0:
        raise HTTPException(status_code=400, detail="El pago quedaría en cero: cancélalo en lugar de editarlo.")
    pago.reparto = _reparto_a_texto(actual)
    pago.importe = nuevo_importe
    await db.flush()
    _bitacora(
        db, evento, "editar_pago_silla", "pago", pago.id, datos.capturado_por,
        f"silla {activas[silla_id].silla.numero}: ${en_silla:,.2f} → ${nuevo:,.2f}; pago ${antes_importe:,.2f} → ${nuevo_importe:,.2f}",
        reservacion=reservacion,
        antes={"silla": activas[silla_id].silla.numero, "monto_silla": en_silla, "importe_pago": antes_importe},
        despues={"silla": activas[silla_id].silla.numero, "monto_silla": nuevo, "importe_pago": nuevo_importe},
    )
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


class TransferirIn(BaseModel):
    mesa_destino: int  # número de mesa
    sillas: list[int] = Field(min_length=1)  # silla_id de la reservación que se mudan
    capturado_por: str | None = Field(default=None, max_length=80)


@router.post("/reservaciones/{reservacion_id}/transferir")
async def transferir_sillas(
    reservacion_id: int,
    datos: TransferirIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    Muda sillas de la reservación a la primera(s) sillas libres de otra mesa. Conservan tipo, precio y pagos
    (el dinero viaja con la silla).
    """
    evento = await _evento_activo(db)
    reservacion = await _cargar_reservacion(db, reservacion_id, evento.id)
    if reservacion.estatus != "activa":
        raise HTTPException(status_code=409, detail="La reservación está cancelada.")
    activas = {s.silla_id: s for s in reservacion.sillas if s.activa}
    ajenas = [i for i in datos.sillas if i not in activas]
    if ajenas or len(set(datos.sillas)) != len(datos.sillas):
        raise HTTPException(status_code=400, detail="Elige sillas distintas que estén activas en la reservación.")

    res = await db.execute(
        select(FiestaMesa)
        .where(FiestaMesa.evento_id == evento.id, FiestaMesa.numero == datos.mesa_destino)
        .options(selectinload(FiestaMesa.sillas))
    )
    mesa = res.scalar_one_or_none()
    if mesa is None:
        raise HTTPException(status_code=404, detail=f"La mesa {datos.mesa_destino} no existe.")
    ocupadas = await _sillas_ocupadas(db, [s.id for s in mesa.sillas])
    libres = sorted((s for s in mesa.sillas if s.id not in ocupadas and not s.bloqueada), key=lambda s: s.numero)
    if len(libres) < len(datos.sillas):
        raise HTTPException(
            status_code=409,
            detail=f"La mesa {mesa.numero} solo tiene {len(libres)} sillas libres y se piden {len(datos.sillas)}.",
        )

    origen = sorted(datos.sillas, key=lambda i: (activas[i].silla.mesa.numero, activas[i].silla.numero))
    mapa: dict[int, int] = {}
    detalle = []
    for sid, nueva in zip(origen, libres):
        rs = activas[sid]
        detalle.append(f"mesa {rs.silla.mesa.numero} silla {rs.silla.numero} → mesa {mesa.numero} silla {nueva.numero}")
        mapa[sid] = nueva.id
    # Los pagos viajan con la silla: se reasigna el destino y el reparto guardado.
    for p in reservacion.pagos:
        ids = _ids_de_texto(p.silla_ids)
        if ids:
            p.silla_ids = _ids_a_texto([mapa.get(i, i) for i in ids])
        rep = _reparto_de_texto(p.reparto)
        if rep:
            p.reparto = _reparto_a_texto({mapa.get(i, i): m for i, m in rep.items()})
    for sid, nueva_id in mapa.items():
        activas[sid].silla_id = nueva_id
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Alguna silla de la mesa destino acaba de ser ocupada por otra caja.")
    _bitacora(db, evento, "transferir", "reservacion", reservacion.id, datos.capturado_por, "; ".join(detalle), reservacion=reservacion)
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


@router.delete("/pagos/{pago_id}")
async def cancelar_pago(
    pago_id: int,
    usuario: str | None = Query(default=None, max_length=80),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Cancelación lógica del pago (se conserva en la bitácora y en el detalle)."""
    evento = await _evento_activo(db)
    res = await db.execute(
        select(FiestaPago)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaPago.reservacion_id)
        .where(FiestaPago.id == pago_id, FiestaReservacion.evento_id == evento.id)
    )
    pago = res.scalar_one_or_none()
    if pago is None:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if pago.cancelado:
        raise HTTPException(status_code=409, detail="El pago ya estaba cancelado.")
    pago.cancelado = True
    reservacion = await _cargar_reservacion(db, pago.reservacion_id, evento.id)
    _bitacora(
        db, evento, "cancelar_pago", "pago", pago.id, usuario, f"${pago.importe:,.2f} del {pago.fecha}",
        reservacion=reservacion,
        antes={"importe": pago.importe, "fecha": pago.fecha, "forma_pago": pago.forma_pago, "cancelado": False},
        despues={"cancelado": True},
    )
    await db.flush()
    return _reservacion_a_dict(reservacion)


# ── Devoluciones y confirmación al cliente ──────────────────────────────────


class DevolucionIn(BaseModel):
    importe: float = Field(gt=0)
    fecha: date | None = None
    forma_pago: str | None = Field(default=None, max_length=30)
    referencia: str | None = Field(default=None, max_length=80)
    motivo: str = Field(min_length=3, max_length=255)
    capturado_por: str | None = Field(default=None, max_length=80)


@router.post("/reservaciones/{reservacion_id}/devoluciones", status_code=201)
async def registrar_devolucion(
    reservacion_id: int,
    datos: DevolucionIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    """
    Registra dinero que se le regresó al cliente. Solo se puede devolver lo que sobra o ya no corresponde:
    lo cobrado de una reservación CANCELADA, o el excedente de una activa. Lo autoriza un supervisor.
    """
    evento = await _evento_activo(db)
    reservacion = await _cargar_reservacion(db, reservacion_id, evento.id)
    calculo = _calculo(reservacion)
    por_devolver = calcular_por_devolver(calculo["excedente"], _devoluciones_dict(reservacion))["por_devolver"]
    if datos.importe > por_devolver + 0.005:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Solo hay ${por_devolver:,.2f} por devolver en esta reservación."
                if por_devolver > 0
                else "No hay dinero por devolver: la reservación no tiene excedente ni está cancelada con pagos."
            ),
        )
    _exigir_supervisor(evento, autorizacion)  # después de validar, para no gastar la autorización de un solo uso
    devolucion = FiestaDevolucion(
        reservacion_id=reservacion.id,
        importe=round(datos.importe, 2),
        fecha=datos.fecha or date.today(),
        forma_pago=datos.forma_pago,
        referencia=datos.referencia,
        motivo=datos.motivo.strip(),
        capturado_por=_capturista(datos.capturado_por),
        autorizado_por=autorizo_por.get(),
    )
    db.add(devolucion)
    reservacion.devoluciones.append(devolucion)
    await db.flush()
    _bitacora(
        db, evento, "devolucion", "reservacion", reservacion.id, datos.capturado_por,
        f"{reservacion.cliente}: ${datos.importe:,.2f} ({datos.forma_pago or 's/forma'}) — {datos.motivo.strip()}",
        reservacion=reservacion,
        antes={"por_devolver": por_devolver},
        despues={"importe": devolucion.importe, "forma_pago": datos.forma_pago, "fecha": devolucion.fecha, "motivo": devolucion.motivo},
    )
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


@router.delete("/devoluciones/{devolucion_id}")
async def cancelar_devolucion(
    devolucion_id: int,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
    autorizacion: str | None = Header(default=None, alias="X-Autorizacion"),
):
    """Anula una devolución capturada por error (vuelve a quedar por devolver). Lo autoriza un supervisor."""
    evento = await _evento_activo(db)
    res = await db.execute(
        select(FiestaDevolucion)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaDevolucion.reservacion_id)
        .where(FiestaDevolucion.id == devolucion_id, FiestaReservacion.evento_id == evento.id)
    )
    devolucion = res.scalar_one_or_none()
    if devolucion is None:
        raise HTTPException(status_code=404, detail="Devolución no encontrada")
    if devolucion.cancelada:
        raise HTTPException(status_code=409, detail="La devolución ya estaba anulada.")
    _exigir_supervisor(evento, autorizacion)
    devolucion.cancelada = True
    reservacion = await _cargar_reservacion(db, devolucion.reservacion_id, evento.id)
    _bitacora(
        db, evento, "cancelar_devolucion", "reservacion", reservacion.id, None,
        f"{reservacion.cliente}: ${devolucion.importe:,.2f}",
        reservacion=reservacion,
        antes={"importe": devolucion.importe, "fecha": devolucion.fecha, "cancelada": False},
        despues={"cancelada": True},
    )
    await db.flush()
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


class ConfirmacionIn(BaseModel):
    canal: Literal["correo", "whatsapp", "copiado"]


@router.post("/reservaciones/{reservacion_id}/confirmacion")
async def registrar_confirmacion(
    reservacion_id: int,
    datos: ConfirmacionIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Deja constancia (quién y cuándo) de que se mandó la confirmación al cliente. El envío lo hace la cajera."""
    evento = await _evento_activo(db)
    reservacion = await _cargar_reservacion(db, reservacion_id, evento.id)
    _bitacora(
        db, evento, "confirmacion", "reservacion", reservacion.id, None,
        f"{reservacion.cliente}: confirmación por {datos.canal}",
        reservacion=reservacion, despues={"canal": datos.canal},
    )
    return {"ok": True, "canal": datos.canal}


# ── Resumen, cobros y bitácora ──────────────────────────────────────────────


@router.get("/resumen")
async def obtener_resumen(
    fecha_corte: date | None = Query(default=None, description="Por defecto, hoy"),
    anio_comparativo: int | None = Query(default=None, description="Por defecto, el año anterior"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    evento = await _evento_activo(db)
    corte = fecha_corte or date.today()
    anio_base = anio_comparativo or (evento.anio - 1)

    reservaciones = []
    for r in await _reservaciones_evento(db, evento.id, solo_activas=True):
        por_silla = _reparto_por_silla(r)  # lo pagado se refleja silla por silla, no por reservación
        reservaciones.append(
            {
                "sillas": [
                    {
                        "tipo": s.tipo,
                        "precio_aplicado": s.precio_aplicado,
                        "preventa": s.preventa,
                        "activa": s.activa,
                        "estado_pago": por_silla.get(s.silla_id, {}).get("estado"),
                    }
                    for s in r.sillas
                ],
                **_calculo(r),
            }
        )

    capacidad = (
        await db.execute(
            select(func.count(FiestaSilla.id)).join(FiestaMesa, FiestaMesa.id == FiestaSilla.mesa_id)
            .where(FiestaMesa.evento_id == evento.id, FiestaSilla.bloqueada.is_(False))
        )
    ).scalar_one()

    hist = await db.execute(select(FiestaHistorico).where(FiestaHistorico.anio == anio_base).order_by(FiestaHistorico.fecha))
    historico = [
        {
            "fecha": h.fecha,
            "reservados": h.reservados,
            "pagados": h.pagados,
            "anticipos": h.anticipos,
            "sin_anticipo": h.sin_anticipo,
            "cortesias": h.cortesias,
        }
        for h in hist.scalars().all()
    ]

    resumen = construir_resumen(reservaciones, capacidad, historico=historico, fecha_corte=corte)
    cobros = await _cobros(db, evento)
    cobrado = cobros["neto"]  # lo que realmente quedó cobrado (restando devoluciones)
    resumen["dinero"]["devuelto"] = cobros["devuelto"]
    resumen["dinero"]["neto"] = cobros["neto"]
    resumen["fecha_corte"] = corte
    resumen["anio_comparativo"] = anio_base
    resumen["fiscal"] = desglose_fiscal(cobrado, evento.iva_factor, evento.propina_pct)
    resumen["conciliacion"] = conciliar_contabilidad(cobrado, evento.total_contabilidad_al_dia)
    return resumen


async def _cobros(db: AsyncSession, evento: FiestaEvento) -> dict:
    res = await db.execute(
        select(FiestaPago)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaPago.reservacion_id)
        .where(FiestaReservacion.evento_id == evento.id, FiestaPago.cancelado.is_(False))
    )
    pagos = [
        {"fecha": p.fecha, "importe": p.importe, "forma_pago": p.forma_pago}
        for p in res.scalars().all()
    ]
    dev = await db.execute(
        select(FiestaDevolucion)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaDevolucion.reservacion_id)
        .where(FiestaReservacion.evento_id == evento.id, FiestaDevolucion.cancelada.is_(False))
    )
    devoluciones = [{"importe": d.importe, "cancelada": d.cancelada} for d in dev.scalars().all()]
    return construir_cobros(pagos, evento.iva_factor, devoluciones)


@router.get("/historico")
async def obtener_historico(
    anio: int | None = Query(default=None, description="Por defecto, el año anterior al del evento"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Sillas acumuladas por día de una edición anterior (para el comparativo de Ventas)."""
    evento = await _evento_activo(db)
    anio = anio or (evento.anio - 1)
    res = await db.execute(select(FiestaHistorico).where(FiestaHistorico.anio == anio).order_by(FiestaHistorico.fecha))
    filas = [
        {
            "fecha": h.fecha,
            "reservados": h.reservados,
            "pagados": h.pagados,
            "anticipos": h.anticipos,
            "sin_anticipo": h.sin_anticipo,
            "cortesias": h.cortesias,
            "adultos": h.adultos,
            "ninos": h.ninos,
        }
        for h in res.scalars().all()
    ]
    return {"anio": anio, "filas": filas, "disponible_para_cargar": anio in HISTORICO}


@router.get("/historico/pagos")
async def obtener_historico_pagos(
    anio: int | None = Query(default=None, description="Por defecto, el año anterior al del evento"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Boletos de una edición anterior con la fecha y el monto de cada pago (niños y, cuando se carguen, adultos):
    por día, cuántos se reservaron y cuánto dinero entró. Sale de `fiesta_fin_anio_historico_pagos.py`."""
    evento_anio = anio or ((await _evento_activo(db)).anio - 1)
    fuente = HISTORICO_PAGOS.get(evento_anio, {})
    resultado: dict[str, dict] = {}
    por_fecha: dict[str, dict] = {}
    for tipo in ("nino", "adulto"):
        resumen = resumir_pagos_historicos(fuente.get(tipo, []))
        resultado[tipo] = {"boletos": resumen["boletos"], "cobrado": resumen["cobrado"], "disponible": resumen["boletos"] > 0, "con_dinero": tipo in TIPOS_CON_DINERO}
        for fecha, v in resumen["dias"].items():
            por_fecha.setdefault(fecha.isoformat(), {})[tipo] = v
    esperados = NINOS_ESPERADOS.get(evento_anio)
    return {
        "anio": evento_anio,
        "tipos": resultado,
        "dias": [{"fecha": f, **v} for f, v in sorted(por_fecha.items())],
        "ninos_esperados": esperados,
        "ninos_cuadran": esperados is None or resultado["nino"]["boletos"] == esperados,
    }


class CierreIn(BaseModel):
    """Totales finales de una edición (lo que el Excel llama el cierre del Resumen). Solo se cambia lo enviado."""

    reservados: int | None = Field(default=None, ge=0)
    pagados: int | None = Field(default=None, ge=0)
    anticipos: int | None = Field(default=None, ge=0)
    sin_anticipo: int | None = Field(default=None, ge=0)
    cortesias: int | None = Field(default=None, ge=0)
    adultos: int | None = Field(default=None, ge=0)
    ninos: int | None = Field(default=None, ge=0)
    capturado_por: str | None = Field(default=None, max_length=80)


@router.put("/historico/cierre")
async def guardar_cierre_historico(
    datos: CierreIn,
    anio: int | None = Query(default=None, description="Por defecto, el año anterior al del evento"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Captura o corrige el cierre (total final) de la edición anterior: la última fila de ese año (o el 31/12)."""
    evento = await _evento_activo(db)
    anio = anio or (evento.anio - 1)
    res = await db.execute(select(FiestaHistorico).where(FiestaHistorico.anio == anio).order_by(FiestaHistorico.fecha.desc()).limit(1))
    fila = res.scalar_one_or_none()
    if fila is None:
        fila = FiestaHistorico(anio=anio, fecha=date(anio, 12, 31), reservados=0, pagados=0, anticipos=0, sin_anticipo=0, cortesias=0)
        db.add(fila)
    cambios = datos.model_dump(exclude_unset=True, exclude={"capturado_por"})
    for campo, valor in cambios.items():
        if valor is not None:
            setattr(fila, campo, valor)
    await db.flush()
    _bitacora(db, evento, "cierre_historico", "evento", evento.id, datos.capturado_por, f"{anio}: {cambios}")
    return {
        "anio": anio, "fecha": fila.fecha, "reservados": fila.reservados, "pagados": fila.pagados,
        "anticipos": fila.anticipos, "sin_anticipo": fila.sin_anticipo, "cortesias": fila.cortesias,
        "adultos": fila.adultos, "ninos": fila.ninos,
    }


@router.post("/historico/sembrar")
async def sembrar_historico(
    anio: int | None = Query(default=None, description="Por defecto, el año anterior al del evento"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Carga el histórico de una edición anterior tomado del Excel (idempotente: no pisa lo ya capturado)."""
    evento = await _evento_activo(db)
    anio = anio or (evento.anio - 1)
    datos = HISTORICO.get(anio)
    if datos is None:
        raise HTTPException(status_code=404, detail=f"No hay histórico del {anio} para cargar.")
    existentes = {
        f
        for (f,) in (await db.execute(select(FiestaHistorico.fecha).where(FiestaHistorico.anio == anio))).all()
    }
    nuevas = 0
    for fecha, reservados, pagados, anticipos, sin_anticipo, cortesias in datos:
        if fecha in existentes:
            continue
        db.add(
            FiestaHistorico(
                anio=anio, fecha=fecha, reservados=reservados, pagados=pagados,
                anticipos=anticipos, sin_anticipo=sin_anticipo, cortesias=cortesias,
            )
        )
        nuevas += 1
    await db.flush()
    _bitacora(db, evento, "historico", "evento", evento.id, None, f"{anio}: {nuevas} filas cargadas")
    return {"anio": anio, "cargadas": nuevas, "total": len(datos)}


@router.get("/cobros")
async def obtener_cobros(db: AsyncSession = Depends(get_db), _user: dict = Depends(get_current_user)):
    """Cobros por día. Incluye pagos de reservaciones canceladas (dinero cobrado) hasta que se cancele el pago."""
    evento = await _evento_activo(db)
    cobros = await _cobros(db, evento)
    cobros["fiscal"] = desglose_fiscal(cobros["total"], evento.iva_factor, evento.propina_pct)
    cobros["conciliacion"] = conciliar_contabilidad(cobros["total"], evento.total_contabilidad_al_dia)

    # Tabla día a día como la hoja Cobros del Excel (Pago 1/2/3, sin IVA, póliza, diferencia, reservas al día).
    reservaciones = []
    for r in await _reservaciones_evento(db, evento.id):
        reservaciones.append(
            {
                "fecha_venta": r.fecha_venta,
                "cancelada": r.estatus == "cancelada",
                "cancelado_en": r.cancelado_en.date() if r.cancelado_en else None,
                "devoluciones": [{"fecha": d.fecha, "importe": d.importe, "cancelada": d.cancelada} for d in r.devoluciones],
                "sillas": [
                    {
                        "silla_id": s.silla_id,
                        "tipo": s.tipo,
                        "precio_aplicado": s.precio_aplicado,
                        "activa": s.activa,
                        "orden": (s.silla.mesa.numero, s.silla.numero),
                    }
                    for s in r.sillas
                ],
                "pagos": [
                    {
                        "id": p.id,
                        "fecha": p.fecha,
                        "importe": p.importe,
                        "cancelado": p.cancelado,
                        "referencia": p.referencia,
                        "cobro_id": p.cobro_id,
                        "silla_ids": _ids_de_texto(p.silla_ids),
                        "reparto": _reparto_de_texto(p.reparto),
                    }
                    for p in r.pagos
                ],
            }
        )
    filas = await db.execute(select(FiestaPolizaDia).where(FiestaPolizaDia.evento_id == evento.id))
    polizas = {p.fecha: p.importe for p in filas.scalars().all()}
    diario = construir_cobros_diarios(reservaciones, polizas, evento.iva_factor, evento.fecha_evento, date.today())
    cobros["dias"] = diario["dias"]
    cobros["totales"] = diario["totales"]
    cobros["hoy"] = diario["hoy"]
    return cobros


class PolizaDiaIn(BaseModel):
    importe: float | None = None  # null borra la captura de ese día
    capturado_por: str | None = Field(default=None, max_length=80)


@router.put("/cobros/poliza/{fecha}")
async def guardar_poliza_dia(
    fecha: date,
    datos: PolizaDiaIn,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Captura (o borra) el total que contabilidad registró en póliza para un día (sin IVA)."""
    evento = await _evento_activo(db)
    res = await db.execute(
        select(FiestaPolizaDia).where(FiestaPolizaDia.evento_id == evento.id, FiestaPolizaDia.fecha == fecha)
    )
    fila = res.scalar_one_or_none()
    antes = fila.importe if fila else None
    if datos.importe is None:
        if fila is not None:
            await db.delete(fila)
    elif fila is None:
        db.add(FiestaPolizaDia(evento_id=evento.id, fecha=fecha, importe=round(datos.importe, 2)))
    else:
        fila.importe = round(datos.importe, 2)
    await db.flush()
    _bitacora(db, evento, "poliza_dia", "cobros", None, datos.capturado_por, f"{fecha}: {antes} → {datos.importe}")
    return {"fecha": fecha, "importe": datos.importe}


class ResolverCortesiaIn(BaseModel):
    nota: str | None = Field(default=None, max_length=255)


async def _solicitud_con_reservacion(
    db: AsyncSession, evento: FiestaEvento, solicitud_id: int
) -> tuple[FiestaSolicitudCortesia, FiestaReservacion]:
    res = await db.execute(
        select(FiestaSolicitudCortesia)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaSolicitudCortesia.reservacion_id)
        .where(FiestaSolicitudCortesia.id == solicitud_id, FiestaReservacion.evento_id == evento.id)
    )
    solicitud = res.scalar_one_or_none()
    if solicitud is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    return solicitud, await _cargar_reservacion(db, solicitud.reservacion_id, evento.id)


def _solicitud_detallada(solicitud: FiestaSolicitudCortesia, reservacion: FiestaReservacion) -> dict:
    ids = set(_ids_de_texto(solicitud.silla_ids))
    sillas = sorted(
        (s.silla.mesa.numero, s.silla.numero) for s in reservacion.sillas if s.silla_id in ids
    )
    return {
        **_solicitud_a_dict(solicitud),
        "cliente": reservacion.cliente,
        "sillas": [{"mesa": m, "silla": n} for m, n in sillas],
        "reservacion_estatus": reservacion.estatus,
    }


@router.get("/solicitudes-cortesia")
async def listar_solicitudes_cortesia(
    estado: str | None = Query(default="pendiente", pattern="^(pendiente|aprobada|rechazada)$"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(requiere_capacidad("fiesta_supervisor")),
):
    """Campana del supervisor: cortesías que las cajeras apartaron y esperan autorización (más antiguas primero)."""
    evento = await _evento_activo(db)
    consulta = (
        select(FiestaSolicitudCortesia.id)
        .join(FiestaReservacion, FiestaReservacion.id == FiestaSolicitudCortesia.reservacion_id)
        .where(FiestaReservacion.evento_id == evento.id)
        .order_by(FiestaSolicitudCortesia.id.desc() if estado != "pendiente" else FiestaSolicitudCortesia.id)
        .limit(100)
    )
    if estado:
        consulta = consulta.where(FiestaSolicitudCortesia.estado == estado)
    filas = []
    for solicitud_id in (await db.execute(consulta)).scalars().all():
        solicitud, reservacion = await _solicitud_con_reservacion(db, evento, solicitud_id)
        if solicitud.estado == "pendiente":
            ids = set(_ids_de_texto(solicitud.silla_ids))
            if not any(s.activa and s.silla_id in ids and s.tipo == "cortesia" for s in reservacion.sillas):
                # La cajera canceló la reservación o liberó esas sillas: ya no hay nada que autorizar.
                solicitud.estado = "rechazada"
                solicitud.resuelto_en = datetime.now(timezone.utc)
                solicitud.nota_resolucion = "Se canceló o se liberaron las sillas antes de resolverla"
                continue
        filas.append(_solicitud_detallada(solicitud, reservacion))
    return {"solicitudes": filas, "total": len(filas)}


async def _resolver_cortesia(
    db: AsyncSession, solicitud_id: int, aprobar: bool, nota: str | None
) -> dict:
    evento = await _evento_activo(db)
    solicitud, reservacion = await _solicitud_con_reservacion(db, evento, solicitud_id)
    if solicitud.estado != "pendiente":
        raise HTTPException(status_code=409, detail=f"Esta solicitud ya fue {solicitud.estado} por {solicitud.resuelto_por or 'alguien más'}.")
    quien = _nombre_usuario()
    solicitud.estado = "aprobada" if aprobar else "rechazada"
    solicitud.resuelto_por = quien
    solicitud.resuelto_en = datetime.now(timezone.utc)
    solicitud.nota_resolucion = (nota or "").strip() or None
    ids = set(_ids_de_texto(solicitud.silla_ids))
    afectadas = [s for s in reservacion.sillas if s.activa and s.silla_id in ids and s.tipo == "cortesia"]
    if aprobar:
        reservacion.cortesia_autorizada_por = quien or reservacion.cortesia_autorizada_por
        accion, texto = "cortesia_aprobada", f"{reservacion.cliente}: {len(afectadas)} silla(s) de cortesía autorizadas ({solicitud.motivo})"
    else:
        for s in afectadas:
            s.activa = False  # se liberan las sillas apartadas
        if reservacion.estatus == "activa" and not any(s.activa for s in reservacion.sillas):
            reservacion.estatus = "cancelada"
            reservacion.motivo_cancelacion = "Cortesía rechazada por el supervisor"
            reservacion.cancelado_en = datetime.now(timezone.utc)
        accion, texto = "cortesia_rechazada", f"{reservacion.cliente}: {len(afectadas)} silla(s) de cortesía rechazadas y liberadas ({solicitud.motivo})"
    _bitacora(
        db, evento, accion, "reservacion", reservacion.id, None, texto + (f" — {solicitud.nota_resolucion}" if solicitud.nota_resolucion else ""),
        reservacion=reservacion,
        despues={"estado": solicitud.estado, "sillas": len(afectadas), "motivo": solicitud.motivo},
    )
    await db.flush()
    return _reservacion_a_dict(await _cargar_reservacion(db, reservacion.id, evento.id))


@router.post("/solicitudes-cortesia/{solicitud_id}/aprobar")
async def aprobar_cortesia(
    solicitud_id: int,
    datos: ResolverCortesiaIn | None = None,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(requiere_capacidad("fiesta_supervisor")),
):
    return await _resolver_cortesia(db, solicitud_id, True, datos.nota if datos else None)


@router.post("/solicitudes-cortesia/{solicitud_id}/rechazar")
async def rechazar_cortesia(
    solicitud_id: int,
    datos: ResolverCortesiaIn | None = None,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(requiere_capacidad("fiesta_supervisor")),
):
    return await _resolver_cortesia(db, solicitud_id, False, datos.nota if datos else None)


@router.get("/bitacora")
async def obtener_bitacora(
    limite: int = Query(default=100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(requiere_capacidad("fiesta_auditoria")),
):
    """Últimos movimientos (sin filtros). Solo quien puede ver la auditoría; las cajeras reciben 403."""
    evento = await _evento_activo(db)
    res = await db.execute(
        select(FiestaBitacora)
        .where(FiestaBitacora.evento_id == evento.id)
        .order_by(FiestaBitacora.id.desc())
        .limit(limite)
    )
    return {
        "bitacora": [
            {
                "id": b.id,
                "accion": b.accion,
                "entidad": b.entidad,
                "entidad_id": b.entidad_id,
                "usuario": b.usuario or "",
                "detalle": b.detalle or "",
                "creado_en": b.creado_en,
            }
            for b in res.scalars().all()
        ]
    }


# ── Auditoría (quién hizo qué) ──────────────────────────────────────────────


def _condiciones_auditoria(
    evento_id: int,
    usuario: str | None,
    grupo: str | None,
    accion: str | None,
    reservacion_id: int | None,
    q: str | None,
    desde: date | None,
    hasta: date | None,
) -> list:
    conds = [FiestaBitacora.evento_id == evento_id]
    if usuario:
        conds.append(FiestaBitacora.usuario == usuario)
    if grupo:
        if grupo not in GRUPOS_AUDITORIA:
            raise HTTPException(status_code=400, detail="Tipo de movimiento desconocido.")
        pares = pares_de_grupo(grupo)
        partes = [
            and_(FiestaBitacora.accion == a, FiestaBitacora.entidad == e) if e else (FiestaBitacora.accion == a)
            for a, e in pares
        ]
        cond = or_(*partes)
        if grupo == "configuracion":
            # `actualizar` sobre precios es de "precios"; el resto de los `actualizar` es configuración
            cond = and_(cond, or_(FiestaBitacora.accion != "actualizar", FiestaBitacora.entidad != "precios"))
        conds.append(cond)
    if accion:
        conds.append(FiestaBitacora.accion == accion)
    if reservacion_id:
        conds.append(FiestaBitacora.reservacion_id == reservacion_id)
    if q and q.strip():
        t = f"%{q.strip()}%"
        parciales = [FiestaBitacora.cliente.ilike(t), FiestaBitacora.detalle.ilike(t), FiestaBitacora.usuario.ilike(t)]
        if q.strip().isdigit():
            parciales.append(FiestaBitacora.mesa == int(q.strip()))
            parciales.append(FiestaBitacora.reservacion_id == int(q.strip()))
        conds.append(or_(*parciales))
    if desde:
        conds.append(FiestaBitacora.creado_en >= datetime(desde.year, desde.month, desde.day, tzinfo=timezone.utc))
    if hasta:
        fin = datetime(hasta.year, hasta.month, hasta.day, tzinfo=timezone.utc) + timedelta(days=1)
        conds.append(FiestaBitacora.creado_en < fin)
    return conds


@router.get("/auditoria")
async def obtener_auditoria(
    usuario: str | None = Query(default=None, max_length=80),
    grupo: str | None = Query(default=None, description="cobros, cancelaciones, reservaciones, precios, bloqueos, configuracion"),
    accion: str | None = Query(default=None, max_length=40),
    reservacion_id: int | None = Query(default=None),
    q: str | None = Query(default=None, max_length=80, description="cliente, mesa, reservación, detalle o usuario"),
    desde: date | None = None,
    hasta: date | None = None,
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(requiere_capacidad("fiesta_auditoria")),
):
    """Todos los movimientos de la Fiesta (cobros, cancelaciones, cambios…) con quién, cuándo y antes/después."""
    evento = await _evento_activo(db)
    conds = _condiciones_auditoria(evento.id, usuario, grupo, accion, reservacion_id, q, desde, hasta)

    total = (await db.execute(select(func.count(FiestaBitacora.id)).where(*conds))).scalar_one()
    filas = (
        await db.execute(
            select(FiestaBitacora)
            .where(*conds)
            .order_by(FiestaBitacora.id.desc())
            .offset((pagina - 1) * por_pagina)
            .limit(por_pagina)
        )
    ).scalars().all()

    # Resumen del rango filtrado: por tipo y por usuario, y movimientos de hoy
    todas = (await db.execute(select(FiestaBitacora.accion, FiestaBitacora.entidad, FiestaBitacora.usuario).where(*conds))).all()
    por_grupo: dict[str, int] = {}
    por_usuario: dict[str, int] = {}
    for a, e, u in todas:
        g = clasificar(a, e)[0]
        por_grupo[g] = por_grupo.get(g, 0) + 1
        por_usuario[u or "—"] = por_usuario.get(u or "—", 0) + 1
    hoy = datetime.now(timezone.utc).date()
    movimientos_hoy = (
        await db.execute(
            select(func.count(FiestaBitacora.id)).where(
                FiestaBitacora.evento_id == evento.id,
                FiestaBitacora.creado_en >= datetime(hoy.year, hoy.month, hoy.day, tzinfo=timezone.utc),
            )
        )
    ).scalar_one()
    usuarios = [
        u for (u,) in (
            await db.execute(
                select(FiestaBitacora.usuario).where(FiestaBitacora.evento_id == evento.id, FiestaBitacora.usuario.is_not(None)).distinct().order_by(FiestaBitacora.usuario)
            )
        ).all()
    ]
    return {
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "filas": [fila_a_dict(b) for b in filas],
        "resumen": {
            "movimientos_hoy": movimientos_hoy,
            "por_grupo": por_grupo,
            "por_usuario": dict(sorted(por_usuario.items(), key=lambda kv: -kv[1])),
        },
        "usuarios": usuarios,
        "grupos": GRUPOS_AUDITORIA,
    }


@router.get("/auditoria/export")
async def exportar_auditoria(
    usuario: str | None = Query(default=None, max_length=80),
    grupo: str | None = None,
    accion: str | None = Query(default=None, max_length=40),
    reservacion_id: int | None = Query(default=None),
    q: str | None = Query(default=None, max_length=80),
    desde: date | None = None,
    hasta: date | None = None,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(requiere_capacidad("fiesta_auditoria")),
):
    """Excel con los movimientos filtrados (máximo 20,000)."""
    from openpyxl import Workbook
    from openpyxl.styles import Font

    evento = await _evento_activo(db)
    conds = _condiciones_auditoria(evento.id, usuario, grupo, accion, reservacion_id, q, desde, hasta)
    filas = (await db.execute(select(FiestaBitacora).where(*conds).order_by(FiestaBitacora.id.desc()).limit(20000))).scalars().all()

    libro = Workbook()
    hoja = libro.active
    hoja.title = "Auditoría"
    encabezados = ["Fecha y hora (UTC)", "Usuario", "Movimiento", "Tipo", "Reservación", "Cliente", "Mesa", "Detalle", "Autorizó", "Antes", "Después", "IP"]
    hoja.append(encabezados)
    for c in hoja[1]:
        c.font = Font(bold=True)
    for b in filas:
        d = fila_a_dict(b)
        hoja.append(
            [
                d["creado_en"].strftime("%Y-%m-%d %H:%M:%S") if d["creado_en"] else "",
                d["usuario"], d["etiqueta"], d["grupo_etiqueta"], d["reservacion_id"] or "", d["cliente"], d["mesa"] or "",
                d["detalle"], d["autorizo"] or "",
                json.dumps(d["antes"], ensure_ascii=False, default=str) if d["antes"] else "",
                json.dumps(d["despues"], ensure_ascii=False, default=str) if d["despues"] else "",
                d["ip"],
            ]
        )
    for columna, ancho in zip("ABCDEFGHIJKL", (20, 18, 26, 18, 12, 24, 7, 60, 16, 40, 40, 14)):
        hoja.dimensions  # noqa: B018 — fuerza el cálculo de dimensiones antes de ajustar anchos
        hoja.column_dimensions[columna].width = ancho
    hoja.auto_filter.ref = hoja.dimensions
    hoja.freeze_panes = "A2"
    salida = io.BytesIO()
    libro.save(salida)
    salida.seek(0)
    return StreamingResponse(
        salida,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="auditoria_fiesta.xlsx"'},
    )
