"""
Catálogo de Productos — La Carreta de Mariscos router. Módulo independiente
del catálogo del restaurante y de Cafetería.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProductoCarretaMariscos
from app.services.catalogo_productos_carreta_mariscos import (
    leer_excel_catalogo_carreta_mariscos,
    parsear_catalogo_carreta_mariscos,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _producto_a_dict(producto: CatalogoProductoCarretaMariscos) -> dict:
    return {
        "id": producto.id,
        "punto_venta": producto.punto_venta,
        "grupo": producto.grupo,
        "nombre_producto": producto.nombre_producto,
        "tipo": producto.tipo,
        "categoria_tipo": producto.categoria_tipo,
        "costo": producto.costo,
        "precio_venta": producto.precio_venta,
    }


@router.post("/upload")
async def upload_catalogo_carreta_mariscos(
    archivo: UploadFile = File(..., description="Excel de catálogo de La Carreta de Mariscos"),
    confirmar_reemplazo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Parsea el Excel de catálogo de La Carreta de Mariscos y reemplaza todo
    el contenido de `catalogo_productos_carreta_mariscos`. Si ya hay
    productos guardados y no se envió `confirmar_reemplazo=true`, no toca
    nada y pide confirmación.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_catalogo_carreta_mariscos(contenido)
        registros = parsear_catalogo_carreta_mariscos(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error al procesar el archivo de catálogo de La Carreta de Mariscos")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not registros:
        raise HTTPException(status_code=400, detail="No se encontraron productos en el archivo")

    total_existentes = (
        await db.execute(select(func.count()).select_from(CatalogoProductoCarretaMariscos))
    ).scalar_one()

    if total_existentes > 0 and not confirmar_reemplazo:
        return {"requiere_confirmacion": True, "total_existentes": total_existentes}

    await db.execute(delete(CatalogoProductoCarretaMariscos))
    db.add_all([CatalogoProductoCarretaMariscos(**registro) for registro in registros])
    await db.commit()

    por_grupo: dict[str, int] = {}
    for registro in registros:
        por_grupo[registro["grupo"]] = por_grupo.get(registro["grupo"], 0) + 1

    return {"total": len(registros), "por_grupo": por_grupo}


@router.get("")
async def listar_catalogo_carreta_mariscos(
    grupo: str | None = Query(None),
    categoria_tipo: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lista el catálogo de La Carreta de Mariscos guardado, opcionalmente filtrado por grupo y/o categoría."""
    stmt = select(CatalogoProductoCarretaMariscos).order_by(
        CatalogoProductoCarretaMariscos.grupo, CatalogoProductoCarretaMariscos.nombre_producto
    )
    if grupo:
        stmt = stmt.where(CatalogoProductoCarretaMariscos.grupo == grupo)
    if categoria_tipo:
        stmt = stmt.where(CatalogoProductoCarretaMariscos.categoria_tipo == categoria_tipo)

    productos = (await db.execute(stmt)).scalars().all()
    return {"total": len(productos), "productos": [_producto_a_dict(p) for p in productos]}
