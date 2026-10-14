"""
Resumen Ejecutivo — KPIs de ventas e insights automáticos para un rango de
fechas (módulo "Inteligencia de Negocio" → "Análisis y Profundidad",
Restaurante). Todo se calcula al vuelo a partir de Comandas Emitidas y
Recibos Emitidos (mismo criterio de "sin tabla propia" que
`services/conciliacion_ventas_diarias.py` y `services/comparacion_iva.py`).

No depende de Productos Vendidos: ese archivo se sube por lote (rango de
fechas elegido al subir, no un día por fila) y no encaja con un rango de
fechas arbitrario elegido aquí por el usuario — mismo problema ya evitado en
Conciliación.

El dinero real (`total_vendido`, `propina_total`) sale de Recibos Emitidos,
que trae lo que el POS efectivamente cobró por cuenta — a diferencia de
Conciliación (que reconstruye el monto por producto vía Catálogo × Comandas
porque ahí se necesita precisión por producto individual), aquí el objetivo
es el ingreso agregado del negocio, y Recibos ya es la fuente directa de eso.
Comandas se usa para piezas vendidas y el producto más pedido.
"""

from collections import defaultdict
from datetime import date

from app.services.panel_turnos import construir_comparativo_turnos
from app.services.ranking_productos import construir_ranking_grupos, construir_ranking_productos
from app.services.conciliacion_ventas_diarias import _cuenta_base
from app.services.turnos import RANGOS_TURNO, SIN_CLASIFICAR
from app.services.venta_neta import COMERCIAL, clasificar_recibo, monto_neto, resumir_ventas, venta_neta_de

_ORDEN_TURNO = [nombre for nombre, _, _ in RANGOS_TURNO] + [SIN_CLASIFICAR]

_DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

# Mínimo de días distintos (con al menos 2 muestras cada uno) para generar el
# insight de mejor/peor día de la semana — con menos historial, un solo dato
# atípico podría hacerse pasar por un patrón real.
_MIN_DIAS_SEMANA_CON_MUESTRA = 2
_MIN_MUESTRAS_POR_DIA_SEMANA = 2

# Diferencia mínima (en puntos porcentuales de pct_participacion) entre el
# mix de turno/grupo del día objetivo y el mix del rango completo para
# considerarlo la explicación de por qué ese día es mejor/peor — criterio de
# juicio razonable, no verificado contra un caso real todavía (mismo
# espíritu que los umbrales de oportunidades_comerciales.py).
_UMBRAL_BRECHA_PARTICIPACION_PCT = 15.0


def _orden_turno(turno: str | None) -> int:
    if turno is None:
        return len(_ORDEN_TURNO)
    try:
        return _ORDEN_TURNO.index(turno)
    except ValueError:
        return len(_ORDEN_TURNO)


def construir_serie_diaria(comandas: list, recibos: list) -> list[dict]:
    """Una fila por día con `fecha`/`total_vendido`/`cantidad_cuentas`/`piezas_vendidas`."""
    piezas_por_fecha: dict[date, float] = defaultdict(float)
    for c in comandas:
        piezas_por_fecha[c.fecha] += c.cantidad

    # `total_vendido` = venta neta (subtotal − descuento, cuentas comerciales,
    # sin IVA ni propina) — ver services/venta_neta.py.
    total_por_fecha: dict[date, float] = defaultdict(float)
    cuentas_por_fecha: dict[date, int] = defaultdict(int)
    for r in recibos:
        if clasificar_recibo(r) != COMERCIAL:
            continue
        total_por_fecha[r.fecha] += monto_neto(r)
        cuentas_por_fecha[r.fecha] += 1

    fechas = sorted(set(piezas_por_fecha) | set(total_por_fecha))
    return [
        {
            "fecha": f.isoformat(),
            "total_vendido": round(total_por_fecha.get(f, 0.0), 2),
            "cantidad_cuentas": cuentas_por_fecha.get(f, 0),
            "piezas_vendidas": round(piezas_por_fecha.get(f, 0.0), 2),
        }
        for f in fechas
    ]


