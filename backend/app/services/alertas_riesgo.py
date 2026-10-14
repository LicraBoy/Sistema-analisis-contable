"""
Alertas de Riesgo — hallazgos ejecutivos automáticos de riesgo comercial
para un rango de fechas (módulo "Inteligencia de Negocio" → "Análisis y
Profundidad" → tab Alertas de Riesgo, Restaurante). Misma capa de reglas
sobre datos ya agregados que `services/oportunidades_comerciales.py` — no
vuelve a tocar la base de datos ni a duplicar cálculos que ya existen ahí:
- "Producto estrella cayó más de 30%" reusa directamente
  `oportunidades_comerciales.detectar_productos_en_declive` (mismo umbral
  `_UMBRAL_DECLIVE_FUERTE_PCT`, sin reimplementar nada).
- Las demás alertas son genuinamente nuevas (comparación periodo-a-periodo a
  nivel grupo, cortesías y margen), construidas con el mismo criterio de
  "None cuando no hay base para comparar" ya establecido por
  `ranking_productos.py::agregar_variacion_periodo_anterior`.

Severidad: mismos 3 strings planos que el resto del módulo ("alta"/"media"/
"baja"), sin enum.
"""

from app.services.oportunidades_comerciales import (
    _UMBRAL_DECLIVE_FUERTE_PCT,
    detectar_productos_en_declive,
)

# Un incremento de cortesías del 30% o más vs. el periodo anterior es motivo
# de alerta — mismo umbral (en magnitud) que _UMBRAL_DECLIVE_FUERTE_PCT, por
# simetría con "una caída del 30% en ventas es significativa".
_UMBRAL_INCREMENTO_CORTESIAS_PCT = 30.0

# Caída de margen de 5 puntos porcentuales ABSOLUTOS (no relativos: un
# margen que baja de 40% a 34% son 6 puntos, no "-15%") — criterio de juicio
# razonable, no verificado contra un caso real todavía, mismo espíritu que
# los umbrales de oportunidades_comerciales.py.
_UMBRAL_DECLIVE_MARGEN_PCT_PUNTOS = -5.0
_MAX_PRODUCTOS_DECLIVE_MARGEN_REPORTADOS = 5


def _alerta_producto_estrella_declive(productos: list[dict]) -> list[dict]:
    return detectar_productos_en_declive(productos)


def _alerta_grupo_tendencia_negativa(grupos_con_variacion: list[dict]) -> list[dict]:
    candidatos = [
        g
        for g in grupos_con_variacion
        if g.get("variacion_pct_ingreso") is not None and g["variacion_pct_ingreso"] <= _UMBRAL_DECLIVE_FUERTE_PCT
    ]
    candidatos.sort(key=lambda g: g["variacion_pct_ingreso"])

    return [
        {
            "tipo": "grupo_tendencia_negativa",
            "mensaje": (
                f"El grupo \"{g['grupo']}\" cayó {abs(g['variacion_pct_ingreso']):g}% en ingreso "
                "vs. el periodo anterior."
            ),
            "severidad": "alta",
            "accion_sugerida": (
                f"Revisa qué está pasando con el grupo \"{g['grupo']}\" (precio, variedad, competencia) "
                "antes de que la caída se vuelva permanente."
            ),
        }
        for g in candidatos
    ]


def _alerta_incremento_cortesias(resumen_actual: dict, resumen_anterior: dict) -> list[dict]:
    monto_anterior = resumen_anterior.get("total_monto_cortesia", 0.0)
    monto_actual = resumen_actual.get("total_monto_cortesia", 0.0)
    if not monto_anterior:
        return []

    variacion_pct = round((monto_actual - monto_anterior) / monto_anterior * 100, 1)
    if variacion_pct < _UMBRAL_INCREMENTO_CORTESIAS_PCT:
        return []

    return [
        {
            "tipo": "incremento_cortesias",
            "mensaje": (
                f"Las cortesías subieron {variacion_pct:g}% vs. el periodo anterior "
                f"(${monto_actual:.2f} vs. ${monto_anterior:.2f})."
            ),
            "severidad": "media",
            "accion_sugerida": "Revisa si el incremento de cortesías es intencional (promociones) o un problema de control.",
        }
    ]


def _alerta_disminucion_margen(productos_con_variacion_margen: list[dict]) -> list[dict]:
    candidatos = [
        p
        for p in productos_con_variacion_margen
        if p.get("variacion_margen_pct_puntos") is not None
        and p["variacion_margen_pct_puntos"] <= _UMBRAL_DECLIVE_MARGEN_PCT_PUNTOS
    ]
    candidatos.sort(key=lambda p: p["variacion_margen_pct_puntos"])

    return [
        {
            "tipo": "disminucion_margen",
            "mensaje": (
                f"\"{p['producto']}\" perdió {abs(p['variacion_margen_pct_puntos']):g} puntos de margen "
                "vs. el periodo anterior."
            ),
            "severidad": "media",
            "accion_sugerida": "Revisa si subió el costo del insumo o si el precio de venta necesita ajustarse.",
        }
        for p in candidatos[:_MAX_PRODUCTOS_DECLIVE_MARGEN_REPORTADOS]
    ]


def agregar_variacion_margen(productos: list[dict], productos_periodo_anterior: list[dict]) -> list[dict]:
    """
    Diferencia de `margen_pct` en puntos porcentuales absolutos (no %
    relativo) entre `productos` y el mismo producto en el periodo anterior.
    `variacion_margen_pct_puntos` es `None` cuando el producto no tenía
    margen conocido en alguno de los 2 periodos (sin match de catálogo, o
    producto nuevo) — no se inventa una caída de margen sin base real.
    """
    margen_anterior_por_producto = {
        p["producto"]: p["margen_pct"] for p in productos_periodo_anterior if p["margen_pct"] is not None
    }

    resultado = []
    for p in productos:
        margen_anterior = margen_anterior_por_producto.get(p["producto"])
        variacion = (
            round(p["margen_pct"] - margen_anterior, 1)
            if p["margen_pct"] is not None and margen_anterior is not None
            else None
        )
        resultado.append({**p, "margen_pct_periodo_anterior": margen_anterior, "variacion_margen_pct_puntos": variacion})

    return resultado


def detectar_alertas_riesgo(
    productos: list[dict],
    grupos_con_variacion: list[dict],
    resumen_cortesias_actual: dict,
    resumen_cortesias_anterior: dict,
) -> list[dict]:
    return [
        *_alerta_producto_estrella_declive(productos),
        *_alerta_grupo_tendencia_negativa(grupos_con_variacion),
        *_alerta_incremento_cortesias(resumen_cortesias_actual, resumen_cortesias_anterior),
        *_alerta_disminucion_margen(productos),
    ]
