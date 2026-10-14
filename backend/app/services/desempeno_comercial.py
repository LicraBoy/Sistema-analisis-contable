"""
Desempeño Comercial — comparación del mes elegido contra el periodo anterior
de igual duración (módulo "Inteligencia de Negocio" → "Análisis y
Profundidad" → tab Desempeño Comercial, Restaurante), orientada a
Contraloría/Gerencia: qué líneas de negocio crecen o caen, qué productos lo
explican, y el impacto económico real.

No duplica agregación: recibe las salidas YA calculadas de
`services/ranking_productos.py` (`construir_ranking_productos`,
`construir_ranking_grupos`) y `services/mix_ventas.py`
(`construir_mix_categoria_tipo`/`construir_mix_seccion_menu`) para ambos
periodos — este archivo solo las compara. El "periodo anterior de igual
duración" (el requisito central de este dashboard) lo resuelve
`services/rangos_fecha.py::periodo_anterior`, que el router llama antes de
consultar la base de datos por segunda vez.
"""

from app.services.venta_neta import COMERCIAL, clasificar_recibo, venta_neta_de

_MAX_PRODUCTOS_IMPULSORES_RAPIDOS = 3 # Sección 2: vista rápida de impulsores/destructores
_MAX_TOP_GANADORES_PERDEDORES = 5  # Secciones 6/7


def _comparacion_kpi(actual: float, anterior: float) -> dict:
    """{actual, anterior, diferencia, variacion_pct} — variacion_pct None si anterior es 0 (nunca un falso -100%)."""
    diferencia = round(actual - anterior, 2)
    variacion_pct = round((actual - anterior) / anterior * 100, 1) if anterior else None
    return {"actual": round(actual, 2), "anterior": round(anterior, 2), "diferencia": diferencia, "variacion_pct": variacion_pct}


def construir_kpis_comparativos(comandas: list, recibos: list, comandas_anterior: list, recibos_anterior: list) -> dict:
    """
    Ventas (venta neta: subtotal − descuento de cuentas comerciales, sin IVA
    ni propina — `services/venta_neta.py`), Cantidad vendida (suma de
    comandas.cantidad), Ticket promedio (ventas/cuentas comerciales) y
    Cuentas (cuentas comerciales, mismo criterio que
    `resumen_ejecutivo.py::calcular_kpis`). Las 4 comparten la forma
    `_comparacion_kpi` — el frontend decide qué campos mostrar por KPI.
    """

    def _kpis(comandas_periodo: list, recibos_periodo: list) -> tuple[float, float, float, int]:
        ventas = venta_neta_de(recibos_periodo)
        cantidad_vendida = sum(c.cantidad for c in comandas_periodo)
        cuentas = sum(1 for r in recibos_periodo if clasificar_recibo(r) == COMERCIAL)
        ticket_promedio = ventas / cuentas if cuentas else 0.0
        return ventas, cantidad_vendida, ticket_promedio, cuentas

    ventas, cantidad_vendida, ticket_promedio, cuentas = _kpis(comandas, recibos)
    ventas_ant, cantidad_vendida_ant, ticket_promedio_ant, cuentas_ant = _kpis(comandas_anterior, recibos_anterior)

    return {
        "ventas": _comparacion_kpi(ventas, ventas_ant),
        "cantidad_vendida": _comparacion_kpi(cantidad_vendida, cantidad_vendida_ant),
        "ticket_promedio": _comparacion_kpi(ticket_promedio, ticket_promedio_ant),
        "cuentas": _comparacion_kpi(cuentas, cuentas_ant),
    }