def _comparacion(actual: float, anterior: float) -> dict:
    variacion = round((actual - anterior) / anterior * 100, 1) if anterior else None
    return {"actual": round(actual, 2), "anterior": round(anterior, 2), "variacion_pct": variacion}


def construir_comparaciones_periodo(
    recibos_dia: list,
    recibos_dia_anterior: list,
    recibos_semana: list,
    recibos_semana_anterior: list,
    recibos_mes: list,
    recibos_mes_anterior: list,
    recibos_anio_anterior: list,
) -> dict:
    """
    4 comparaciones lado a lado para el resumen ejecutivo (selector de mes
    único, ver Paso A del módulo Análisis y Profundidad): día (el último día
    con datos del mes elegido vs. el día calendario anterior), semana (7 días
    terminando en ese día vs. los 7 anteriores a esos), mes (el mes completo
    elegido vs. el mes calendario anterior — `recibos_mes` es la misma lista
    de recibos que ya consultó el router para el resto del endpoint, no se
    vuelve a pedir) y año (mismo mes vs. el mismo mes del año pasado).
    """
    total = venta_neta_de
    return {
        "dia": _comparacion(total(recibos_dia), total(recibos_dia_anterior)),
        "semana": _comparacion(total(recibos_semana), total(recibos_semana_anterior)),
        "mes": _comparacion(total(recibos_mes), total(recibos_mes_anterior)),
        "anio": _comparacion(total(recibos_mes), total(recibos_anio_anterior)),
    }


def construir_serie_mensual(comandas: list, recibos: list) -> list[dict]:
    """
    Igual que `construir_serie_diaria` pero agrupado por mes calendario
    ('YYYY-MM') en vez de por día — para la vista "Todos los meses" del
    selector único de Análisis y Profundidad. Solo incluye meses con datos
    (no rellena meses vacíos con ceros, mismo criterio que la serie diaria).
    """
    piezas_por_mes: dict[str, float] = defaultdict(float)
    for c in comandas:
        piezas_por_mes[f"{c.fecha.year}-{c.fecha.month:02d}"] += c.cantidad

    total_por_mes: dict[str, float] = defaultdict(float)
    cuentas_por_mes: dict[str, int] = defaultdict(int)
    for r in recibos:
        if clasificar_recibo(r) != COMERCIAL:
            continue
        clave = f"{r.fecha.year}-{r.fecha.month:02d}"
        total_por_mes[clave] += monto_neto(r)
        cuentas_por_mes[clave] += 1

    meses = sorted(set(piezas_por_mes) | set(total_por_mes))
    return [
        {
            "mes": m,
            "total_vendido": round(total_por_mes.get(m, 0.0), 2),
            "cantidad_cuentas": cuentas_por_mes.get(m, 0),
            "piezas_vendidas": round(piezas_por_mes.get(m, 0.0), 2),
        }
        for m in meses
    ]


def calcular_kpis(
    serie_diaria: list[dict],
    recibos: list,
    total_vendido_periodo_anterior: float | None,
) -> dict:
    dias_con_datos = len(serie_diaria)
    total_vendido = round(sum(d["total_vendido"] for d in serie_diaria), 2)
    cantidad_cuentas = sum(d["cantidad_cuentas"] for d in serie_diaria)
    piezas_vendidas = round(sum(d["piezas_vendidas"] for d in serie_diaria), 2)
    propina_total = round(sum(r.propina for r in recibos if clasificar_recibo(r) == COMERCIAL), 2)
    ticket_promedio = round(total_vendido / cantidad_cuentas, 2) if cantidad_cuentas else 0.0

    variacion_pct = None
    if total_vendido_periodo_anterior:
        variacion_pct = round(
            (total_vendido - total_vendido_periodo_anterior) / total_vendido_periodo_anterior * 100, 1
        )

    return {
        "dias_con_datos": dias_con_datos,
        "total_vendido": total_vendido,
        "cantidad_cuentas": cantidad_cuentas,
        "ticket_promedio": ticket_promedio,
        "piezas_vendidas": piezas_vendidas,
        "propina_total": propina_total,
        "total_vendido_periodo_anterior": (
            round(total_vendido_periodo_anterior, 2) if total_vendido_periodo_anterior is not None else None
        ),
        "variacion_pct": variacion_pct,
    }


