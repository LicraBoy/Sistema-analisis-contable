"""
Ingeniería de Menú (Menu Engineering) — clasifica cada producto en 4
cuadrantes combinando popularidad e rentabilidad (módulo "Inteligencia de
Negocio" → "Análisis y Profundidad" → tab Ingeniería de Menú, Restaurante).

No vuelve a consultar Comandas/Catálogo: recibe la lista ya construida por
`services/ranking_productos.py::construir_ranking_productos`, mismo criterio
de reuso ya establecido por `oportunidades_comerciales.py` y `panel_turnos.py`.

Cuadrantes:
- Estrella: alta popularidad + alta rentabilidad.
- Caballo de Batalla: alta popularidad + baja rentabilidad.
- Rompecabezas: baja popularidad + alta rentabilidad.
- Perro: baja popularidad + baja rentabilidad.
"""

_MIN_PRODUCTOS_MENU_ENGINEERING = 4  # mismo umbral que _detectar_productos_desaprovechados


def clasificar_menu_engineering(productos: list[dict]) -> dict:
    """
    Corte de popularidad = mediana de `cantidad` entre productos con margen
    conocido (no promedio: la cantidad suele tener cola larga, con pocos
    productos dominando el volumen, y la mediana no se deja arrastrar por
    esos outliers). Corte de rentabilidad = promedio de `margen_pct` entre
    esos mismos productos — mismo criterio de "margen_promedio" que ya usa
    `oportunidades_comerciales.py::_detectar_productos_desaprovechados`.

    Productos sin `margen_pct` (sin match de catálogo) no pueden clasificarse
    en el eje de rentabilidad — van a `sin_clasificar`, nunca se les asigna
    un cuadrante inventado.

    Con menos de `_MIN_PRODUCTOS_MENU_ENGINEERING` productos con margen
    conocido, no se clasifica nada (los cortes con tan poca muestra no serían
    representativos).

    Empates exactos en el corte de popularidad o de margen se consideran
    "alta" (>=), no "baja" — mismo espíritu que el resto de umbrales de este
    módulo, que usan `>=`/`<=` explícitos.
    """
    con_margen = [p for p in productos if p["margen_pct"] is not None]
    sin_clasificar = [p for p in productos if p["margen_pct"] is None]

    if len(con_margen) < _MIN_PRODUCTOS_MENU_ENGINEERING:
        return {
            "corte_popularidad": None,
            "corte_margen": None,
            "productos": [],
            "sin_clasificar": productos,
        }

    cantidades = sorted(p["cantidad"] for p in con_margen)
    n = len(cantidades)
    corte_popularidad = (
        cantidades[n // 2]
        if n % 2 == 1
        else round((cantidades[n // 2 - 1] + cantidades[n // 2]) / 2, 2)
    )
    corte_margen = round(sum(p["margen_pct"] for p in con_margen) / len(con_margen), 1)

    clasificados = []
    for p in con_margen:
        popular = p["cantidad"] >= corte_popularidad
        rentable = p["margen_pct"] >= corte_margen
        if popular and rentable:
            cuadrante = "estrella"
        elif popular and not rentable:
            cuadrante = "caballo_batalla"
        elif not popular and rentable:
            cuadrante = "rompecabezas"
        else:
            cuadrante = "perro"
        clasificados.append({**p, "cuadrante": cuadrante})

    return {
        "corte_popularidad": corte_popularidad,
        "corte_margen": corte_margen,
        "productos": clasificados,
        "sin_clasificar": sin_clasificar,
    }