def construir_productos_comparados(productos_actual: list[dict], productos_anterior: list[dict]) -> dict:
    """
    Empareja por nombre de producto:
    - `comparados`: productos con ingreso en AMBOS periodos, o que
      desaparecieron (estaban en el anterior, ya no están en el actual ->
      `ingreso_actual=0`, para que salgan como "perdedores" reales en vez de
      perderse silenciosamente).
    - `nuevos`: productos con ingreso en el periodo actual pero SIN ingreso
      en el anterior — nunca entran a `comparados` (un producto nuevo no es
      "crecimiento" de algo que ya existía; evita un ranking engañoso).
    """
    ingreso_anterior_por_producto = {p["producto"]: p["ingreso_total"] for p in productos_anterior}
    productos_actual_por_nombre = {p["producto"]: p for p in productos_actual}

    comparados = []
    nuevos = []
    for p in productos_actual:
        ingreso_anterior = ingreso_anterior_por_producto.get(p["producto"])
        if ingreso_anterior is None:
            nuevos.append({"producto": p["producto"], "ingreso_total": p["ingreso_total"], "cantidad": p["cantidad"]})
            continue
        contribucion = round(p["ingreso_total"] - ingreso_anterior, 2)
        comparados.append(
            {
                "producto": p["producto"],
                "ingreso_actual": p["ingreso_total"],
                "ingreso_anterior": round(ingreso_anterior, 2),
                "contribucion": contribucion,
                "contribucion_pct": round(contribucion / ingreso_anterior * 100, 1) if ingreso_anterior else None,
            }
        )

    for p in productos_anterior:
        if p["producto"] in productos_actual_por_nombre:
            continue
        contribucion = round(0.0 - p["ingreso_total"], 2)
        comparados.append(
            {
                "producto": p["producto"],
                "ingreso_actual": 0.0,
                "ingreso_anterior": round(p["ingreso_total"], 2),
                "contribucion": contribucion,
                "contribucion_pct": -100.0 if p["ingreso_total"] else None,
            }
        )

    return {"comparados": comparados, "nuevos": nuevos}


def construir_comparativo_dimension(actual: list[dict], anterior: list[dict], clave: str) -> list[dict]:
    """
    Genérica — reusada para grupo (`construir_ranking_grupos`, `clave="grupo"`)
    y categoria_tipo/seccion_menu (`construir_mix_categoria_tipo`/
    `construir_mix_seccion_menu`, `clave="etiqueta"`). Empareja por `fila[clave]`,
    calcula diferencia $ y variación % de ingreso, conserva `pct_participacion`
    del periodo actual (ya viene calculado por el servicio de origen).
    """
    ingreso_anterior_por_clave = {fila[clave]: fila["ingreso_total"] for fila in anterior}

    resultado = []
    for fila in actual:
        ingreso_anterior = ingreso_anterior_por_clave.get(fila[clave], 0.0)
        diferencia = round(fila["ingreso_total"] - ingreso_anterior, 2)
        variacion_pct = round(diferencia / ingreso_anterior * 100, 1) if ingreso_anterior else None
        resultado.append(
            {
                clave: fila[clave],
                "ingreso_actual": fila["ingreso_total"],
                "ingreso_anterior": round(ingreso_anterior, 2),
                "diferencia": diferencia,
                "variacion_pct": variacion_pct,
                "pct_participacion": fila["pct_participacion"],
            }
        )

    resultado.sort(key=lambda f: f["ingreso_actual"], reverse=True)
    return resultado


def _top_impulsores(comparados: list[dict], n: int) -> tuple[list[dict], list[dict]]:
    positivos = sorted([p for p in comparados if p["contribucion"] > 0], key=lambda p: p["contribucion"], reverse=True)
    negativos = sorted([p for p in comparados if p["contribucion"] < 0], key=lambda p: p["contribucion"])
    return positivos[:n], negativos[:n]


def construir_top_impulsores_rapidos(comparados: list[dict]) -> dict:
    """Sección 2 — vista rápida (top 3 de cada lado); `comparados` ya excluye productos nuevos por construcción."""
    positivos, negativos = _top_impulsores(comparados, _MAX_PRODUCTOS_IMPULSORES_RAPIDOS)
    return {"positivos": positivos, "negativos": negativos}