def _insight_turno(recibos: list) -> dict | None:
    if not recibos:
        return None
    total_por_turno: dict[str, float] = defaultdict(float)
    for r in recibos:
        if clasificar_recibo(r) == COMERCIAL:
            total_por_turno[r.turno] += monto_neto(r)
    total_general = sum(total_por_turno.values())
    if not total_general:
        return None
    turno_top = max(total_por_turno, key=lambda t: total_por_turno[t])
    pct = round(total_por_turno[turno_top] / total_general * 100, 1)
    accion = (
        f"Refuerza personal e inventario en el turno de {turno_top} — es el que más ventas concentra."
        if pct >= 45
        else "Ningún turno domina de forma aplastante; revisa si vale la pena una promoción para elevar el más flojo."
    )
    return {
        "tipo": "turno",
        "mensaje": f"El turno de {turno_top} representa el {pct}% de las ventas.",
        "tono": "neutral",
        "accion_sugerida": accion,
    }


def _insight_producto_top(comandas: list) -> dict | None:
    if not comandas:
        return None
    cantidad_por_producto: dict[str, float] = defaultdict(float)
    for c in comandas:
        cantidad_por_producto[c.producto] += c.cantidad
    producto_top = max(cantidad_por_producto, key=lambda p: cantidad_por_producto[p])
    cantidad = cantidad_por_producto[producto_top]
    return {
        "tipo": "producto_top",
        "mensaje": f"El producto más pedido fue \"{producto_top}\", con {cantidad:g} unidades en el periodo.",
        "tono": "neutral",
        "accion_sugerida": "Asegura abasto constante de este producto — es tu principal motor de ventas.",
    }


def _promedios_por_dia_semana(serie_diaria: list[dict]) -> dict[int, float] | None:
    """
    Promedio de venta por día de la semana (0=lunes), solo con días de semana
    que tengan muestra suficiente. `None` si no hay al menos
    `_MIN_DIAS_SEMANA_CON_MUESTRA` días así, o si mejor == peor. Única fuente
    de esta selección para `_insight_dia_semana` y `_dia_semana_mejor_peor`.
    """
    totales_por_dia_semana: dict[int, list[float]] = defaultdict(list)
    for fila in serie_diaria:
        dia_semana = date.fromisoformat(fila["fecha"]).weekday()
        totales_por_dia_semana[dia_semana].append(fila["total_vendido"])

    con_muestra = {
        dia: valores for dia, valores in totales_por_dia_semana.items() if len(valores) >= _MIN_MUESTRAS_POR_DIA_SEMANA
    }
    if len(con_muestra) < _MIN_DIAS_SEMANA_CON_MUESTRA:
        return None
    promedios = {dia: sum(valores) / len(valores) for dia, valores in con_muestra.items()}
    if max(promedios, key=lambda d: promedios[d]) == min(promedios, key=lambda d: promedios[d]):
        return None
    return promedios


