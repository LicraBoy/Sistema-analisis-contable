"""
Costeo de Recetas — Cafetería router. Calcado de `api/costeo_recetas.py`
(restaurante) pero sin `seccion_menu`/`categoria_tipo` — Cafetería es un
catálogo plano, un solo panel de Costeo, navegado solo por `grupo`. Reusa
tal cual las funciones de cálculo puro (`services/costeo_recetas.py`) y el
generador de Excel (`services/costeo_excel_export.py`): son utilidades
genéricas, sin nada específico del restaurante.
"""

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import (
    CatalogoProductoCafeteria,
    ConfiguracionCosteoCafeteria,
    CosteoIncrementoGrupoCafeteria,
    CosteoPrecioSugeridoOverrideCafeteria,
)
from app.services.costeo_excel_export import generar_reporte_costeo_excel
from app.services.costeo_recetas import configuracion_con_defaults, costeo_producto, costo_global_ponderado

router = APIRouter()


async def _cargar_configuracion(db: AsyncSession) -> dict[str, float]:
    filas = (await db.execute(select(ConfiguracionCosteoCafeteria))).scalars().all()
    return configuracion_con_defaults({fila.clave: fila.valor for fila in filas})


async def _cargar_incrementos(db: AsyncSession) -> dict[str, float]:
    filas = (await db.execute(select(CosteoIncrementoGrupoCafeteria))).scalars().all()
    return {fila.grupo: fila.pct_incremento for fila in filas}


async def _cargar_overrides_precio_sugerido(db: AsyncSession) -> dict[str, float]:
    filas = (await db.execute(select(CosteoPrecioSugeridoOverrideCafeteria))).scalars().all()
    return {fila.nombre_producto: fila.precio_sugerido for fila in filas}


