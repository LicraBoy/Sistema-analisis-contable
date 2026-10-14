"""
Productos Vendidos router — Fase 2 de Catálogo de Productos: sube el reporte
mensual de ventas por producto del Restaurante y hereda la clasificación del
Catálogo de Productos por nombre. Módulo independiente del flujo de
Ingresos/Pagos/Conciliación/Facturación/Pagos de Recepción.
"""

import logging
from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.descargas import cabecera_descarga
from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ConfiguracionCosteo, ProductoVendidoDetalle
from app.services.comparacion_iva import calcular_posibles_cortesias
from app.services.costeo_recetas import IVA_FACTOR_DEFAULT, PCT_COSTO_OBJETIVO_DEFAULT
from app.services.productos_vendidos import (
    heredar_clasificacion_catalogo,
    leer_excel_productos_vendidos,
    parsear_productos_vendidos,
)
from app.services.productos_vendidos_excel_export import generar_reporte_productos_vendidos_excel

logger = logging.getLogger(__name__)

router = APIRouter()


def _etiqueta_lote(fecha_desde: date, fecha_hasta: date) -> str:
    if fecha_desde == fecha_hasta:
        return fecha_desde.strftime("%d/%m/%Y")
    return f"{fecha_desde.strftime('%d/%m/%Y')} – {fecha_hasta.strftime('%d/%m/%Y')}"


def _producto_a_dict(producto: ProductoVendidoDetalle) -> dict:
    return {
        "id": producto.id,
        "fecha_desde": producto.fecha_desde.isoformat(),
        "fecha_hasta": producto.fecha_hasta.isoformat(),
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
        "categoria_tipo": producto.categoria_tipo,
        "seccion_menu": producto.seccion_menu,
        "producto_catalogo_encontrado": producto.producto_catalogo_encontrado,
        "costo_catalogo": producto.costo_catalogo,
        "precio_venta_catalogo": producto.precio_venta_catalogo,
    }