def _insight_dia_semana(serie_diaria: list[dict]) -> dict | None:
    promedios = _promedios_por_dia_semana(serie_diaria)
    if promedios is None:
        return None

    promedio_general = sum(f["total_vendido"] for f in serie_diaria) / len(serie_diaria)
    if not promedio_general:
        return None

    mejor_dia = max(promedios, key=lambda d: promedios[d])
    peor_dia = min(promedios, key=lambda d: promedios[d])

    pct_mejor = round((promedios[mejor_dia] - promedio_general) / promedio_general * 100, 1)
    pct_peor = round((promedios[peor_dia] - promedio_general) / promedio_general * 100, 1)
    return {
        "tipo": "dia_semana",
        "mensaje": (
            f"{_DIAS_SEMANA[mejor_dia]} es el mejor día ({pct_mejor:+g}% vs. el promedio) y "
            f"{_DIAS_SEMANA[peor_dia]} el más flojo ({pct_peor:+g}% vs. el promedio)."
        ),
        "tono": "neutral",
        "accion_sugerida": f"Considera una promoción específica los {_DIAS_SEMANA[peor_dia]} para nivelar la demanda.",
    }


def _dia_semana_mejor_peor(serie_diaria: list[dict]) -> tuple[int, int] | None:
    """Mejor y peor día de semana (misma selección que `_insight_dia_semana`), o `None` sin muestra suficiente."""
    promedios = _promedios_por_dia_semana(serie_diaria)
    if promedios is None:
        return None
    return max(promedios, key=lambda d: promedios[d]), min(promedios, key=lambda d: promedios[d])


def _mayor_brecha_participacion(mix_dia: list[dict], mix_rango: list[dict], clave: str) -> tuple[str, float] | None:
    """
    Entre las filas de `mix_dia` (turnos o grupos, ya con `pct_participacion`
    calculado solo sobre las fechas de un día de semana), busca la mayor
    diferencia absoluta contra el mismo `pct_participacion` en `mix_rango`
    (calculado sobre el rango completo). Devuelve `(nombre, diferencia con
    signo)` o `None` si ninguna diferencia alcanza `_UMBRAL_BRECHA_PARTICIPACION_PCT`.
    """
    pct_rango = {fila[clave]: fila["pct_participacion"] for fila in mix_rango}
    nombre_mayor_brecha = None
    mayor_diferencia = 0.0
    for fila in mix_dia:
        nombre = fila[clave]
        diferencia = fila["pct_participacion"] - pct_rango.get(nombre, 0.0)
        if abs(diferencia) > abs(mayor_diferencia):
            mayor_diferencia = diferencia
            nombre_mayor_brecha = nombre
    if nombre_mayor_brecha is None or abs(mayor_diferencia) < _UMBRAL_BRECHA_PARTICIPACION_PCT:
        return None
    return nombre_mayor_brecha, mayor_diferencia


