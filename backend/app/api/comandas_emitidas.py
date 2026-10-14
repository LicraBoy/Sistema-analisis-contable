"""
Comandas Emitidas router — Fase 1 de "Inteligencia de Negocio" dentro de
Catálogo de Productos (Restaurante). Un archivo puede cubrir varios días
(semanal/mensual); el reemplazo al volver a subir es por día, no por
archivo completo — ver `upload_comandas_emitidas`.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle
from app.services.comandas_emitidas import (
    clasificar_productos_contra_catalogo,
    leer_excel_comandas,
    parsear_comandas_emitidas,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _comanda_a_dict(fila: ComandaEmitidaDetalle) -> dict:
    return {
        "id": fila.id,
        "fecha": fila.fecha.isoformat(),
        "hora": fila.hora.isoformat(),
        "turno": fila.turno,
        "mesa": fila.mesa,
        "cuenta": fila.cuenta,
        "producto": fila.producto,
        "grupo": fila.grupo,
        "categoria_tipo": fila.categoria_tipo,
        "seccion_menu": fila.seccion_menu,
        "producto_catalogo_encontrado": fila.producto_catalogo_encontrado,
        "cantidad": fila.cantidad,
        "estatus": fila.estatus,
    }


@router.post("/upload")
async def upload_comandas_emitidas(
    archivo: UploadFile = File(..., description="Excel de Comandas Emitidas del Restaurante"),
    confirmar_reemplazo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Parsea el Excel (puede traer varios días), hereda grupo/categoria_tipo/
    seccion_menu del Catálogo de Productos por nombre, y guarda el
    resultado. Si alguno de los días del archivo ya tiene filas guardadas y
    no se envió `confirmar_reemplazo=true`, no toca nada y responde con la
    lista de fechas en conflicto para pedir una sola confirmación por lote;
    al confirmar, se reemplazan SOLO esos días — los demás días ya
    guardados que no vienen en este archivo quedan intactos.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_comandas(contenido)
        registros = parsear_comandas_emitidas(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error al procesar el archivo de Comandas Emitidas")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not registros:
        raise HTTPException(status_code=400, detail="No se encontraron productos ordenados en el archivo")

    fechas = sorted({registro["fecha"] for registro in registros})

    if not confirmar_reemplazo:
        res_conteo = await db.execute(
            select(ComandaEmitidaDetalle.fecha, func.count())
            .where(ComandaEmitidaDetalle.fecha.in_(fechas))
            .group_by(ComandaEmitidaDetalle.fecha)
        )
        conflictos = res_conteo.all()
        if conflictos:
            return {
                "requiere_confirmacion": True,
                "fechas_conflicto": [
                    {"fecha": fecha.isoformat(), "total_existentes": total} for fecha, total in conflictos
                ],
            }

    # Sin filtrar por punto_venta: igual que productos_vendidos.py, porque el
    # valor real guardado en catalogo_productos.punto_venta (ej. "RESTAURANT")
    # no coincide con ningún texto fijo que valga la pena asumir aquí — un
    # filtro exacto sobre ese campo dejó `grupo=NULL` en el 100% de las filas
    # la primera vez que se probó esta ruta (bug real, ya corregido).
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()
    clasificar_productos_contra_catalogo(registros, catalogo)

    await db.execute(delete(ComandaEmitidaDetalle).where(ComandaEmitidaDetalle.fecha.in_(fechas)))
    db.add_all([ComandaEmitidaDetalle(**registro) for registro in registros])
    await db.commit()

    por_turno: dict[str, int] = {}
    sin_match_catalogo = 0
    for registro in registros:
        por_turno[registro["turno"]] = por_turno.get(registro["turno"], 0) + 1
        if not registro["producto_catalogo_encontrado"]:
            sin_match_catalogo += 1

    return {
        "fechas_procesadas": [f.isoformat() for f in fechas],
        "total_filas": len(registros),
        "por_turno": por_turno,
        "sin_match_catalogo": sin_match_catalogo,
    }


@router.get("/dias")
async def listar_dias_comandas_emitidas(
    desde: str | None = Query(None, description="Fecha inicial, formato 'YYYY-MM-DD'"),
    hasta: str | None = Query(None, description="Fecha final, formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Regresa los días guardados de Comandas Emitidas, con el número de filas de cada uno."""
    stmt = select(ComandaEmitidaDetalle.fecha, func.count())
    if desde:
        stmt = stmt.where(ComandaEmitidaDetalle.fecha >= desde)
    if hasta:
        stmt = stmt.where(ComandaEmitidaDetalle.fecha <= hasta)
    stmt = stmt.group_by(ComandaEmitidaDetalle.fecha).order_by(ComandaEmitidaDetalle.fecha.desc())

    res = await db.execute(stmt)
    return {"dias": [{"fecha": fecha.isoformat(), "total": total} for fecha, total in res.all()]}


@router.get("")
async def listar_comandas_emitidas(
    fecha_desde: str = Query(..., description="Fecha inicial, formato 'YYYY-MM-DD'"),
    fecha_hasta: str = Query(..., description="Fecha final, formato 'YYYY-MM-DD'"),
    turno: str | None = Query(None),
    grupo: str | None = Query(None),
    q: str | None = Query(None, description="Texto libre sobre el nombre del producto"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lista las filas guardadas de Comandas Emitidas en un rango de fechas, opcionalmente filtradas."""
    stmt = select(ComandaEmitidaDetalle).where(
        ComandaEmitidaDetalle.fecha >= fecha_desde,
        ComandaEmitidaDetalle.fecha <= fecha_hasta,
    )
    if turno:
        stmt = stmt.where(ComandaEmitidaDetalle.turno == turno)
    if grupo:
        stmt = stmt.where(ComandaEmitidaDetalle.grupo == grupo)
    if q:
        stmt = stmt.where(func.lower(ComandaEmitidaDetalle.producto).like(f"%{q.lower()}%"))
    stmt = stmt.order_by(ComandaEmitidaDetalle.fecha, ComandaEmitidaDetalle.hora)

    filas = (await db.execute(stmt)).scalars().all()
    return {"total": len(filas), "comandas": [_comanda_a_dict(f) for f in filas]}


@router.delete("")
async def eliminar_dia_comandas_emitidas(
    fecha: str = Query(..., description="Día a eliminar, formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Elimina todas las filas guardadas de Comandas Emitidas para un día puntual."""
    res_conteo = await db.execute(
        select(func.count()).select_from(ComandaEmitidaDetalle).where(ComandaEmitidaDetalle.fecha == fecha)
    )
    total = res_conteo.scalar_one()
    await db.execute(delete(ComandaEmitidaDetalle).where(ComandaEmitidaDetalle.fecha == fecha))
    await db.commit()
    return {"fecha": fecha, "eliminados": total}
