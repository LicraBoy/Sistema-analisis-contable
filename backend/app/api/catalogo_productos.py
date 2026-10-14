"""
Catálogo de Productos router — catálogo maestro de recetas/productos.
Módulo independiente del flujo de Ingresos/Pagos/Conciliación, Facturación y
Pagos de Recepción.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto
from app.services.catalogo_productos import (
    leer_excel_catalogo_productos,
    parsear_catalogo_productos,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _producto_a_dict(producto: CatalogoProducto) -> dict:
    return {
        "id": producto.id,
        "punto_venta": producto.punto_venta,
        "grupo": producto.grupo,
        "nombre_producto": producto.nombre_producto,
        "tipo": producto.tipo,
        "categoria_tipo": producto.categoria_tipo,
        "seccion_menu": producto.seccion_menu,
        "dia_tematica": producto.dia_tematica,
        "evento_especial": producto.evento_especial,
        "costo": producto.costo,
        "precio_venta": producto.precio_venta,
    }


@router.post("/upload")
async def upload_catalogo_productos(
    archivo: UploadFile = File(..., description="Excel de catálogo de productos"),
    confirmar_reemplazo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Parsea el Excel de catálogo y reemplaza todo el contenido de
    `catalogo_productos`. Si ya hay productos guardados y no se envió
    `confirmar_reemplazo=true`, no toca nada y pide confirmación.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_catalogo_productos(contenido)
        registros = parsear_catalogo_productos(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error al procesar el archivo de catálogo de productos")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not registros:
        raise HTTPException(status_code=400, detail="No se encontraron productos en el archivo")

    total_existentes = (
        await db.execute(select(func.count()).select_from(CatalogoProducto))
    ).scalar_one()

    if total_existentes > 0 and not confirmar_reemplazo:
        return {"requiere_confirmacion": True, "total_existentes": total_existentes}

    await db.execute(delete(CatalogoProducto))
    db.add_all([CatalogoProducto(**registro) for registro in registros])
    await db.commit()

    por_grupo: dict[str, int] = {}
    por_categoria: dict[str, int] = {}
    por_seccion: dict[str, int] = {}
    por_dia_tematica: dict[str, int] = {}
    por_evento_especial: dict[str, int] = {}
    for registro in registros:
        por_grupo[registro["grupo"]] = por_grupo.get(registro["grupo"], 0) + 1
        por_categoria[registro["categoria_tipo"]] = por_categoria.get(registro["categoria_tipo"], 0) + 1
        por_seccion[registro["seccion_menu"]] = por_seccion.get(registro["seccion_menu"], 0) + 1
        if registro["dia_tematica"]:
            por_dia_tematica[registro["dia_tematica"]] = por_dia_tematica.get(registro["dia_tematica"], 0) + 1
        if registro["evento_especial"]:
            por_evento_especial[registro["evento_especial"]] = por_evento_especial.get(registro["evento_especial"], 0) + 1

    return {
        "total": len(registros),
        "por_grupo": por_grupo,
        "por_categoria": por_categoria,
        "por_seccion": por_seccion,
        "por_dia_tematica": por_dia_tematica,
        "por_evento_especial": por_evento_especial,
    }


@router.get("")
async def listar_catalogo_productos(
    grupo: str | None = Query(None),
    categoria_tipo: str | None = Query(None),
    seccion_menu: str | None = Query(None),
    dia_tematica: str | None = Query(None),
    evento_especial: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lista el catálogo guardado, opcionalmente filtrado por grupo, categoría de tipo, sección de menú, día temático y/o evento especial."""
    stmt = select(CatalogoProducto).order_by(CatalogoProducto.grupo, CatalogoProducto.nombre_producto)
    if grupo:
        stmt = stmt.where(CatalogoProducto.grupo == grupo)
    if categoria_tipo:
        stmt = stmt.where(CatalogoProducto.categoria_tipo == categoria_tipo)
    if seccion_menu:
        stmt = stmt.where(CatalogoProducto.seccion_menu == seccion_menu)
    if dia_tematica:
        stmt = stmt.where(CatalogoProducto.dia_tematica == dia_tematica)
    if evento_especial:
        stmt = stmt.where(CatalogoProducto.evento_especial == evento_especial)

    productos = (await db.execute(stmt)).scalars().all()
    return {"total": len(productos), "productos": [_producto_a_dict(p) for p in productos]}