def _insight_por_que_mejor_peor_dia(
    serie_diaria: list[dict], comandas: list, recibos: list, catalogo: list
) -> dict | None:
    """
    Explica la causa del mejor/peor día de semana ya identificado por
    `_insight_dia_semana`, comparando — solo para las fechas de ese día de
    semana — el mix de turno (`panel_turnos.py::construir_comparativo_turnos`)
    y el mix de grupo (`ranking_productos.py::construir_ranking_grupos`)
    contra el mismo mix calculado sobre el rango completo. Reporta el turno
    o grupo con mayor brecha de participación como explicación (ej.
    "concentran más venta en Cena"). Si ninguna brecha es significativa,
    devuelve `None` en vez de forzar una explicación poco informativa —
    mismas guardas de muestra que la función que extiende.
    """
    seleccion = _dia_semana_mejor_peor(serie_diaria)
    if seleccion is None:
        return None
    mejor_dia, peor_dia = seleccion

    turnos_rango = construir_comparativo_turnos(comandas, recibos, catalogo)
    grupos_rango = construir_ranking_grupos(construir_ranking_productos(comandas, catalogo))

    candidatos = []
    for dia_semana, etiqueta in ((mejor_dia, "mejor"), (peor_dia, "peor")):
        comandas_dia = [c for c in comandas if c.fecha.weekday() == dia_semana]
        recibos_dia = [r for r in recibos if r.fecha.weekday() == dia_semana]
        if not comandas_dia and not recibos_dia:
            continue

        turnos_dia = construir_comparativo_turnos(comandas_dia, recibos_dia, catalogo)
        grupos_dia = construir_ranking_grupos(construir_ranking_productos(comandas_dia, catalogo))

        brecha_turno = _mayor_brecha_participacion(turnos_dia, turnos_rango, "turno")
        brecha_grupo = _mayor_brecha_participacion(grupos_dia, grupos_rango, "grupo")

        for brecha, dimension in ((brecha_turno, "turno"), (brecha_grupo, "grupo")):
            if brecha is not None:
                candidatos.append((abs(brecha[1]), dia_semana, etiqueta, dimension, brecha[0], brecha[1]))

    if not candidatos:
        return None

    _, dia_semana, etiqueta, dimension, nombre, diferencia = max(candidatos, key=lambda c: c[0])
    direccion = "concentra" if diferencia > 0 else "aporta menos de lo usual en"
    dimension_texto = "el turno de" if dimension == "turno" else "el grupo"
    return {
        "tipo": "por_que_mejor_peor_dia",
        "mensaje": (
            f"{_DIAS_SEMANA[dia_semana]} ({etiqueta} día de la semana) {direccion} {dimension_texto} "
            f"\"{nombre}\" ({diferencia:+.1f} puntos vs. su participación en todo el rango)."
        ),
        "tono": "positivo" if etiqueta == "mejor" else "negativo",
        "accion_sugerida": (
            f"Revisa qué distingue {dimension_texto} \"{nombre}\" los {_DIAS_SEMANA[dia_semana]} "
            "para replicarlo o corregirlo según el caso."
        ),
    }


_MIN_PRODUCTOS_PRECIO_CANDIDATO = 4  # mismo umbral que _detectar_productos_desaprovechados
_MAX_PRODUCTOS_PRECIO_CANDIDATO_REPORTADOS = 3


