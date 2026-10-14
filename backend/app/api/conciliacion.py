from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import math

from app.db.session import get_db
from app.models.cfdi_ingreso import CfdiIngreso
from app.models.pago import Pago

router = APIRouter()

@router.get("")
async def get_conciliacion(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    estado: str = Query(None, description="conciliado, faltante, multiples"),
    buscar: str = Query(None, description="Buscar por UUID o RFC"),
    fecha_desde: str = Query(None, description="Fecha inicio (YYYY-MM-DD), filtra por fecha del Ingreso"),
    fecha_hasta: str = Query(None, description="Fecha fin (YYYY-MM-DD), filtra por fecha del Ingreso"),
):
    # 1. Obtener todos los ingresos
    stmt_ingresos = select(CfdiIngreso)
    res_ingresos = await db.execute(stmt_ingresos)
    ingresos = res_ingresos.scalars().all()

    # 2. Obtener todos los pagos que tengan un UUID asignado
    stmt_pagos = select(Pago).where(Pago.uuid != None)
    res_pagos = await db.execute(stmt_pagos)
    pagos = res_pagos.scalars().all()

    # Agrupar pagos por UUID ignorando mayúsculas/minúsculas
    pagos_por_uuid = {}
    for p in pagos:
        uuid_lower = str(p.uuid).strip().lower()
        if uuid_lower not in pagos_por_uuid:
            pagos_por_uuid[uuid_lower] = []
        pagos_por_uuid[uuid_lower].append({
            "id": p.id,
            "uuid": p.uuid,
            "factura": p.factura,
            "tipo_movimiento": p.tipo_movimiento,
            "fecha": str(p.fecha) if p.fecha else None,
            "estado": p.estado.value,
            "observaciones": p.observaciones,
            "datos_extra": p.datos_extra,
            "archivo_id": p.archivo_id,
            "created_at": p.created_at.isoformat(),
            # Por construcción, todo pago que llega aquí ya está agrupado bajo
            # un UUID de un Ingreso existente (se recorre desde el lado de
            # Ingresos), así que siempre cuenta como verificado.
            "uuid_verificado": True,
        })

    # 3. Construir y filtrar la respuesta
    resultado = []
    
    buscar_lower = buscar.strip().lower() if buscar else None

    for ing in ingresos:
        # Aplicar filtro de búsqueda primero para optimizar
        if buscar_lower:
            uuid_ingreso = str(ing.uuid).lower()
            rfc_ingreso = str(ing.rfc_emisor).lower() if ing.rfc_emisor else ""
            if buscar_lower not in uuid_ingreso and buscar_lower not in rfc_ingreso:
                continue

        uuid_lower = str(ing.uuid).strip().lower()
        pagos_asociados = pagos_por_uuid.get(uuid_lower, [])

        # Aplicar filtro de fecha: usa la fecha del Ingreso Y/O la de cualquiera de
        # sus pagos asociados (la fecha del pago es más confiable, siempre está
        # poblada). Si no hay ninguna fecha disponible, no se excluye — es preferible
        # mostrarlo a ocultarlo en silencio.
        if fecha_desde or fecha_hasta:
            fechas_candidatas = []
            fecha_ingreso = ing.datos_extra.get("fecha") if ing.datos_extra else None
            if fecha_ingreso:
                fechas_candidatas.append(fecha_ingreso)
            fechas_candidatas.extend(p["fecha"] for p in pagos_asociados if p["fecha"])

            if fechas_candidatas:
                en_rango = any(
                    (not fecha_desde or f >= fecha_desde) and (not fecha_hasta or f <= fecha_hasta)
                    for f in fechas_candidatas
                )
                if not en_rango:
                    continue

        # "Duplicado" ya es un problema resuelto en Pagos (misma factura+monto+fecha+UUID
        # repetidos) — no debe contar como un pago adicional para efectos de conciliación.
        # Si en el grupo hay al menos un pago no-duplicado, se cuentan esos; si TODOS
        # los pagos del grupo son duplicados entre sí, se cuenta como 1 solo pago real.
        pagos_no_duplicados = [p for p in pagos_asociados if p["estado"] != "duplicado"]
        cantidad_efectiva = (
            len(pagos_no_duplicados) if pagos_no_duplicados
            else (1 if pagos_asociados else 0)
        )

        estado_conciliacion = "faltante"
        if cantidad_efectiva == 1:
            estado_conciliacion = "conciliado"
        elif cantidad_efectiva > 1:
            estado_conciliacion = "multiples"

        # Los ingresos sin ningún pago ("Faltante") no se muestran en Conciliación —
        # ya se ven en Pagos como "No Pagado"; aquí solo interesan los que sí tienen
        # pagos que revisar o confirmar.
        if estado_conciliacion == "faltante":
            continue

        # Aplicar filtro de estado
        if estado and estado_conciliacion != estado.lower():
            continue

        facturas_normalizadas = {str(p["factura"]).strip().upper() for p in pagos_asociados}
        mismo_factura = len(pagos_asociados) > 1 and len(facturas_normalizadas) == 1

        resultado.append({
            "ingreso": {
                "id": ing.id,
                "uuid": ing.uuid,
                "rfc_emisor": ing.rfc_emisor,
                "nombre_emisor": ing.nombre_emisor,
                "datos_extra": ing.datos_extra
            },
            "pagos_asociados": pagos_asociados,
            "estado_conciliacion": estado_conciliacion,
            "cantidad_pagos": len(pagos_asociados),
            "mismo_factura": mismo_factura,
        })

    # 4. Paginación
    total_items = len(resultado)
    total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1
    
    # Slice the results for the requested page
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_results = resultado[start_idx:end_idx]

    return {
        "data": paginated_results,
        "meta": {
            "total": total_items,
            "page": page,
            "page_size": page_size,
            "pages": total_pages
        }
    }
