"""
Optimización de Precios y Análisis de Costeo — sub-vista de "Desempeño
Comercial" (módulo "Inteligencia de Negocio" → "Análisis y Profundidad" →
Desempeño Comercial → Optimización de Precios, Restaurante). Cruza Costeo
(costo/precio/estado por producto) con Comandas del mes elegido (cuánto se
vendió realmente) para analizar la RENTABILIDAD real del catálogo — no solo
qué precios subir. Muestra TODO producto con match de catálogo (no solo
"REQ AJUSTE": el estado se usa para resaltar, no para filtrar) agrupado en la
misma jerarquía Sección → Categoría → Grupo que usa Catálogo/Ranking de
Productos, con un resumen de rentabilidad en cada nivel.

No reimplementa la fórmula de costeo: llama directo a
`services/costeo_recetas.py::calcular_costeo`, la misma función pura que ya
usa el tab Costeo — mismo `estado` ("OK"/"REQ AJUSTE"), mismo `precio_sugerido`.
Es una foto de UN SOLO periodo (el mes elegido), sin comparación contra el
periodo anterior — a diferencia del resto de "Desempeño Comercial".

Todo el dinero de "oportunidad" (subtotal, incremento potencial) se maneja
SIN IVA ("Subtotal = Venta sin IVA" — el IVA no representa utilidad para la
empresa), a diferencia de `ranking_productos.py::ingreso_total`, que sí es
bruto.
"""

from collections import defaultdict

from app.services.costeo_recetas import calcular_costeo

# Subconjunto de `services/catalogo_productos.py::GRUPOS_BAR` — ese incluye
# también cervezas/vinos/licores normales que NO son Hora Feliz, así que se
# declara aparte con solo los 5 grupos de Hora Feliz reales.
GRUPOS_HORA_FELIZ = {
    "HORA FELIZ CERVEZAS",
    "HORA FELIZ INTERNAC",
    "HORA FELIZ NAC 2X1",
    "HORA FELIZ TEQUILAS",
    "HORA FELIZ VINOS",
}

# Grupo de comparación de Hora Feliz — decisión confirmada con el usuario:
# el grupo literal "CERVEZAS" (no toda la sección Bar).
GRUPO_CERVEZAS = "CERVEZAS"

_MAX_PRODUCTOS_CONCENTRACION = 5  # mismo criterio "top 5" que dependencia_productos.py


def construir_analisis_costeo_productos(
    productos: list[dict],
    incrementos_por_grupo: dict[str, float],
    config: dict[str, float],
    overrides_precio_sugerido: dict[str, float],
) -> list[dict]:
    """
    `productos`: salida de `ranking_productos.py::construir_ranking_productos`
    para el mes elegido. A diferencia de la v1 (`construir_oportunidades_precio`),
    NO filtra por estado: todo producto con match de catálogo (costo/precio_venta
    conocidos) entra al resultado con su costeo completo — "REQ AJUSTE" se marca
    para que el frontend lo resalte, no para excluirlo ("productos sanos"
    también deben verse, es el punto del ajuste).
    """
    iva_factor = config["iva_factor"]
    analisis = []
    for p in productos:
        if p["costo"] is None or not p["precio_venta"]:
            continue

        grupo = p["grupo"] or ""
        pct_incremento = incrementos_por_grupo.get(grupo, config["incremento_default"])
        override = overrides_precio_sugerido.get(p["producto"])
        costeo = calcular_costeo(
            costo=p["costo"],
            precio_venta=p["precio_venta"],
            pct_incremento=pct_incremento,
            iva_factor=iva_factor,
            descuento_pct=config["descuento_pct"],
            pct_costo_objetivo=config["pct_costo_objetivo"],
            precio_sugerido_override=override,
        )

        ingreso_actual = p["ingreso_total"]
        subtotal_actual = round(ingreso_actual / iva_factor, 2)
        iva_actual = round(ingreso_actual - subtotal_actual, 2)
        subtotal_potencial = round(p["cantidad"] * costeo["precio_sugerido"] / iva_factor, 2)

        pct_costo_actual = round(costeo["pct_costo"] * 100, 1)
        pct_costo_objetivo = round(config["pct_costo_objetivo"] * 100, 1)

        analisis.append(
            {
                "producto": p["producto"],
                "grupo": p["grupo"],
                "categoria_tipo": p["categoria_tipo"],
                "seccion_menu": p["seccion_menu"],
                "cantidad_vendida": p["cantidad"],
                "costo_unitario": p["costo"],
                "precio_actual": p["precio_venta"],
                "precio_sugerido": costeo["precio_sugerido"],
                "pct_costo_actual": pct_costo_actual,
                "pct_costo_objetivo": pct_costo_objetivo,
                "diferencia_pct": round(pct_costo_actual - pct_costo_objetivo, 1),
                "subtotal_actual": subtotal_actual,
                "iva_actual": iva_actual,
                "subtotal_potencial": subtotal_potencial,
                "incremento_potencial": round(subtotal_potencial - subtotal_actual, 2),
                "estado": costeo["estado"],
                "es_hora_feliz": grupo in GRUPOS_HORA_FELIZ,
            }
        )

    return analisis