def _insight_precio_candidato(productos: list[dict]) -> dict | None:
    """
    Candidatos a evaluar un aumento de precio: productos en el cuartil más
    alto de popularidad (`cantidad`) cuyo `margen_pct` está por debajo del
    promedio del rango — mismo criterio de cuartil/promedio que
    `oportunidades_comerciales.py::_detectar_productos_desaprovechados`, pero
    invertido (ahí se busca poca venta + margen alto; aquí mucha venta +
    margen bajo). No se sugiere un % de aumento ni una ganancia proyectada:
    el sistema no puede saber cómo reaccionaría la demanda a un precio
    distinto, así que solo se señalan los candidatos.
    """
    con_margen = [p for p in productos if p["margen_pct"] is not None]
    if len(con_margen) < _MIN_PRODUCTOS_PRECIO_CANDIDATO:
        return None

    margen_promedio = sum(p["margen_pct"] for p in con_margen) / len(con_margen)
    cantidades = sorted(p["cantidad"] for p in con_margen)
    cuartil_alto = cantidades[(3 * len(cantidades)) // 4]

    candidatos = [p for p in con_margen if p["cantidad"] >= cuartil_alto and p["margen_pct"] < margen_promedio]
    if not candidatos:
        return None
    candidatos.sort(key=lambda p: p["margen_pct"])

    nombres = ", ".join(f"\"{p['producto']}\"" for p in candidatos[:_MAX_PRODUCTOS_PRECIO_CANDIDATO_REPORTADOS])
    return {
        "tipo": "precio_candidato",
        "mensaje": (
            f"{nombres} se piden bastante pero su margen está por debajo del promedio del rango "
            f"({round(margen_promedio, 1)}%)."
        ),
        "tono": "neutral",
        "accion_sugerida": (
            "Evalúa un ajuste de precio en estos productos — su alta demanda sugiere que el mercado podría "
            "absorberlo sin afectar mucho las ventas."
        ),
    }


def _insight_variacion(kpis: dict) -> dict | None:
    variacion = kpis.get("variacion_pct")
    if variacion is None:
        return None
    tono = "positivo" if variacion > 0 else "negativo" if variacion < 0 else "neutral"
    verbo = "subieron" if variacion > 0 else "bajaron" if variacion < 0 else "se mantuvieron"
    if variacion > 0:
        accion = "Identifica qué generó el alza (promoción, temporada, evento) y repítelo a propósito."
    elif variacion < 0:
        accion = "Investiga la causa de la caída (clima, personal, competencia) antes de que se repita."
    else:
        accion = "Sin cambios relevantes — sigue monitoreando el próximo periodo."
    return {
        "tipo": "variacion",
        "mensaje": f"Las ventas {verbo} {abs(variacion):g}% respecto al periodo anterior de la misma duración.",
        "tono": tono,
        "accion_sugerida": accion,
    }


def construir_conciliacion_ventas(recibos: list, comandas: list, productos: list[dict]) -> dict:
    """
    Bloque de contraloría: desglose de la venta neta (`venta_neta.py`) y
    controles de integridad entre Recibos, Comandas y Catálogo. No explica
    ninguna diferencia (el sistema no conoce la causa): solo la cuantifica.

    - `ingreso_catalogo_comandas` (Catálogo × Comandas, ver Ranking) cubre
      TODAS las cuentas (también cortesías y consumos), por eso se compara
      contra el subtotal bruto de todos los recibos, no contra la venta neta.
      Se muestra contra la base sin IVA y con IVA porque no se sabe si el
      precio de catálogo incluye IVA.
    - Cuentas sin recibo/sin comanda: por (fecha, número base de cuenta).
    - Calidad de catálogo: productos con precio ambiguo o sin precio.
    """
    resumen = resumir_ventas(recibos)

    subtotal_bruto = round(sum(r.subtotal for r in recibos), 2)
    subtotal_con_iva = round(sum(r.subtotal + r.tax for r in recibos), 2)
    ingreso_catalogo = round(sum(p["ingreso_total"] for p in productos), 2)

    def _diferencia(base: float) -> dict:
        return {
            "base": base,
            "diferencia": round(ingreso_catalogo - base, 2),
            "diferencia_pct": round((ingreso_catalogo - base) / base * 100, 1) if base else None,
        }

    cuentas_recibos = {(r.fecha, _cuenta_base(r.cuenta)) for r in recibos if r.cuenta}
    cuentas_comandas = {(c.fecha, str(c.cuenta).strip()) for c in comandas if c.cuenta}

    return {
        **resumen,
        "ingreso_catalogo_comandas": ingreso_catalogo,
        "vs_subtotal_recibos": _diferencia(subtotal_bruto),
        "vs_subtotal_con_iva_recibos": _diferencia(subtotal_con_iva),
        "cuentas_comanda_sin_recibo": len(cuentas_comandas - cuentas_recibos),
        "cuentas_recibo_sin_comanda": len(cuentas_recibos - cuentas_comandas),
        "cuentas_comanda_total": len(cuentas_comandas),
        "productos_precio_ambiguo": [p["producto"] for p in productos if p.get("precio_ambiguo")],
        "productos_sin_precio": [p["producto"] for p in productos if p.get("sin_precio")],
        "cantidad_sin_precio": round(sum(p["cantidad"] for p in productos if p.get("sin_precio")), 2),
    }


def generar_insights(
    serie_diaria: list[dict], comandas: list, recibos: list, kpis: dict, catalogo: list, productos: list[dict]
) -> list[dict]:
    if not serie_diaria:
        return []

    candidatos = [
        _insight_variacion(kpis),
        _insight_turno(recibos),
        _insight_producto_top(comandas),
        _insight_dia_semana(serie_diaria),
        _insight_por_que_mejor_peor_dia(serie_diaria, comandas, recibos, catalogo),
        _insight_precio_candidato(productos),
    ]
    return [insight for insight in candidatos if insight is not None]
