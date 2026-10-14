"""
Ranking de Productos — popularidad, margen e ingreso por producto para un
rango de fechas (módulo "Inteligencia de Negocio" → "Análisis y
Profundidad" → tab Ranking, Restaurante). Se calcula al vuelo a partir de
Comandas Emitidas (cantidad) × Catálogo (costo/precio) — mismo criterio ya
establecido en `services/conciliacion_ventas_diarias.py` y
`services/resumen_ejecutivo.py`: el dinero nunca sale de Productos Vendidos,
que además es por lote y no encaja con un rango de fechas arbitrario.

No se ordena aquí — se devuelve una fila por producto con los 3 criterios
(cantidad, margen_pct, ingreso_total) ya calculados, y quien llama reordena
según el criterio que quiera mostrar (el frontend lo hace localmente, sin
volver a pedir datos al cambiar de criterio).
"""

from collections import defaultdict

from app.services.matching_productos import clasificar_producto_contra_catalogo_detallado


def construir_ranking_productos(comandas: list, catalogo: list) -> list[dict]:
    cantidad_por_producto: dict[str, float] = defaultdict(float)
    grupo_por_producto: dict[str, str | None] = {}

    for c in comandas:
        cantidad_por_producto[c.producto] += c.cantidad
        if c.producto not in grupo_por_producto:
            grupo_por_producto[c.producto] = c.grupo

    resultado = []
    for producto, cantidad in cantidad_por_producto.items():
        clasificacion, ambiguo = clasificar_producto_contra_catalogo_detallado(
            producto, catalogo, grupo_preferido=grupo_por_producto.get(producto)
        )
        costo = clasificacion["costo_catalogo"]
        precio_venta = clasificacion["precio_venta_catalogo"]

        margen_pct = round((precio_venta - costo) / precio_venta * 100, 1) if precio_venta else None
        ingreso_total = round(cantidad * precio_venta, 2) if precio_venta else 0.0

        resultado.append(
            {
                "producto": producto,
                "grupo": grupo_por_producto.get(producto),
                "categoria_tipo": clasificacion["categoria_tipo"],
                "seccion_menu": clasificacion["seccion_menu"],
                "cantidad": round(cantidad, 2),
                "costo": costo,
                "precio_venta": precio_venta,
                "margen_pct": margen_pct,
                "ingreso_total": ingreso_total,
                "producto_catalogo_encontrado": clasificacion["producto_catalogo_encontrado"],
                # Banderas de calidad de dato para Conciliación: el catálogo trae
                # varios precios para ese nombre / el match no tiene precio (>0).
                "precio_ambiguo": ambiguo,
                "sin_precio": clasificacion["producto_catalogo_encontrado"] and not precio_venta,
            }
        )

    return resultado


def agregar_variacion_periodo_anterior(productos: list[dict], productos_periodo_anterior: list[dict]) -> list[dict]:
    """
    Compara `cantidad` de cada producto contra el mismo producto en el
    periodo inmediato anterior (mismo largo de rango, ya resuelto por quien
    llama) — responde "¿qué productos están perdiendo demanda?" del brief.

    `variacion_pct_cantidad` es `None` cuando el producto no tenía venta en
    el periodo anterior: no se puede calcular un % sobre una base de 0, y
    tratarlo como "-100%" confundiría un producto genuinamente NUEVO con uno
    que se desplomó — son señales de negocio distintas.
    """
    cantidad_anterior_por_producto = {p["producto"]: p["cantidad"] for p in productos_periodo_anterior}

    resultado = []
    for p in productos:
        cantidad_anterior = cantidad_anterior_por_producto.get(p["producto"], 0.0)
        variacion_pct = (
            round((p["cantidad"] - cantidad_anterior) / cantidad_anterior * 100, 1) if cantidad_anterior else None
        )
        resultado.append({**p, "cantidad_periodo_anterior": cantidad_anterior, "variacion_pct_cantidad": variacion_pct})

    return resultado


def agregar_variacion_periodo_anterior_grupos(grupos: list[dict], grupos_periodo_anterior: list[dict]) -> list[dict]:
    """
    Análogo a `agregar_variacion_periodo_anterior` pero a nivel grupo,
    comparando `ingreso_total` (no `cantidad`: para "Alertas de Riesgo" lo
    que importa de un grupo es su tendencia de ingreso, no su volumen de
    piezas) — usado por `services/alertas_riesgo.py` para detectar grupos
    con tendencia negativa.

    `variacion_pct_ingreso` es `None` cuando el grupo no tenía ingreso en el
    periodo anterior (grupo nuevo): mismo criterio que la versión de
    productos, nunca un falso "-100%".
    """
    ingreso_anterior_por_grupo = {g["grupo"]: g["ingreso_total"] for g in grupos_periodo_anterior}

    resultado = []
    for g in grupos:
        ingreso_anterior = ingreso_anterior_por_grupo.get(g["grupo"], 0.0)
        variacion_pct = (
            round((g["ingreso_total"] - ingreso_anterior) / ingreso_anterior * 100, 1) if ingreso_anterior else None
        )
        resultado.append({**g, "ingreso_total_periodo_anterior": ingreso_anterior, "variacion_pct_ingreso": variacion_pct})

    return resultado


def construir_ranking_grupos(productos: list[dict]) -> list[dict]:
    """
    Agrega la lista YA construida por `construir_ranking_productos` por
    `grupo` (no vuelve a tocar Comandas/Catálogo) — responde la pregunta del
    brief "¿qué grupo de productos genera más ingreso?", que antes había que
    calcular a mano sumando filas del ranking por producto.

    `margen_pct` se calcula como `(ingreso_total - costo_total) / ingreso_total
    * 100`, donde `costo_total` es la suma de `cantidad × costo` solo de los
    productos del grupo que sí tuvieron match en catálogo — un producto sin
    match aporta su cantidad/ingreso (que ya es 0.0, no se inventa) pero no
    aporta costo, para no ensuciar el margen del grupo con un costo
    inexistente.

    `pct_participacion` (% del ingreso total de todos los grupos que aporta
    este grupo) sigue el mismo cálculo que `panel_turnos.py::construir_comparativo_turnos`
    para su propio `pct_participacion` — se agregó para "Mix de Ventas" y
    para el diagnóstico automático de mejor/peor día de Resumen Ejecutivo.
    """
    cantidad_por_grupo: dict[str, float] = defaultdict(float)
    ingreso_por_grupo: dict[str, float] = defaultdict(float)
    costo_total_por_grupo: dict[str, float] = defaultdict(float)

    for p in productos:
        grupo = p["grupo"] or "Sin Grupo"
        cantidad_por_grupo[grupo] += p["cantidad"]
        ingreso_por_grupo[grupo] += p["ingreso_total"]
        if p["costo"] is not None:
            costo_total_por_grupo[grupo] += p["cantidad"] * p["costo"]

    ingreso_general = sum(ingreso_por_grupo.values())

    resultado = []
    for grupo, cantidad in cantidad_por_grupo.items():
        ingreso_total = round(ingreso_por_grupo[grupo], 2)
        costo_total = costo_total_por_grupo.get(grupo, 0.0)
        margen_pct = round((ingreso_total - costo_total) / ingreso_total * 100, 1) if ingreso_total else None
        pct_participacion = round(ingreso_total / ingreso_general * 100, 1) if ingreso_general else 0.0
        resultado.append(
            {
                "grupo": grupo,
                "cantidad": round(cantidad, 2),
                "ingreso_total": ingreso_total,
                "margen_pct": margen_pct,
                "pct_participacion": pct_participacion,
            }
        )

    return resultado