def _pct_costo_ponderado(productos_dim: list[dict]) -> float:
    """% de costo ponderado por cantidad*costo / subtotal total (mismo criterio que `costeo_recetas.py::costo_global_ponderado`, aplicado sobre cantidad vendida en vez de existencias)."""
    suma_costo_total = sum(p["costo_unitario"] * p["cantidad_vendida"] for p in productos_dim)
    suma_subtotal = sum(p["subtotal_actual"] for p in productos_dim)
    if suma_subtotal == 0:
        return 0.0
    return round(suma_costo_total / suma_subtotal * 100, 1)


def construir_resumen_por_dimension(
    productos_analizados: list[dict], campo: str, pct_costo_objetivo: float
) -> list[dict]:
    """
    Resumen de rentabilidad agrupado por `campo` ("seccion_menu",
    "categoria_tipo" o "grupo") — una sola función genérica reusada en los 3
    niveles de la jerarquía (mismo patrón que `mix_ventas.py`'s wrappers de
    una función genérica). `pct_costo_promedio` es PONDERADO (no un promedio
    simple de porcentajes), evitando que un producto de bajo volumen
    distorsione el % del grupo. `incremento_potencial_estimado` solo suma
    productos "REQ AJUSTE" — es "oportunidad", no aplica a productos ya sanos.
    """
    pct_objetivo_pct = round(pct_costo_objetivo * 100, 1)
    por_dimension: dict[str, list[dict]] = defaultdict(list)
    for p in productos_analizados:
        clave = p[campo] or "Sin Clasificar"
        por_dimension[clave].append(p)

    resumen = []
    for clave, productos_dim in por_dimension.items():
        pct_costo_promedio = _pct_costo_ponderado(productos_dim)
        incremento_potencial_estimado = round(
            sum(p["incremento_potencial"] for p in productos_dim if p["estado"] == "REQ AJUSTE"), 2
        )
        resumen.append(
            {
                "clave": clave,
                "productos": len(productos_dim),
                "cantidad_vendida": sum(p["cantidad_vendida"] for p in productos_dim),
                "subtotal": round(sum(p["subtotal_actual"] for p in productos_dim), 2),
                "pct_costo_promedio": pct_costo_promedio,
                "pct_costo_objetivo": pct_objetivo_pct,
                "diferencia_promedio": round(pct_costo_promedio - pct_objetivo_pct, 1),
                "incremento_potencial_estimado": incremento_potencial_estimado,
            }
        )

    resumen.sort(key=lambda r: r["incremento_potencial_estimado"], reverse=True)
    return resumen


def construir_comparacion_hora_feliz(productos_analizados: list[dict]) -> dict:
    """
    Compara los grupos de Hora Feliz contra el grupo literal "CERVEZAS"
    (decisión confirmada con el usuario, no "toda la sección Bar"): % de
    costo ponderado de cada lado, margen (= 100 - pct_costo, ya que
    `pct_costo` está sobre subtotal igual que en `calcular_costeo`, así que
    no hace falta una fórmula de margen aparte), y la utilidad potencial no
    capturada en Hora Feliz. Si falta algún lado, sus campos van en None —
    no se inventa un cero engañoso.
    """
    productos_hora_feliz = [p for p in productos_analizados if p["grupo"] in GRUPOS_HORA_FELIZ]
    productos_cervezas = [p for p in productos_analizados if p["grupo"] == GRUPO_CERVEZAS]

    pct_hora_feliz = _pct_costo_ponderado(productos_hora_feliz) if productos_hora_feliz else None
    pct_cervezas = _pct_costo_ponderado(productos_cervezas) if productos_cervezas else None

    margen_hora_feliz = round(100 - pct_hora_feliz, 1) if pct_hora_feliz is not None else None
    margen_cervezas = round(100 - pct_cervezas, 1) if pct_cervezas is not None else None
    diferencia_margen = (
        round(margen_hora_feliz - margen_cervezas, 1)
        if margen_hora_feliz is not None and margen_cervezas is not None
        else None
    )

    incremento_potencial_estimado = round(
        sum(p["incremento_potencial"] for p in productos_hora_feliz if p["estado"] == "REQ AJUSTE"), 2
    )

    return {
        "pct_costo_promedio_hora_feliz": pct_hora_feliz,
        "pct_costo_promedio_cervezas": pct_cervezas,
        "margen_pct_hora_feliz": margen_hora_feliz,
        "margen_pct_cervezas": margen_cervezas,
        "diferencia_margen": diferencia_margen,
        "incremento_potencial_estimado": incremento_potencial_estimado,
    }


