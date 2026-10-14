"""
Dependencia de Productos — tabla de concentración de ingreso (estilo Pareto)
para un rango de fechas (módulo "Inteligencia de Negocio" → "Análisis y
Profundidad" → tab Dependencia, Restaurante). No vuelve a consultar
Comandas/Catálogo: recibe la lista ya construida por
`services/ranking_productos.py::construir_ranking_productos`.

`oportunidades_comerciales.py::_detectar_concentracion_ventas` ya hace una
versión parcial de este cálculo (top 20% de productos vs. umbral 70% de
ingreso) pero solo devuelve un booleano de alerta, no una tabla — este
archivo expone el cálculo completo (rank, % individual, % acumulado por
producto) para mostrarlo directamente, sin duplicar el detector de
oportunidades.
"""

_MIN_PRODUCTOS_DEPENDENCIA = 5  # mismo umbral que _detectar_concentracion_ventas


def construir_tabla_dependencia(productos: list[dict]) -> dict:
    """
    Filtra productos con `ingreso_total > 0` (igual que
    `_detectar_concentracion_ventas`: un producto sin ingreso no aporta nada
    al análisis de concentración), ordena descendente por `ingreso_total` y
    calcula `pct_individual`/`pct_acumulado` por fila (rank 1-based).

    Con menos de `_MIN_PRODUCTOS_DEPENDENCIA` productos con ingreso, no hay
    suficiente variedad para que "concentración" signifique algo — se
    devuelve la tabla vacía en vez de una tabla trivial de 1-2 filas al 100%.

    Empates en `ingreso_total` se resuelven por nombre de producto
    (alfabético) para que el orden sea determinista entre corridas.
    """
    con_ingreso = [p for p in productos if p["ingreso_total"] > 0]
    if len(con_ingreso) < _MIN_PRODUCTOS_DEPENDENCIA:
        return {"filas": [], "top5_pct": None, "top10_pct": None}

    ingreso_total_general = sum(p["ingreso_total"] for p in con_ingreso)
    if not ingreso_total_general:
        return {"filas": [], "top5_pct": None, "top10_pct": None}

    ordenados = sorted(con_ingreso, key=lambda p: (-p["ingreso_total"], p["producto"]))

    filas = []
    acumulado = 0.0
    for i, p in enumerate(ordenados, start=1):
        acumulado += p["ingreso_total"]
        filas.append(
            {
                "rank": i,
                "producto": p["producto"],
                "ingreso_total": p["ingreso_total"],
                "pct_individual": round(p["ingreso_total"] / ingreso_total_general * 100, 1),
                "pct_acumulado": round(acumulado / ingreso_total_general * 100, 1),
            }
        )

    top5_pct = filas[4]["pct_acumulado"] if len(filas) >= 5 else None
    top10_pct = filas[9]["pct_acumulado"] if len(filas) >= 10 else None

    return {"filas": filas, "top5_pct": top5_pct, "top10_pct": top10_pct}
