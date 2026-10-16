"""
Auditoría de la Fiesta de Fin de Año: agrupa y rotula en español los movimientos de `FiestaBitacora`.

Función pura (sin base de datos): el router arma las consultas con `condicion_grupo` y serializa con `fila_a_dict`.
"""

from __future__ import annotations

import json
from typing import Any

# (acción, entidad o None = cualquiera) → (grupo, etiqueta)
_CLASIFICACION: dict[tuple[str, str | None], tuple[str, str]] = {
    ("pago", None): ("cobros", "Cobro registrado"),
    ("editar_pago", None): ("cobros", "Cobro corregido"),
    ("editar_pago_silla", None): ("cobros", "Cobro corregido por silla"),
    ("poliza_dia", None): ("cobros", "Póliza del día"),
    ("cancelar", None): ("cancelaciones", "Reservación cancelada"),
    ("eliminar", None): ("cancelaciones", "Reservación eliminada del sistema"),
    ("exportar", None): ("configuracion", "Descargó el Excel de respaldo"),
    ("cancelar_pago", None): ("cancelaciones", "Cobro cancelado"),
    ("devolucion", None): ("cobros", "Devolución registrada"),
    ("cancelar_devolucion", None): ("cancelaciones", "Devolución anulada"),
    ("confirmacion", None): ("reservaciones", "Confirmación enviada al cliente"),
    ("cortesia_solicitada", None): ("precios", "Cortesía por autorizar"),
    ("cortesia_aprobada", None): ("precios", "Cortesía autorizada"),
    ("cortesia_rechazada", None): ("cancelaciones", "Cortesía rechazada"),
    ("crear", None): ("reservaciones", "Reservación creada"),
    ("editar", None): ("reservaciones", "Reservación editada"),
    ("fusionar", None): ("reservaciones", "Reservaciones combinadas"),
    ("transferir", None): ("reservaciones", "Sillas transferidas"),
    ("precio_silla", None): ("precios", "Precio de silla cambiado"),
    ("preventa_autorizada", None): ("precios", "Preventa autorizada"),
    ("preventa_revocada", None): ("precios", "Preventa revocada"),
    ("actualizar", "precios"): ("precios", "Precios de boletos"),
    ("bloquear", None): ("bloqueos", "Sillas bloqueadas"),
    ("habilitar", None): ("bloqueos", "Sillas habilitadas"),
    ("actualizar", "evento"): ("configuracion", "Evento actualizado"),
    ("actualizar", "mesa"): ("configuracion", "Mesa actualizada"),
    ("reacomodar", None): ("configuracion", "Mesas reacomodadas"),
    ("cierre_historico", None): ("configuracion", "Cierre del año pasado"),
    ("historico", None): ("configuracion", "Histórico cargado"),
}

GRUPOS: dict[str, str] = {
    "cobros": "Cobros",
    "cancelaciones": "Cancelaciones",
    "reservaciones": "Reservaciones",
    "precios": "Precios y preventa",
    "bloqueos": "Bloqueos",
    "configuracion": "Configuración",
}


def clasificar(accion: str, entidad: str | None) -> tuple[str, str]:
    """(grupo, etiqueta) de un movimiento; los desconocidos caen en 'configuracion'."""
    return (
        _CLASIFICACION.get((accion, entidad))
        or _CLASIFICACION.get((accion, None))
        or ("configuracion", accion.replace("_", " ").capitalize())
    )


def pares_de_grupo(grupo: str) -> list[tuple[str, str | None]]:
    """Pares (acción, entidad) que pertenecen al grupo, para armar el filtro SQL."""
    return [par for par, (g, _) in _CLASIFICACION.items() if g == grupo]


def _cargar(texto: str | None) -> Any:
    if not texto:
        return None
    try:
        return json.loads(texto)
    except ValueError:
        return texto


def fila_a_dict(b: Any) -> dict:
    """Serializa una fila de `FiestaBitacora` para la pantalla (antes/después ya como objetos)."""
    grupo, etiqueta = clasificar(b.accion, b.entidad)
    detalle = b.detalle or ""
    autorizo = None
    if "· autorizó:" in detalle:
        detalle, _, autorizo = detalle.rpartition("· autorizó:")
        detalle, autorizo = detalle.strip(), autorizo.strip()
    return {
        "id": b.id,
        "creado_en": b.creado_en,
        "usuario": b.usuario or "",
        "usuario_id": b.usuario_id,
        "accion": b.accion,
        "entidad": b.entidad,
        "grupo": grupo,
        "grupo_etiqueta": GRUPOS.get(grupo, grupo),
        "etiqueta": etiqueta,
        "reservacion_id": b.reservacion_id,
        "cliente": b.cliente or "",
        "mesa": b.mesa,
        "detalle": detalle,
        "autorizo": autorizo,
        "antes": _cargar(b.antes),
        "despues": _cargar(b.despues),
        "ip": b.ip or "",
    }