def generar_hallazgos_costeo_productos(
    productos_analizados: list[dict],
    resumen_grupos: list[dict],
    resumen_secciones: list[dict],
    comparacion_hora_feliz: dict,
) -> list[dict]:
    """
    Mismo shape `{tipo, mensaje, tono, accion_sugerida}` que el resto del
    módulo. Sin productos "REQ AJUSTE" no hay nada que reportar (mismo
    criterio que v1: no fabricar hallazgos de "todo bien").
    """
    productos_req_ajuste = [p for p in productos_analizados if p["estado"] == "REQ AJUSTE"]
    if not productos_req_ajuste:
        return []

    hallazgos = []

    grupos_con_desviacion = [g for g in resumen_grupos if g["diferencia_promedio"] > 0]
    if grupos_con_desviacion:
        grupo_top = max(grupos_con_desviacion, key=lambda g: g["diferencia_promedio"])
        hallazgos.append(
            {
                "tipo": "grupo_mayor_desviacion",
                "mensaje": (
                    f"El grupo \"{grupo_top['clave']}\" opera {grupo_top['diferencia_promedio']} puntos por "
                    f"encima del % de costo objetivo."
                ),
                "tono": "negativo",
                "accion_sugerida": f"Revisa la estructura de costos y precios del grupo \"{grupo_top['clave']}\".",
            }
        )

    total_potencial_grupos = sum(g["incremento_potencial_estimado"] for g in resumen_grupos)
    if total_potencial_grupos:
        grupo_concentracion = max(resumen_grupos, key=lambda g: g["incremento_potencial_estimado"])
        pct_concentracion = round(grupo_concentracion["incremento_potencial_estimado"] / total_potencial_grupos * 100, 1)
        hallazgos.append(
            {
                "tipo": "grupo_mayor_concentracion",
                "mensaje": (
                    f"El grupo \"{grupo_concentracion['clave']}\" concentra el {pct_concentracion}% de toda la "
                    f"utilidad potencial no capturada."
                ),
                "tono": "neutral",
                "accion_sugerida": f"Prioriza el grupo \"{grupo_concentracion['clave']}\" — es el de mayor impacto económico.",
            }
        )

    if comparacion_hora_feliz["incremento_potencial_estimado"] > 0:
        hallazgos.append(
            {
                "tipo": "hora_feliz_utilidad_no_capturada",
                "mensaje": (
                    "Hora Feliz tiene una utilidad potencial no capturada de "
                    f"${comparacion_hora_feliz['incremento_potencial_estimado']:,.2f}."
                ),
                "tono": "negativo",
                "accion_sugerida": "Evalúa si los precios de Hora Feliz siguen siendo rentables frente a Cervezas.",
            }
        )

    total_potencial_productos = sum(p["incremento_potencial"] for p in productos_req_ajuste)
    if total_potencial_productos:
        productos_req_ajuste_ordenados = sorted(
            productos_req_ajuste, key=lambda p: p["incremento_potencial"], reverse=True
        )
        top_n = productos_req_ajuste_ordenados[:_MAX_PRODUCTOS_CONCENTRACION]
        pct_n = round(sum(p["incremento_potencial"] for p in top_n) / total_potencial_productos * 100, 1)
        hallazgos.append(
            {
                "tipo": "concentracion_productos",
                "mensaje": f"El {pct_n}% de la utilidad potencial no capturada proviene únicamente de los {len(top_n)} productos principales.",
                "tono": "neutral",
                "accion_sugerida": "Enfoca el esfuerzo de ajuste de costeo en estos pocos productos antes que en el resto del menú.",
            }
        )

    secciones_con_desviacion = [s for s in resumen_secciones if s["diferencia_promedio"] > 0]
    if secciones_con_desviacion:
        seccion_top = max(secciones_con_desviacion, key=lambda s: s["diferencia_promedio"])
        hallazgos.append(
            {
                "tipo": "seccion_peor_desviacion",
                "mensaje": (
                    f"La sección \"{seccion_top['clave']}\" tiene la peor desviación de costeo, "
                    f"{seccion_top['diferencia_promedio']} puntos por encima del objetivo."
                ),
                "tono": "negativo",
                "accion_sugerida": f"Da seguimiento prioritario a la sección \"{seccion_top['clave']}\" en la próxima revisión de costeo.",
            }
        )

    return hallazgos
