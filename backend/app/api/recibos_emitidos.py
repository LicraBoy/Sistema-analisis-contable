"""
Recibos Emitidos router — Fase 1 de "Inteligencia de Negocio" dentro de
Catálogo de Productos (Restaurante). Mismo patrón de reemplazo por lote que
Comandas Emitidas (`api/comandas_emitidas.py`): un archivo puede cubrir
varios días, y el reemplazo al volver a subir es solo por los días que
vienen en el archivo.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import ReciboEmitidoDetalle
from app.services.recibos_emitidos import leer_excel_recibos, parsear_recibos_emitidos

logger = logging.getLogger(__name__)

router = APIRouter()


def _recibo_a_dict(fila: ReciboEmitidoDetalle) -> dict:
    return {
        "id": fila.id,
        "fecha": fila.fecha.isoformat(),
        "hora": fila.hora.isoformat(),
        "turno": fila.turno,
        "pos": fila.pos,
        "cuenta": fila.cuenta,
        "factura": fila.factura,
        "pagada": fila.pagada,
        "tipo": fila.tipo,
        "room_name": fila.room_name,
        "num_cubiertos": fila.num_cubiertos,
        "subtotal": fila.subtotal,
        "descuento": fila.descuento,
        "tax": fila.tax,
        "room_serv": fila.room_serv,
        "servicio": fila.servicio,
        "propina": fila.propina,
        "total": fila.total,
        "subtotal_tipo_producto": fila.subtotal_tipo_producto,
        "segmento": fila.segmento,
        "clientes": fila.clientes,
    }


@router.post("/upload")
async def upload_recibos_emitidos(
    archivo: UploadFile = File(..., description="Excel de Recibos Emitidos del Restaurante"),
    confirmar_reemplazo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Parsea el Excel (puede traer varios días) y guarda una fila por cuenta
    cerrada (las filas de desglose por tipo de producto se descartan). Si
    alguno de los días del archivo ya tiene filas guardadas y no se envió
    `confirmar_reemplazo=true`, responde con la lista de fechas en
    conflicto sin tocar nada; al confirmar, se reemplazan solo esos días.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_recibos(contenido)
        registros = parsear_recibos_emitidos(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error al procesar el archivo de Recibos Emitidos")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not registros:
        raise HTTPException(status_code=400, detail="No se encontraron cuentas en el archivo")

    fechas = sorted({registro["fecha"] for registro in registros})

    if not confirmar_reemplazo:
        res_conteo = await db.execute(
            select(ReciboEmitidoDetalle.fecha, func.count())
            .where(ReciboEmitidoDetalle.fecha.in_(fechas))
            .group_by(ReciboEmitidoDetalle.fecha)
        )
        conflictos = res_conteo.all()
        if conflictos:
            return {
                "requiere_confirmacion": True,
                "fechas_conflicto": [
                    {"fecha": fecha.isoformat(), "total_existentes": total} for fecha, total in conflictos
                ],
            }

    await db.execute(delete(ReciboEmitidoDetalle).where(ReciboEmitidoDetalle.fecha.in_(fechas)))
    db.add_all([ReciboEmitidoDetalle(**registro) for registro in registros])
    await db.commit()

    por_turno: dict[str, int] = {}
    suma_total = 0.0
    for registro in registros:
        por_turno[registro["turno"]] = por_turno.get(registro["turno"], 0) + 1
        suma_total += registro["total"]

    return {
        "fechas_procesadas": [f.isoformat() for f in fechas],
        "total_filas": len(registros),
        "por_turno": por_turno,
        "suma_total": round(suma_total, 2),
    }


@router.get("/dias")
async def listar_dias_recibos_emitidos(
    desde: str | None = Query(None, description="Fecha inicial, formato 'YYYY-MM-DD'"),
    hasta: str | None = Query(None, description="Fecha final, formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Regresa los días guardados de Recibos Emitidos, con el número de cuentas de cada uno."""
    stmt = select(ReciboEmitidoDetalle.fecha, func.count())
    if desde:
        stmt = stmt.where(ReciboEmitidoDetalle.fecha >= desde)
    if hasta:
        stmt = stmt.where(ReciboEmitidoDetalle.fecha <= hasta)
    stmt = stmt.group_by(ReciboEmitidoDetalle.fecha).order_by(ReciboEmitidoDetalle.fecha.desc())

    res = await db.execute(stmt)
    return {"dias": [{"fecha": fecha.isoformat(), "total": total} for fecha, total in res.all()]}


@router.get("")
async def listar_recibos_emitidos(
    fecha_desde: str = Query(..., description="Fecha inicial, formato 'YYYY-MM-DD'"),
    fecha_hasta: str = Query(..., description="Fecha final, formato 'YYYY-MM-DD'"),
    turno: str | None = Query(None),
    q: str | None = Query(None, description="Texto libre sobre cuenta/pagada/segmento"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lista las cuentas guardadas de Recibos Emitidos en un rango de fechas, opcionalmente filtradas."""
    stmt = select(ReciboEmitidoDetalle).where(
        ReciboEmitidoDetalle.fecha >= fecha_desde,
        ReciboEmitidoDetalle.fecha <= fecha_hasta,
    )
    if turno:
        stmt = stmt.where(ReciboEmitidoDetalle.turno == turno)
    if q:
        patron = f"%{q.lower()}%"
        stmt = stmt.where(
            func.lower(ReciboEmitidoDetalle.cuenta).like(patron)
            | func.lower(ReciboEmitidoDetalle.pagada).like(patron)
            | func.lower(ReciboEmitidoDetalle.segmento).like(patron)
        )
    stmt = stmt.order_by(ReciboEmitidoDetalle.fecha, ReciboEmitidoDetalle.hora)

    filas = (await db.execute(stmt)).scalars().all()
    return {"total": len(filas), "recibos": [_recibo_a_dict(f) for f in filas]}


@router.delete("")
async def eliminar_dia_recibos_emitidos(
    fecha: str = Query(..., description="Día a eliminar, formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Elimina todas las cuentas guardadas de Recibos Emitidos para un día puntual."""
    res_conteo = await db.execute(
        select(func.count()).select_from(ReciboEmitidoDetalle).where(ReciboEmitidoDetalle.fecha == fecha)
    )
    total = res_conteo.scalar_one()
    await db.execute(delete(ReciboEmitidoDetalle).where(ReciboEmitidoDetalle.fecha == fecha))
    await db.commit()
    return {"fecha": fecha, "eliminados": total}