@router.get("/configuracion")
async def obtener_configuracion_costeo(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Parámetros globales + % de incremento por grupo, todos editables."""
    config = await _cargar_configuracion(db)
    incrementos = await _cargar_incrementos(db)
    return {
        "configuracion": config,
        "incrementos_por_grupo": [
            {"grupo": grupo, "pct_incremento": pct} for grupo, pct in sorted(incrementos.items())
        ],
    }


class ActualizarConfiguracionPayload(BaseModel):
    iva_factor: float | None = None
    descuento_pct: float | None = None
    pct_costo_objetivo: float | None = None
    incremento_default: float | None = None


@router.put("/configuracion")
async def actualizar_configuracion_costeo(
    payload: ActualizarConfiguracionPayload,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Actualiza uno o varios parámetros globales (los que vengan no-None en el body)."""
    cambios = payload.model_dump(exclude_none=True)
    if not cambios:
        raise HTTPException(status_code=400, detail="No se envió ningún parámetro para actualizar")

    for clave, valor in cambios.items():
        fila = await db.get(ConfiguracionCosteoCafeteria, clave)
        if fila is None:
            db.add(ConfiguracionCosteoCafeteria(clave=clave, valor=valor))
        else:
            fila.valor = valor
    await db.commit()

    return {"configuracion": await _cargar_configuracion(db)}


class ActualizarIncrementoPayload(BaseModel):
    grupo: str
    pct_incremento: float


@router.put("/incremento-grupo")
async def actualizar_incremento_grupo(
    payload: ActualizarIncrementoPayload,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Actualiza (o crea) el % de incremento de un grupo puntual. `grupo` va en
    el body (no en la URL): un grupo con "/" en el nombre puede llegar
    decodificado antes de que el router compare el path, partiendo la ruta
    en dos y devolviendo 404.
    """
    fila = await db.get(CosteoIncrementoGrupoCafeteria, payload.grupo)
    if fila is None:
        db.add(CosteoIncrementoGrupoCafeteria(grupo=payload.grupo, pct_incremento=payload.pct_incremento))
    else:
        fila.pct_incremento = payload.pct_incremento
    await db.commit()

    return {"grupo": payload.grupo, "pct_incremento": payload.pct_incremento}


class ActualizarPrecioSugeridoPayload(BaseModel):
    nombre_producto: str
    precio_sugerido: float


@router.put("/precio-sugerido")
async def actualizar_precio_sugerido(
    payload: ActualizarPrecioSugeridoPayload,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Ajusta a mano el `precio_sugerido` de un producto puntual (identificado por nombre). `nombre_producto` va en el body, mismo motivo que `incremento-grupo`."""
    fila = await db.get(CosteoPrecioSugeridoOverrideCafeteria, payload.nombre_producto)
    if fila is None:
        db.add(
            CosteoPrecioSugeridoOverrideCafeteria(
                nombre_producto=payload.nombre_producto, precio_sugerido=payload.precio_sugerido
            )
        )
    else:
        fila.precio_sugerido = payload.precio_sugerido
    await db.commit()

    return {"nombre_producto": payload.nombre_producto, "precio_sugerido": payload.precio_sugerido}


@router.delete("/precio-sugerido")
async def eliminar_precio_sugerido(
    nombre_producto: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Quita el ajuste manual — vuelve a calcularse el precio sugerido por fórmula. `nombre_producto` va en query."""
    fila = await db.get(CosteoPrecioSugeridoOverrideCafeteria, nombre_producto)
    if fila is None:
        raise HTTPException(status_code=404, detail="No hay un ajuste manual guardado para ese producto")
    await db.delete(fila)
    await db.commit()

    return {"nombre_producto": nombre_producto}


@router.get("/productos")
async def costeo_productos(
    grupo: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Costeo calculado (% costo, precio sugerido, etc. + estado OK/REQ AJUSTE)
    de los productos que matcheen el filtro, más un resumen por grupo y el
    % de costo global ponderado del conjunto filtrado.
    """
    stmt = select(CatalogoProductoCafeteria).order_by(
        CatalogoProductoCafeteria.grupo, CatalogoProductoCafeteria.nombre_producto
    )
    if grupo:
        stmt = stmt.where(CatalogoProductoCafeteria.grupo == grupo)

    productos = (await db.execute(stmt)).scalars().all()
    config = await _cargar_configuracion(db)
    incrementos = await _cargar_incrementos(db)
    overrides_precio_sugerido = await _cargar_overrides_precio_sugerido(db)

    filas: list[dict] = []
    pct_costo_por_grupo: dict[str, list[float]] = {}
    for producto in productos:
        costeo = costeo_producto(producto, incrementos, config, overrides_precio_sugerido)
        filas.append(
            {
                "id": producto.id,
                "grupo": producto.grupo,
                "nombre_producto": producto.nombre_producto,
                "tipo": producto.tipo,
                "costo": producto.costo,
                "precio_venta": producto.precio_venta,
                **costeo,
            }
        )
        if costeo["pct_costo"] is not None:
            pct_costo_por_grupo.setdefault(producto.grupo, []).append(costeo["pct_costo"])

    resumen_por_grupo = [
        {
            "grupo": grupo_nombre,
            "pct_costo_promedio": sum(valores) / len(valores),
            "estado": "OK" if (sum(valores) / len(valores)) <= config["pct_costo_objetivo"] else "REQ AJUSTE",
        }
        for grupo_nombre, valores in sorted(pct_costo_por_grupo.items())
    ]

    return {
        "total": len(filas),
        "productos": filas,
        "resumen_por_grupo": resumen_por_grupo,
        "pct_costo_global": costo_global_ponderado(productos, config["iva_factor"]),
        "configuracion": config,
    }


@router.get("/export")
async def exportar_costeo_excel(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Exporta el catálogo completo de Cafetería a un .xlsx con fórmulas de
    Excel vivas y una hoja "Parámetros" editable — mismo formato que el del
    restaurante.
    """
    productos = list(
        (
            await db.execute(
                select(CatalogoProductoCafeteria).order_by(
                    CatalogoProductoCafeteria.grupo, CatalogoProductoCafeteria.nombre_producto
                )
            )
        )
        .scalars()
        .all()
    )
    if not productos:
        raise HTTPException(status_code=404, detail="No hay productos guardados en el catálogo de Cafetería")

    config = await _cargar_configuracion(db)
    incrementos = await _cargar_incrementos(db)
    overrides_precio_sugerido = await _cargar_overrides_precio_sugerido(db)

    excel_bytes = generar_reporte_costeo_excel(
        productos_por_seccion={"Cafetería": productos},
        config=config,
        incrementos_por_grupo=incrementos,
        overrides_precio_sugerido=overrides_precio_sugerido,
    )

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Costeo_Cafeteria.xlsx"},
    )
