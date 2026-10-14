"""
Productos Vendidos router — Cafetería. Copia de api/productos_vendidos.py
(Restaurante), sin `categoria_tipo`/`seccion_menu` (el Catálogo de
Cafetería no los tiene).
"""

import logging
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.descargas import cabecera_descarga
from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProductoCafeteria, ConfiguracionCosteoCafeteria, ProductoVendidoDetalleCafeteria
from app.services.comparacion_iva_cafeteria import calcular_posibles_cortesias_cafeteria
from app.services.costeo_recetas import IVA_FACTOR_DEFAULT, PCT_COSTO_OBJETIVO_DEFAULT
from app.services.productos_vendidos_cafeteria import (
    heredar_clasificacion_catalogo_cafeteria,
    leer_excel_productos_vendidos_cafeteria,
    parsear_productos_vendidos_cafeteria,
)
from app.services.productos_vendidos_excel_export_cafeteria import generar_reporte_productos_vendidos_excel_cafeteria

logger = logging.getLogger(__name__)

router = APIRouter()


def _producto_a_dict(producto: ProductoVendidoDetalleCafeteria) -> dict:
    return {
        "id": producto.id,
        "periodo": producto.periodo,
        "punto_venta": producto.punto_venta,
        "grupo": producto.grupo,
        "nombre_producto": producto.nombre_producto,
        "costo": producto.costo,
        "precio_venta": producto.precio_venta,
        "cantidad": producto.cantidad,
        "total_costo": producto.total_costo,
        "descuento": producto.descuento,
        "subtotal": producto.subtotal,
        "impuesto": producto.impuesto,
        "total": producto.total,
        "producto_catalogo_encontrado": producto.producto_catalogo_encontrado,
        "costo_catalogo": producto.costo_catalogo,
        "precio_venta_catalogo": producto.precio_venta_catalogo,
    }


