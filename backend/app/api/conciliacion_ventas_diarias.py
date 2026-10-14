"""
Conciliación de Ventas Diarias router — cruza Comandas Emitidas, Recibos
Emitidos y Productos Vendidos (Restaurante) para un día. Todo se calcula al
vuelo; ver `services/conciliacion_ventas_diarias.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ProductoVendidoDetalle, ReciboEmitidoDetalle
from app.services.conciliacion_ventas_diarias import (
    construir_cuentas_consolidadas,
    construir_productos_consolidados,
)

router = APIRouter()


@router.get("")
async def conciliar_ventas_diarias(
    fecha: date = Query(..., description="Día a conciliar, formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Cruza Comandas Emitidas + Recibos Emitidos (por cuenta, solo del día
    `fecha`) y Comandas Emitidas + Productos Vendidos (por producto) para
    un día. El lote de Productos Vendidos usado es el que cubre `fecha`
    (`fecha_desde <= fecha <= fecha_hasta`) — el guard de solape de
    `/productos-vendidos/upload` garantiza que hay a lo más uno.

    Ese lote puede cubrir más de un día (Productos Vendidos no trae fecha
    por fila, solo el rango que el usuario eligió al subir — a diferencia
    de Comandas/Recibos, que sí traen fecha por fila y por eso siempre se
    guardan día por día). Cuando el lote es más ancho que un solo día,
    comparar el producto contra solo las Comandas de `fecha` subestimaría
    la cantidad pedida frente al total del lote completo y produciría
    discrepancias falsas en casi todos los productos (confirmado con datos
    reales: 487 de 494 productos marcados con discrepancia al comparar 1
    día de Comandas contra un lote de 16 días) — así que en ese caso
    "Por Producto" compara contra Comandas sumado en **todo el rango del
    lote**, no solo `fecha`. "Por Cuenta" no se ve afectado por esto: sigue
    mostrando únicamente las cuentas de `fecha`.
    """
    comandas = (
        (await db.execute(select(ComandaEmitidaDetalle).where(ComandaEmitidaDetalle.fecha == fecha)))
        .scalars()
        .all()
    )
    recibos = (
        (await db.execute(select(ReciboEmitidoDetalle).where(ReciboEmitidoDetalle.fecha == fecha)))
        .scalars()
        .all()
    )
    productos_vendidos = (
        (
            await db.execute(
                select(ProductoVendidoDetalle).where(
                    ProductoVendidoDetalle.fecha_desde <= fecha, ProductoVendidoDetalle.fecha_hasta >= fecha
                )
            )
        )
        .scalars()
        .all()
    )
    # Sin filtrar por punto_venta: mismo criterio que productos_vendidos.py
    # y comandas_emitidas.py, dado que catalogo_productos.punto_venta no
    # trae el texto "Restaurante" tal cual (ver nota en comandas_emitidas.py).
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    # Nombres con historial de venta confirmado en CUALQUIER lote (no solo
    # el de `fecha`) — para distinguir, cuando un producto sale "sin match"
    # ese día, si es un producto real que Productos Vendidos simplemente no
    # incluyó en el reporte de ese día (ya confirmado como un patrón real:
    # productos con historial en otros meses que faltan un día puntual) de
    # uno que nunca se ha visto reportado.
    nombres_con_historial = set(
        (await db.execute(select(distinct(ProductoVendidoDetalle.nombre_producto)))).scalars().all()
    )

    productos_rango = None
    comandas_para_productos = comandas
    if productos_vendidos:
        lote_fecha_desde = productos_vendidos[0].fecha_desde
        lote_fecha_hasta = productos_vendidos[0].fecha_hasta
        if lote_fecha_desde != lote_fecha_hasta:
            productos_rango = {
                "fecha_desde": lote_fecha_desde.isoformat(),
                "fecha_hasta": lote_fecha_hasta.isoformat(),
            }
            comandas_para_productos = (
                (
                    await db.execute(
                        select(ComandaEmitidaDetalle).where(
                            ComandaEmitidaDetalle.fecha >= lote_fecha_desde,
                            ComandaEmitidaDetalle.fecha <= lote_fecha_hasta,
                        )
                    )
                )
                .scalars()
                .all()
            )

    cuentas = construir_cuentas_consolidadas(comandas, recibos)
    productos = construir_productos_consolidados(
        comandas_para_productos, productos_vendidos, catalogo, nombres_con_historial
    )

    return {
        "fecha": fecha.isoformat(),
        "cuentas": cuentas,
        "productos": productos,
        "productos_vendidos_disponible": len(productos_vendidos) > 0,
        "productos_rango": productos_rango,
    }