def construir_top_ganadores_perdedores(comparados: list[dict]) -> dict:
    """Secciones 6/7 — mismo criterio que la Sección 2, con más filas (top 5)."""
    ganadores, perdedores = _top_impulsores(comparados, _MAX_TOP_GANADORES_PERDEDORES)
    return {"ganadores": ganadores, "perdedores": perdedores}


def generar_hallazgos_desempeno(
    grupos_comparados: list[dict],
    seccion_comparada: list[dict],
    top_ganadores: list[dict],
    top_perdedores: list[dict],
    top5_pct_productos: float | None,
) -> list[dict]:
    """
    Observaciones automáticas, mismo shape `{tipo, mensaje, tono,
    accion_sugerida}` que ya usa el resto del módulo (Resumen Ejecutivo,
    Oportunidades) — consistencia con el resto de la app. Cada hallazgo se
    omite si no hay dato suficiente para generarlo (mismo criterio de
    cautela del resto del módulo, nunca se fuerza una observación vacía).
    """
    hallazgos = []

    if grupos_comparados:
        grupo_mayor_impacto = max(grupos_comparados, key=lambda g: abs(g["diferencia"]))
        if grupo_mayor_impacto["diferencia"] != 0:
            direccion = "creció" if grupo_mayor_impacto["diferencia"] > 0 else "cayó"
            hallazgos.append(
                {
                    "tipo": "grupo_impulsor",
                    "mensaje": (
                        f"El grupo \"{grupo_mayor_impacto['grupo']}\" es el que más {direccion} en el periodo "
                        f"({grupo_mayor_impacto['diferencia']:+,.2f})."
                    ),
                    "tono": "positivo" if grupo_mayor_impacto["diferencia"] > 0 else "negativo",
                    "accion_sugerida": f"Revisa qué cambió en \"{grupo_mayor_impacto['grupo']}\" este periodo para replicarlo o corregirlo.",
                }
            )

    seccion_con_variacion = [s for s in seccion_comparada if s["variacion_pct"] is not None]
    if seccion_con_variacion:
        seccion_peor = min(seccion_con_variacion, key=lambda s: s["variacion_pct"])
        if seccion_peor["variacion_pct"] < 0:
            hallazgos.append(
                {
                    "tipo": "seccion_impulsora",
                    "mensaje": f"El área \"{seccion_peor['etiqueta']}\" disminuyó {abs(seccion_peor['variacion_pct']):g}%.",
                    "tono": "negativo",
                    "accion_sugerida": f"Investiga qué está pasando en \"{seccion_peor['etiqueta']}\" antes de que la caída se profundice.",
                }
            )

    if top_ganadores:
        p = top_ganadores[0]
        hallazgos.append(
            {
                "tipo": "producto_top",
                "mensaje": f"El producto que más contribuyó al crecimiento fue \"{p['producto']}\" (+{p['contribucion']:,.2f}).",
                "tono": "positivo",
                "accion_sugerida": f"Asegura abasto y visibilidad de \"{p['producto']}\" — es tu principal motor de crecimiento este periodo.",
            }
        )

    if top_perdedores:
        p = top_perdedores[0]
        hallazgos.append(
            {
                "tipo": "producto_caida",
                "mensaje": f"El producto con mayor caída fue \"{p['producto']}\" ({p['contribucion']:,.2f}).",
                "tono": "negativo",
                "accion_sugerida": f"Investiga la causa de la caída de \"{p['producto']}\" (precio, calidad, competencia).",
            }
        )

    if top5_pct_productos is not None:
        hallazgos.append(
            {
                "tipo": "concentracion",
                "mensaje": f"Los cinco productos principales representan {top5_pct_productos}% de los ingresos del periodo.",
                "tono": "neutral",
                "accion_sugerida": "Diversifica: una dependencia alta en pocos productos es un riesgo si alguno falla.",
            }
        )

    return hallazgos
