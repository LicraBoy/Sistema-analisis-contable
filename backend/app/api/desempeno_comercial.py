"""
Desempeño Comercial router — compara el mes elegido contra el periodo
anterior de igual duración: KPIs, productos/grupos/categorías/secciones que
explican el cambio, top ganadores/perdedores, productos nuevos, participación
y hallazgos automáticos. Ver `services/desempeno_comercial.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import (
    CatalogoProducto,
    ComandaEmitidaDetalle,
    ConfiguracionCosteo,
    CosteoIncrementoGrupo,
    CosteoPrecioSugeridoOverride,
    ReciboEmitidoDetalle,
)
from app.services.dependencia_productos import construir_tabla_dependencia
from app.services.desempeno_comercial import (
    construir_comparativo_dimension,
    construir_kpis_comparativos,
    construir_productos_comparados,
    construir_top_ganadores_perdedores,
    construir_top_impulsores_rapidos,
    generar_hallazgos_desempeno,
)
from app.services.mix_ventas import construir_mix_categoria_tipo, construir_mix_seccion_menu
from app.services.optimizacion_precios import (
    construir_analisis_costeo_productos,
    construir_comparacion_hora_feliz,
    construir_resumen_por_dimension,
    generar_hallazgos_costeo_productos,
)
from app.services.rangos_fecha import periodo_anterior
from app.services.ranking_productos import construir_ranking_grupos, construir_ranking_productos

router = APIRouter()


@router.get("")
async def obtener_desempeno_comercial(
    fecha_desde: date = Query(..., description="Inicio del rango, formato 'YYYY-MM-DD'"),
    fecha_hasta: date = Query(..., description="Fin del rango (incluido), formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    fecha_desde_anterior, fecha_hasta_anterior = periodo_anterior(fecha_desde, fecha_hasta)

    async def _comandas_en(desde: date, hasta: date) -> list:
        return (
            (
                await db.execute(
                    select(ComandaEmitidaDetalle).where(
                        ComandaEmitidaDetalle.fecha >= desde, ComandaEmitidaDetalle.fecha <= hasta
                    )
                )
            )
            .scalars()
            .all()
        )

    async def _recibos_en(desde: date, hasta: date) -> list:
        return (
            (
                await db.execute(
                    select(ReciboEmitidoDetalle).where(
                        ReciboEmitidoDetalle.fecha >= desde, ReciboEmitidoDetalle.fecha <= hasta
                    )
                )
            )
            .scalars()
            .all()
        )

    comandas = await _comandas_en(fecha_desde, fecha_hasta)
    recibos = await _recibos_en(fecha_desde, fecha_hasta)
    comandas_anterior = await _comandas_en(fecha_desde_anterior, fecha_hasta_anterior)
    recibos_anterior = await _recibos_en(fecha_desde_anterior, fecha_hasta_anterior)

    # Sin filtrar por punto_venta: mismo criterio que el resto de Análisis y
    # Profundidad (catalogo_productos.punto_venta no trae "Restaurante" tal cual).
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    productos_actual = construir_ranking_productos(comandas, catalogo)
    productos_anterior = construir_ranking_productos(comandas_anterior, catalogo)

    grupos_actual = construir_ranking_grupos(productos_actual)
    grupos_anterior = construir_ranking_grupos(productos_anterior)

    categoria_actual = construir_mix_categoria_tipo(comandas, catalogo)
    categoria_anterior = construir_mix_categoria_tipo(comandas_anterior, catalogo)

    seccion_actual = construir_mix_seccion_menu(comandas, catalogo)
    seccion_anterior = construir_mix_seccion_menu(comandas_anterior, catalogo)

    kpis = construir_kpis_comparativos(comandas, recibos, comandas_anterior, recibos_anterior)
    productos_comparados_dict = construir_productos_comparados(productos_actual, productos_anterior)
    comparados = productos_comparados_dict["comparados"]

    grupos_comparados = construir_comparativo_dimension(grupos_actual, grupos_anterior, "grupo")
    categoria_comparada = construir_comparativo_dimension(categoria_actual, categoria_anterior, "etiqueta")
    seccion_comparada = construir_comparativo_dimension(seccion_actual, seccion_anterior, "etiqueta")

    impulsores_rapidos = construir_top_impulsores_rapidos(comparados)
    top_ganadores_perdedores = construir_top_ganadores_perdedores(comparados)

    tabla_dependencia = construir_tabla_dependencia(productos_actual)

    participacion_grupos = sorted(grupos_comparados, key=lambda g: g["pct_participacion"], reverse=True)

    hallazgos = generar_hallazgos_desempeno(
        grupos_comparados=grupos_comparados,
        seccion_comparada=seccion_comparada,
        top_ganadores=top_ganadores_perdedores["ganadores"],
        top_perdedores=top_ganadores_perdedores["perdedores"],
        top5_pct_productos=tabla_dependencia["top5_pct"],
    )

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "fecha_desde_anterior": fecha_desde_anterior.isoformat(),
        "fecha_hasta_anterior": fecha_hasta_anterior.isoformat(),
        "kpis": kpis,
        "productos_comparados": impulsores_rapidos,
        "grupos_comparados": grupos_comparados,
        "categoria_comparada": categoria_comparada,
        "seccion_comparada": seccion_comparada,
        "top_ganadores": top_ganadores_perdedores["ganadores"],
        "top_perdedores": top_ganadores_perdedores["perdedores"],
        "productos_nuevos": productos_comparados_dict["nuevos"],
        "participacion_grupos": participacion_grupos,
        "hallazgos": hallazgos,
    }


@router.get("/optimizacion-precios")
async def obtener_optimizacion_precios(
    fecha_desde: date = Query(..., description="Inicio del rango, formato 'YYYY-MM-DD'"),
    fecha_hasta: date = Query(..., description="Fin del rango (incluido), formato 'YYYY-MM-DD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Foto de UN SOLO periodo (el mes elegido, sin comparación contra el
    anterior) — cruza Costeo con Comandas para analizar la rentabilidad real
    del catálogo (todo producto con match, no solo "REQ AJUSTE"), agrupado en
    la jerarquía Sección → Categoría → Grupo. Ver services/optimizacion_precios.py.
    """
    comandas = (
        (
            await db.execute(
                select(ComandaEmitidaDetalle).where(
                    ComandaEmitidaDetalle.fecha >= fecha_desde, ComandaEmitidaDetalle.fecha <= fecha_hasta
                )
            )
        )
        .scalars()
        .all()
    )
    catalogo = (await db.execute(select(CatalogoProducto))).scalars().all()

    config = {fila.clave: fila.valor for fila in (await db.execute(select(ConfiguracionCosteo))).scalars().all()}
    incrementos_por_grupo = {
        fila.grupo: fila.pct_incremento for fila in (await db.execute(select(CosteoIncrementoGrupo))).scalars().all()
    }
    overrides_precio_sugerido = {
        fila.nombre_producto: fila.precio_sugerido
        for fila in (await db.execute(select(CosteoPrecioSugeridoOverride))).scalars().all()
    }

    productos = construir_ranking_productos(comandas, catalogo)
    analisis = construir_analisis_costeo_productos(productos, incrementos_por_grupo, config, overrides_precio_sugerido)

    resumen_por_seccion = construir_resumen_por_dimension(analisis, "seccion_menu", config["pct_costo_objetivo"])
    resumen_por_categoria = construir_resumen_por_dimension(analisis, "categoria_tipo", config["pct_costo_objetivo"])
    resumen_por_grupo = construir_resumen_por_dimension(analisis, "grupo", config["pct_costo_objetivo"])

    hora_feliz = construir_comparacion_hora_feliz(analisis)
    incremento_potencial_total = round(
        sum(p["incremento_potencial"] for p in analisis if p["estado"] == "REQ AJUSTE"), 2
    )
    hallazgos = generar_hallazgos_costeo_productos(analisis, resumen_por_grupo, resumen_por_seccion, hora_feliz)

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "pct_costo_objetivo": round(config["pct_costo_objetivo"] * 100, 1),
        "productos": analisis,
        "resumen_por_seccion": resumen_por_seccion,
        "resumen_por_categoria": resumen_por_categoria,
        "resumen_por_grupo": resumen_por_grupo,
        "incremento_potencial_total": incremento_potencial_total,
        "hora_feliz": hora_feliz,
        "hallazgos": hallazgos,
    }