@router.post("/upload")
async def upload_productos_vendidos_cafeteria(
    archivo: UploadFile = File(..., description="Excel de Productos Vendidos de Cafetería"),
    periodo: str = Form(..., description="Periodo del archivo, formato 'YYYY-MM'"),
    confirmar_reemplazo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_productos_vendidos_cafeteria(contenido)
        registros = parsear_productos_vendidos_cafeteria(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error al procesar el archivo de Productos Vendidos de Cafetería")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not registros:
        raise HTTPException(status_code=400, detail="No se encontraron productos vendidos en el archivo")

    if not confirmar_reemplazo:
        res_conteo = await db.execute(
            select(func.count())
            .select_from(ProductoVendidoDetalleCafeteria)
            .where(ProductoVendidoDetalleCafeteria.periodo == periodo)
        )
        total_existentes = res_conteo.scalar_one()
        if total_existentes > 0:
            return {"requiere_confirmacion": True, "total_existentes": total_existentes}

    catalogo = (await db.execute(select(CatalogoProductoCafeteria))).scalars().all()
    heredar_clasificacion_catalogo_cafeteria(registros, catalogo)

    for registro in registros:
        registro["periodo"] = periodo

    await db.execute(delete(ProductoVendidoDetalleCafeteria).where(ProductoVendidoDetalleCafeteria.periodo == periodo))
    db.add_all([ProductoVendidoDetalleCafeteria(**registro) for registro in registros])
    await db.commit()

    por_grupo: dict[str, int] = {}
    sin_match_catalogo = 0
    for registro in registros:
        por_grupo[registro["grupo"]] = por_grupo.get(registro["grupo"], 0) + 1
        if not registro["producto_catalogo_encontrado"]:
            sin_match_catalogo += 1

    return {
        "periodo": periodo,
        "total": len(registros),
        "por_grupo": por_grupo,
        "sin_match_catalogo": sin_match_catalogo,
    }


@router.get("/periodos")
async def listar_periodos_productos_vendidos_cafeteria(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    res = await db.execute(
        select(ProductoVendidoDetalleCafeteria.periodo, func.count())
        .group_by(ProductoVendidoDetalleCafeteria.periodo)
        .order_by(ProductoVendidoDetalleCafeteria.periodo.desc())
    )
    return {"periodos": [{"periodo": periodo, "total": total} for periodo, total in res.all()]}


@router.get("")
async def listar_productos_vendidos_cafeteria(
    periodo: str = Query(..., description="Periodo a consultar, formato 'YYYY-MM'"),
    grupo: str | None = Query(None),
    q: str | None = Query(None, description="Texto libre sobre el nombre del producto"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    stmt = select(ProductoVendidoDetalleCafeteria).where(ProductoVendidoDetalleCafeteria.periodo == periodo)
    if grupo:
        stmt = stmt.where(ProductoVendidoDetalleCafeteria.grupo == grupo)
    if q:
        stmt = stmt.where(func.lower(ProductoVendidoDetalleCafeteria.nombre_producto).like(f"%{q.lower()}%"))
    stmt = stmt.order_by(ProductoVendidoDetalleCafeteria.grupo, ProductoVendidoDetalleCafeteria.nombre_producto)

    productos = (await db.execute(stmt)).scalars().all()
    return {"total": len(productos), "productos": [_producto_a_dict(p) for p in productos]}


@router.delete("")
async def eliminar_periodo_productos_vendidos_cafeteria(
    periodo: str = Query(..., description="Periodo a eliminar, formato 'YYYY-MM'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    res_conteo = await db.execute(
        select(func.count())
        .select_from(ProductoVendidoDetalleCafeteria)
        .where(ProductoVendidoDetalleCafeteria.periodo == periodo)
    )
    total = res_conteo.scalar_one()
    await db.execute(delete(ProductoVendidoDetalleCafeteria).where(ProductoVendidoDetalleCafeteria.periodo == periodo))
    await db.commit()
    return {"periodo": periodo, "eliminados": total}


@router.get("/comparar-iva")
async def calcular_cortesias_productos_vendidos_cafeteria(
    periodo: str = Query(..., description="Periodo a calcular, formato 'YYYY-MM'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    productos_vendidos = (
        (await db.execute(select(ProductoVendidoDetalleCafeteria).where(ProductoVendidoDetalleCafeteria.periodo == periodo)))
        .scalars()
        .all()
    )

    resultado = calcular_posibles_cortesias_cafeteria(productos_vendidos)
    return {"periodo": periodo, **resultado}


@router.get("/export")
async def exportar_productos_vendidos_excel_cafeteria(
    periodo: str = Query(..., description="Periodo a exportar, formato 'YYYY-MM'"),
    grupo: str | None = Query(None, description="Si viene, exporta solo ese grupo; si no, exporta el periodo completo"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    stmt = select(ProductoVendidoDetalleCafeteria).where(ProductoVendidoDetalleCafeteria.periodo == periodo)
    if grupo:
        stmt = stmt.where(ProductoVendidoDetalleCafeteria.grupo == grupo)
    stmt = stmt.order_by(ProductoVendidoDetalleCafeteria.grupo, ProductoVendidoDetalleCafeteria.nombre_producto)

    productos = (await db.execute(stmt)).scalars().all()
    if not productos:
        detalle = f"No hay productos guardados para el periodo '{periodo}'"
        if grupo:
            detalle += f" en el grupo '{grupo}'"
        raise HTTPException(status_code=404, detail=detalle)

    filas_config = (await db.execute(select(ConfiguracionCosteoCafeteria))).scalars().all()
    config = {"iva_factor": IVA_FACTOR_DEFAULT, "pct_costo_objetivo": PCT_COSTO_OBJETIVO_DEFAULT}
    config.update({fila.clave: fila.valor for fila in filas_config})

    titulo = f"Productos Vendidos Cafetería — {periodo}" + (f" — {grupo}" if grupo else " — Todos los grupos")
    excel_bytes = generar_reporte_productos_vendidos_excel_cafeteria(productos, config, titulo)

    nombre_archivo = f"ProductosVendidosCafeteria_{periodo}" + (f"_{grupo}" if grupo else "") + ".xlsx"
    nombre_archivo = nombre_archivo.replace(" ", "_")
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=cabecera_descarga(nombre_archivo),
    )