@router.post("/upload")
async def upload_productos_vendidos(
    archivo: UploadFile = File(..., description="Excel de Productos Vendidos del Restaurante"),
    fecha_desde: date = Form(..., description="Primer día que cubre el archivo, formato 'YYYY-MM-DD'"),
    fecha_hasta: date = Form(..., description="Último día que cubre el archivo, formato 'YYYY-MM-DD'"),
    confirmar_reemplazo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Parsea el Excel de Productos Vendidos, hereda categoria_tipo/seccion_menu
    del Catálogo de Productos vigente por nombre de producto, y guarda el
    resultado como un lote con el rango `fecha_desde`/`fecha_hasta` indicado
    (el archivo no trae fecha por fila, solo un rango "Desde/Hasta" que
    aplica a todas sus filas por igual — a diferencia de Comandas/Recibos
    Emitidos). Si el rango se traslapa con algún lote ya guardado y no se
    envió `confirmar_reemplazo=true`, no toca nada y pide confirmación
    listando los lotes en conflicto; al confirmar, esos lotes se reemplazan
    completos (no se puede partir un lote a la mitad).
    """
    if fecha_desde > fecha_hasta:
        raise HTTPException(status_code=400, detail="fecha_desde no puede ser posterior a fecha_hasta")
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        df = await leer_excel_productos_vendidos(contenido)
        registros = parsear_productos_vendidos(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error al procesar el archivo de Productos Vendidos")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not registros:
        raise HTTPException(status_code=400, detail="No se encontraron productos vendidos en el archivo")

    res_lotes_solapados = await db.execute(
        select(ProductoVendidoDetalle.fecha_desde, ProductoVendidoDetalle.fecha_hasta, func.count())
        .where(ProductoVendidoDetalle.fecha_desde <= fecha_hasta, ProductoVendidoDetalle.fecha_hasta >= fecha_desde)
        .group_by(ProductoVendidoDetalle.fecha_desde, ProductoVendidoDetalle.fecha_hasta)
    )
    lotes_solapados = res_lotes_solapados.all()

    if lotes_solapados and not confirmar_reemplazo:
        return {
            "requiere_confirmacion": True,
            "lotes_conflicto": [
                {"fecha_desde": d.isoformat(), "fecha_hasta": h.isoformat(), "total_existentes": total}
                for d, h, total in lotes_solapados
            ],
        }

    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()
    heredar_clasificacion_catalogo(registros, catalogo)

    for registro in registros:
        registro["fecha_desde"] = fecha_desde
        registro["fecha_hasta"] = fecha_hasta

    if lotes_solapados:
        pares = [(d, h) for d, h, _ in lotes_solapados]
        await db.execute(
            delete(ProductoVendidoDetalle).where(
                tuple_(ProductoVendidoDetalle.fecha_desde, ProductoVendidoDetalle.fecha_hasta).in_(pares)
            )
        )
    db.add_all([ProductoVendidoDetalle(**registro) for registro in registros])
    await db.commit()

    por_grupo: dict[str, int] = {}
    por_categoria_tipo: dict[str, int] = {}
    por_seccion_menu: dict[str, int] = {}
    sin_match_catalogo = 0
    for registro in registros:
        por_grupo[registro["grupo"]] = por_grupo.get(registro["grupo"], 0) + 1
        if registro["categoria_tipo"]:
            por_categoria_tipo[registro["categoria_tipo"]] = por_categoria_tipo.get(registro["categoria_tipo"], 0) + 1
        if registro["seccion_menu"]:
            por_seccion_menu[registro["seccion_menu"]] = por_seccion_menu.get(registro["seccion_menu"], 0) + 1
        if not registro["producto_catalogo_encontrado"]:
            sin_match_catalogo += 1

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "total": len(registros),
        "por_grupo": por_grupo,
        "por_categoria_tipo": por_categoria_tipo,
        "por_seccion_menu": por_seccion_menu,
        "sin_match_catalogo": sin_match_catalogo,
    }


@router.get("/lotes")
async def listar_lotes_productos_vendidos(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Regresa los lotes guardados de Productos Vendidos (cada uno con su
    rango fecha_desde/fecha_hasta), con el número de filas de cada uno.
    `fecha_desde` es una llave única de lote: el guard de solape en
    `/upload` impide que dos lotes se traslapen, así que no pueden
    compartir `fecha_desde` sin ser el mismo lote.
    """
    res = await db.execute(
        select(ProductoVendidoDetalle.fecha_desde, ProductoVendidoDetalle.fecha_hasta, func.count())
        .group_by(ProductoVendidoDetalle.fecha_desde, ProductoVendidoDetalle.fecha_hasta)
        .order_by(ProductoVendidoDetalle.fecha_desde.desc())
    )
    return {
        "lotes": [
            {
                "fecha_desde": fecha_desde.isoformat(),
                "fecha_hasta": fecha_hasta.isoformat(),
                "etiqueta": _etiqueta_lote(fecha_desde, fecha_hasta),
                "total": total,
            }
            for fecha_desde, fecha_hasta, total in res.all()
        ]
    }


@router.get("")
async def listar_productos_vendidos(
    fecha_desde: date = Query(..., description="fecha_desde del lote a consultar, formato 'YYYY-MM-DD'"),
    grupo: str | None = Query(None),
    categoria_tipo: str | None = Query(None),
    seccion_menu: str | None = Query(None),
    q: str | None = Query(None, description="Texto libre sobre el nombre del producto"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lista los productos vendidos guardados de un lote, opcionalmente filtrados por grupo/clasificación/texto."""
    stmt = select(ProductoVendidoDetalle).where(ProductoVendidoDetalle.fecha_desde == fecha_desde)
    if grupo:
        stmt = stmt.where(ProductoVendidoDetalle.grupo == grupo)
    if categoria_tipo:
        stmt = stmt.where(ProductoVendidoDetalle.categoria_tipo == categoria_tipo)
    if seccion_menu:
        stmt = stmt.where(ProductoVendidoDetalle.seccion_menu == seccion_menu)
    if q:
        stmt = stmt.where(func.lower(ProductoVendidoDetalle.nombre_producto).like(f"%{q.lower()}%"))
    stmt = stmt.order_by(ProductoVendidoDetalle.grupo, ProductoVendidoDetalle.nombre_producto)

    productos = (await db.execute(stmt)).scalars().all()
    return {"total": len(productos), "productos": [_producto_a_dict(p) for p in productos]}


@router.delete("")
async def eliminar_lote_productos_vendidos(
    fecha_desde: date = Query(..., description="fecha_desde del lote a eliminar, formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Elimina todas las filas guardadas de Productos Vendidos para el lote que empieza en `fecha_desde`."""
    res_conteo = await db.execute(
        select(func.count())
        .select_from(ProductoVendidoDetalle)
        .where(ProductoVendidoDetalle.fecha_desde == fecha_desde)
    )
    total = res_conteo.scalar_one()
    await db.execute(delete(ProductoVendidoDetalle).where(ProductoVendidoDetalle.fecha_desde == fecha_desde))
    await db.commit()
    return {"fecha_desde": fecha_desde.isoformat(), "eliminados": total}


@router.get("/comparar-iva")
async def calcular_cortesias_productos_vendidos(
    fecha_desde: date = Query(..., description="fecha_desde del lote a calcular, formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Calcula, para cada producto del lote, el ingreso real implícito en su
    Impuesto (Impuesto / 0.16) y lo compara contra su Subtotal registrado —
    la diferencia es una posible cortesía. Ya no depende de un segundo
    archivo: todo sale de Productos Vendidos (columnas Subtotal e
    Impuesto). Regresa todas las filas, ordenadas por monto de cortesía
    descendente.
    """
    productos_vendidos = (
        (await db.execute(select(ProductoVendidoDetalle).where(ProductoVendidoDetalle.fecha_desde == fecha_desde)))
        .scalars()
        .all()
    )

    resultado = calcular_posibles_cortesias(productos_vendidos)
    return {"fecha_desde": fecha_desde.isoformat(), **resultado}


@router.get("/export")
async def exportar_productos_vendidos_excel(
    fecha_desde: date = Query(..., description="fecha_desde del lote a exportar, formato 'YYYY-MM-DD'"),
    grupo: str | None = Query(None, description="Si viene, exporta solo ese grupo; si no, exporta el lote completo"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Exporta a Excel los Productos Vendidos de un lote — de un solo grupo
    (si `grupo` viene) o del lote completo en una sola hoja (si no).
    Incluye `% Costo` calculado con el Costo/Precio de Venta del Catálogo,
    mismo criterio que ya usa la tabla en pantalla.
    """
    stmt = select(ProductoVendidoDetalle).where(ProductoVendidoDetalle.fecha_desde == fecha_desde)
    if grupo:
        stmt = stmt.where(ProductoVendidoDetalle.grupo == grupo)
    stmt = stmt.order_by(ProductoVendidoDetalle.grupo, ProductoVendidoDetalle.nombre_producto)

    productos = (await db.execute(stmt)).scalars().all()
    if not productos:
        detalle = f"No hay productos guardados para el lote que empieza en '{fecha_desde}'"
        if grupo:
            detalle += f" en el grupo '{grupo}'"
        raise HTTPException(status_code=404, detail=detalle)

    filas_config = (await db.execute(select(ConfiguracionCosteo))).scalars().all()
    config = {"iva_factor": IVA_FACTOR_DEFAULT, "pct_costo_objetivo": PCT_COSTO_OBJETIVO_DEFAULT}
    config.update({fila.clave: fila.valor for fila in filas_config})

    etiqueta = _etiqueta_lote(productos[0].fecha_desde, productos[0].fecha_hasta)
    titulo = f"Productos Vendidos — {etiqueta}" + (f" — {grupo}" if grupo else " — Todos los grupos")
    excel_bytes = generar_reporte_productos_vendidos_excel(productos, config, titulo)

    nombre_archivo = f"ProductosVendidos_{fecha_desde.isoformat()}" + (f"_{grupo}" if grupo else "") + ".xlsx"
    nombre_archivo = nombre_archivo.replace(" ", "_")
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=cabecera_descarga(nombre_archivo),
    )
