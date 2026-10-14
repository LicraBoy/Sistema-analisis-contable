"""
Costeo de Recetas router — % de costo y precio sugerido calculados en vivo
sobre el catálogo de productos, con parámetros de negocio editables (IVA,
% descuento, % costo objetivo, % incremento por grupo). Módulo independiente
del flujo de Ingresos/Pagos/Conciliación/Facturación/Pagos de Recepción;
comparte la tabla `catalogo_productos` solo para lectura.
"""

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.descargas import cabecera_descarga
from app.core.security import get_current_user
from app.db.session import get_db
from app.models import CatalogoProducto, ConfiguracionCosteo, CosteoIncrementoGrupo, CosteoPrecioSugeridoOverride
from app.services.costeo_excel_export import generar_reporte_costeo_excel
from app.services.costeo_recetas import configuracion_con_defaults, costeo_producto, costo_global_ponderado

router = APIRouter()


async def _cargar_configuracion(db: AsyncSession) -> dict[str, float]:
    filas = (await db.execute(select(ConfiguracionCosteo))).scalars().all()
    return configuracion_con_defaults({fila.clave: fila.valor for fila in filas})


async def _cargar_incrementos(db: AsyncSession) -> dict[str, float]:
    filas = (await db.execute(select(CosteoIncrementoGrupo))).scalars().all()
    return {fila.grupo: fila.pct_incremento for fila in filas}


async def _cargar_overrides_precio_sugerido(db: AsyncSession) -> dict[str, float]:
    filas = (await db.execute(select(CosteoPrecioSugeridoOverride))).scalars().all()
    return {fila.nombre_producto: fila.precio_sugerido for fila in filas}


# Valor reservado de `categoria_tipo` (no colisiona con los reales
# Alimentos/Bebidas/Otros) para pedir "solo Eventos Especiales" de una
# sección en vez de un filtro de categoría — hoy solo aplica a Comida-Cena,
# la única sección con productos de Noches Temáticas/Días Especiales.
EVENTOS_ESPECIALES_MARCADOR = "EventosEspeciales"


def _aplicar_filtro_categoria_o_eventos(stmt, categoria_tipo: str | None):
    """
    Filtro compartido por `_cargar_productos_seccion` y `GET /productos` —
    para que la vista interactiva y el Excel exportado siempre incluyan
    exactamente los mismos productos. Con el marcador de eventos, trae SOLO
    los productos de Noches Temáticas/Días Especiales (mezclando categorías
    a propósito: un evento es un menú completo, comida y bebida juntos). Sin
    el marcador, los EXCLUYE siempre (tengan o no filtro de categoría real) —
    para que no se cuelen en la hoja/vista regular de la sección.
    """
    if categoria_tipo == EVENTOS_ESPECIALES_MARCADOR:
        return stmt.where(or_(CatalogoProducto.dia_tematica.isnot(None), CatalogoProducto.evento_especial.isnot(None)))
    stmt = stmt.where(CatalogoProducto.dia_tematica.is_(None), CatalogoProducto.evento_especial.is_(None))
    if categoria_tipo:
        stmt = stmt.where(CatalogoProducto.categoria_tipo == categoria_tipo)
    return stmt


async def _cargar_productos_seccion(
    db: AsyncSession, seccion_menu: str, categoria_tipo: str | None
) -> list[CatalogoProducto]:
    """Productos de una sección (opcionalmente filtrados por categoría o por el marcador de eventos especiales) — compartido por los endpoints de exportación."""
    stmt = (
        select(CatalogoProducto)
        .where(CatalogoProducto.seccion_menu == seccion_menu)
        .order_by(CatalogoProducto.grupo, CatalogoProducto.nombre_producto)
    )
    stmt = _aplicar_filtro_categoria_o_eventos(stmt, categoria_tipo)
    return list((await db.execute(stmt)).scalars().all())


