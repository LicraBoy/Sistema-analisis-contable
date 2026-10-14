"""
Permisos por módulo. Cada rol tiene un nivel por módulo: 0 = sin acceso, 1 = solo ver, 2 = ver y editar.

`requiere("modulo")` se coloca por router en `main.py`: GET/HEAD/OPTIONS exigen nivel ≥ 1 y el resto de métodos
nivel ≥ 2. Algunos POST son "de lectura" (parsear un archivo sin guardar): se les puede dar `nivel_minimo=1`.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db

NIVEL_SIN_ACCESO, NIVEL_VER, NIVEL_EDITAR = 0, 1, 2

# Módulos que aparecen en la matriz editable (clave, etiqueta, descripción).
MODULOS_MATRIZ: list[tuple[str, str, str]] = [
    ("cfdi", "CFDI: ingresos, pagos y conciliación", "Flujo de ingresos recibidos, pagos, conciliación y retenciones."),
    ("facturacion", "Facturación", "Formas de pago, recibos emitidos, base de datos y balanza."),
    ("pagos_recepcion", "Pagos de Recepción", "Folios de huéspedes y saldo de cuenta huésped."),
    ("catalogo_productos", "Catálogo de Productos", "Catálogo, costeo de recetas y productos vendidos."),
    ("inteligencia_negocio", "Inteligencia de Negocio", "Ventas diarias y Análisis y Profundidad."),
    ("reporte_produccion", "Producción Carnes y Mariscos", "Inventario diario de porcionador y cocina."),
    ("amarre_costo", "Amarre de Costo de Ventas", "Conciliación de inventarios del hotel."),
    ("almacen_general", "Almacén General", "Pantallas del almacén."),
    ("fiesta", "Fiesta de Fin de Año", "Croquis, reservaciones, cobros y resumen."),
]

# Capacidades que se asignan igual que un módulo pero no son pantallas.
CAPACIDADES: list[tuple[str, str, str]] = [
    ("fiesta_supervisor", "Fiesta: autorizar acciones de supervisor", "Precios, preventa autorizada y cambios sensibles."),
    ("fiesta_auditoria", "Fiesta: ver la auditoría", "Quién cobró, canceló o cambió algo en la Fiesta (no la ven las cajeras)."),
]

MODULO_ADMIN = "administracion"

TODOS_LOS_MODULOS: list[str] = [m[0] for m in MODULOS_MATRIZ] + [c[0] for c in CAPACIDADES] + [MODULO_ADMIN]
MODULOS_Y_CAPACIDADES: list[str] = [m[0] for m in MODULOS_MATRIZ] + [c[0] for c in CAPACIDADES]

# Roles iniciales: clave → (nombre, descripción, permisos). Lo no listado queda en 0.
ROLES_INICIALES: dict[str, tuple[str, str, dict[str, int]]] = {
    "administrador": (
        "Administrador",
        "Acceso total y administración de usuarios, roles y bitácora.",
        {m: NIVEL_EDITAR for m in TODOS_LOS_MODULOS},
    ),
    "contralor": (
        "Contralor / Contabilidad",
        "Edita contabilidad y almacén; consulta catálogo, inteligencia, producción y fiesta.",
        {
            "cfdi": NIVEL_EDITAR,
            "facturacion": NIVEL_EDITAR,
            "pagos_recepcion": NIVEL_EDITAR,
            "amarre_costo": NIVEL_EDITAR,
            "almacen_general": NIVEL_EDITAR,
            "catalogo_productos": NIVEL_VER,
            "inteligencia_negocio": NIVEL_VER,
            "reporte_produccion": NIVEL_VER,
            "fiesta": NIVEL_VER,
            "fiesta_auditoria": NIVEL_EDITAR,
        },
    ),
    "supervisor_fiesta": (
        "Supervisor de Fiesta",
        "Opera la Fiesta de Fin de Año, autoriza acciones sensibles y ve la auditoría.",
        {"fiesta": NIVEL_EDITAR, "fiesta_supervisor": NIVEL_EDITAR, "fiesta_auditoria": NIVEL_EDITAR},
    ),
    "cajera_fiesta": (
        "Cajera de Fiesta",
        "Reserva y cobra en la Fiesta de Fin de Año (sin autorizar acciones de supervisor).",
        {"fiesta": NIVEL_EDITAR},
    ),
}

# Ruta (prefijo del router) → módulo, para documentar y probar la cobertura.
MODULO_POR_ROUTER: dict[str, str] = {
    "/ingresos": "cfdi",
    "/pagos": "cfdi",
    "/conciliacion": "cfdi",
    "/pagos/retenciones": "cfdi",
    "/facturacion": "facturacion",
    "/pagos-recepcion": "pagos_recepcion",
    "/saldo-cuenta-huesped": "pagos_recepcion",
    "/amarre-costo": "amarre_costo",
    "/reporte-produccion": "reporte_produccion",
    "/fiesta-fin-anio": "fiesta",
}


def nivel_de(usuario: dict, modulo: str) -> int:
    return int(usuario.get("permisos", {}).get(modulo, 0))


def tiene_capacidad(usuario: dict, capacidad: str) -> bool:
    return nivel_de(usuario, capacidad) >= NIVEL_EDITAR


def requiere_capacidad(capacidad: str):
    """Dependencia de endpoint: exige una capacidad (p. ej. `fiesta_auditoria`); sin ella, 403 auditado."""

    async def _dependencia(
        request: Request,
        usuario: dict = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> dict:
        if not tiene_capacidad(usuario, capacidad):
            from app.services.seguridad import auditar

            await auditar(
                db,
                evento="acceso_denegado",
                request=request,
                usuario=usuario,
                modulo=capacidad,
                detalle=f"{request.method} {request.url.path} (requiere {capacidad})",
                exito=False,
            )
            await db.commit()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para ver esta información.")
        return usuario

    _dependencia.capacidad = capacidad  # type: ignore[attr-defined]
    return _dependencia


def requiere(modulo: str, nivel_minimo: int | None = None):
    """Dependencia de router: exige sesión válida y nivel suficiente en `modulo` según el método HTTP."""

    async def _dependencia(
        request: Request,
        usuario: dict = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> dict:
        if nivel_minimo is not None:
            necesario = nivel_minimo
        else:
            necesario = NIVEL_VER if request.method in ("GET", "HEAD", "OPTIONS") else NIVEL_EDITAR
        if nivel_de(usuario, modulo) < necesario:
            from app.services.seguridad import auditar

            await auditar(
                db,
                evento="acceso_denegado",
                request=request,
                usuario=usuario,
                modulo=modulo,
                detalle=f"{request.method} {request.url.path} (requiere nivel {necesario})",
                exito=False,
            )
            await db.commit()  # get_db revierte al lanzar excepción: la auditoría se guarda antes
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para esta acción." if necesario == NIVEL_EDITAR else "No tienes acceso a este módulo.",
            )
        return usuario

    _dependencia.modulo = modulo  # type: ignore[attr-defined]  — lo lee tests/test_autorizacion_rutas.py
    return _dependencia