def _nombre_hoja_seccion(seccion_menu: str, categoria_tipo: str | None) -> str:
    if categoria_tipo == EVENTOS_ESPECIALES_MARCADOR:
        return "Eventos Especiales"
    return f"{seccion_menu} ({categoria_tipo})" if categoria_tipo else seccion_menu


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
        fila = await db.get(ConfiguracionCosteo, clave)
        if fila is None:
            db.add(ConfiguracionCosteo(clave=clave, valor=valor))
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
    el body (no en la URL): varios grupos reales traen "/" en el nombre
    (ej. "BOX LUNCH COMIDA Y/O CENA"), y un "/" codificado en un segmento de
    path puede llegar decodificado antes de que el router lo compare,
    partiendo la ruta en dos y devolviendo 404 — de ahí el bug reportado.
    """
    fila = await db.get(CosteoIncrementoGrupo, payload.grupo)
    if fila is None:
        db.add(CosteoIncrementoGrupo(grupo=payload.grupo, pct_incremento=payload.pct_incremento))
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
    """Ajusta a mano el `precio_sugerido` de un producto puntual (identificado por nombre, ver docstring del modelo). `nombre_producto` va en el body, mismo motivo que `incremento-grupo`."""
    fila = await db.get(CosteoPrecioSugeridoOverride, payload.nombre_producto)
    if fila is None:
        db.add(
            CosteoPrecioSugeridoOverride(
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
    """Quita el ajuste manual — vuelve a calcularse el precio sugerido por fórmula. `nombre_producto` va en query, no en la URL (mismo motivo que arriba)."""
    fila = await db.get(CosteoPrecioSugeridoOverride, nombre_producto)
    if fila is None:
        raise HTTPException(status_code=404, detail="No hay un ajuste manual guardado para ese producto")
    await db.delete(fila)
    await db.commit()

    return {"nombre_producto": nombre_producto}


@router.get("/productos")
async def costeo_productos(
    seccion_menu: str | None = Query(None),
    grupo: str | None = Query(None),
    categoria_tipo: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Costeo calculado (% costo, precio sugerido, etc. + estado OK/REQ AJUSTE)
    de los productos que matcheen los filtros, más un resumen por grupo
    (equivalente a la hoja RESUMEN del Excel) y el % de costo global
    ponderado del conjunto filtrado.
    """
    stmt = select(CatalogoProducto).order_by(CatalogoProducto.grupo, CatalogoProducto.nombre_producto)
    if seccion_menu:
        stmt = stmt.where(CatalogoProducto.seccion_menu == seccion_menu)
    if grupo:
        stmt = stmt.where(CatalogoProducto.grupo == grupo)
    stmt = _aplicar_filtro_categoria_o_eventos(stmt, categoria_tipo)

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
                "categoria_tipo": producto.categoria_tipo,
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
    seccion_menu: str = Query(..., description="Sección de menú a exportar, ej. 'Desayuno'"),
    categoria_tipo: str | None = Query(None, description="Filtra por categoría (Alimentos/Bebidas/Otros), ej. para Comida-Cena solo Alimentos"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Exporta el costeo de una sección (opcionalmente filtrada por categoría)
    a un .xlsx con fórmulas de Excel vivas (no valores ya calculados) y una
    hoja "Parámetros" editable — igual que el Excel original con el que
    trabajaba contabilidad.
    """
    productos = await _cargar_productos_seccion(db, seccion_menu, categoria_tipo)
    if not productos:
        raise HTTPException(status_code=404, detail=f"No hay productos guardados en la sección '{seccion_menu}'")

    config = await _cargar_configuracion(db)
    incrementos = await _cargar_incrementos(db)
    overrides_precio_sugerido = await _cargar_overrides_precio_sugerido(db)

    nombre_hoja = _nombre_hoja_seccion(seccion_menu, categoria_tipo)
    excel_bytes = generar_reporte_costeo_excel(
        productos_por_seccion={nombre_hoja: productos},
        config=config,
        incrementos_por_grupo=incrementos,
        overrides_precio_sugerido=overrides_precio_sugerido,
    )

    nombre_archivo = f"Costeo_{nombre_hoja}.xlsx".replace(" ", "_")
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=cabecera_descarga(nombre_archivo),
    )


@router.get("/export-todo")
async def exportar_costeo_completo(
    secciones: list[str] = Query(
        ...,
        description="Una entrada por sección a incluir: 'seccion_menu' o 'seccion_menu:categoria_tipo', ej. 'Comida-Cena:Alimentos'",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Exporta varias secciones en un solo libro (una hoja por sección), con
    una única hoja "Parámetros" y una única hoja "RESUMEN" combinando todos
    los grupos de todas las secciones incluidas — mismo criterio que ya usa
    `generar_reporte_costeo_excel` para una sola sección, pasándole ahora
    varias entradas de una vez.
    """
    productos_por_seccion: dict[str, list[CatalogoProducto]] = {}
    for entrada in secciones:
        seccion_menu, _, categoria_tipo = entrada.partition(":")
        categoria_tipo = categoria_tipo or None
        productos = await _cargar_productos_seccion(db, seccion_menu, categoria_tipo)
        if not productos:
            continue
        productos_por_seccion[_nombre_hoja_seccion(seccion_menu, categoria_tipo)] = productos

    if not productos_por_seccion:
        raise HTTPException(status_code=404, detail="Ninguna de las secciones solicitadas tiene productos guardados")

    config = await _cargar_configuracion(db)
    incrementos = await _cargar_incrementos(db)
    overrides_precio_sugerido = await _cargar_overrides_precio_sugerido(db)

    excel_bytes = generar_reporte_costeo_excel(
        productos_por_seccion=productos_por_seccion,
        config=config,
        incrementos_por_grupo=incrementos,
        overrides_precio_sugerido=overrides_precio_sugerido,
    )

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Costeo_Completo.xlsx"},
    )
