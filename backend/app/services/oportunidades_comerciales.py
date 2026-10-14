"""
Panel de Oportunidades Comerciales — detecta automáticamente hallazgos
accionables (módulo "Inteligencia de Negocio" → "Análisis y Profundidad" →
tab Oportunidades, Restaurante). No vuelve a tocar la base de datos: recibe
la salida YA calculada de `services/heatmap_ventas.py`,
`services/ranking_productos.py` (incluida `agregar_variacion_periodo_anterior`)
y `construir_ranking_grupos` — es una capa de reglas sobre datos ya
agregados por esos servicios, para no duplicar matching/agregación.

Los umbrales son constantes nombradas (documentadas abajo) — números de
juicio razonable, no verificados contra un caso real todavía; ajustar si el
usuario los quiere distintos.
"""

from collections import defaultdict

# Rango de horas de operación real (ver services/turnos.py::RANGOS_TURNO) —
# mismo rango que ya usa el Heatmap para no marcar madrugada como "muerta".
_HORA_MINIMA = 6
_HORA_MAXIMA = 23

# Una celda del heatmap se considera "hora muerta" si tiene menos del 20%
# de las piezas promedio de la celda más ocupada del rango.
_UMBRAL_HORA_MUERTA_PCT_DEL_PICO = 0.20
# Solo se evalúan días de semana con al menos 2 fechas de muestra — mismo
# criterio de cautela que el insight de mejor/peor día en Resumen Ejecutivo.
_MIN_MUESTRAS_DIA_SEMANA = 2

# Un producto es "desaprovechado" si su margen supera el promedio del rango
# y su cantidad vendida cae en el cuartil más bajo de popularidad.
_MAX_PRODUCTOS_DESAPROVECHADOS_REPORTADOS = 5

# Alerta de concentración (Pareto): si el 20% de productos con más ingreso
# concentra más del 70% del ingreso total, es un riesgo real de dependencia.
_PCT_PRODUCTOS_TOP_CONCENTRACION = 0.20
_UMBRAL_CONCENTRACION_INGRESO_PCT = 70.0

# Un grupo se considera subutilizado si su ingreso es menor al 30% del
# ingreso promedio entre todos los grupos del rango.
_UMBRAL_GRUPO_SUBUTILIZADO_PCT_DEL_PROMEDIO = 0.30

# Un producto "en declive fuerte" cayó 30% o más vs. el periodo anterior.
_UMBRAL_DECLIVE_FUERTE_PCT = -30.0
_MAX_PRODUCTOS_DECLIVE_REPORTADOS = 5

_DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _agrupar_consecutivos(horas: list[int]) -> list[tuple[int, int]]:
    """[6, 7, 8, 15, 16] -> [(6, 8), (15, 16)] — para reportar franjas, no horas sueltas."""
    if not horas:
        return []
    horas = sorted(horas)
    grupos = []
    inicio = anterior = horas[0]
    for h in horas[1:]:
        if h == anterior + 1:
            anterior = h
            continue
        grupos.append((inicio, anterior))
        inicio = anterior = h
    grupos.append((inicio, anterior))
    return grupos


def _detectar_horas_muertas(heatmap: dict) -> list[dict]:
    """
    `heatmap["celdas"]` ahora es una fila por FECHA exacta (ver
    services/heatmap_ventas.py), no por día de la semana promediado — este
    detector busca patrones de "hora muerta" por día de la semana, así que
    reagrupa las celdas por `dia_semana` aquí mismo (promedio de piezas por
    día de semana + hora, sobre las fechas que sí tuvieron datos ese día de
    semana) en vez de esperar que el heatmap ya venga promediado.
    """
    celdas = heatmap.get("celdas", [])
    if not celdas:
        return []

    piezas_por_dia_hora: dict[tuple[int, int], float] = defaultdict(float)
    fechas_por_dia_semana: dict[int, set] = defaultdict(set)
    for c in celdas:
        piezas_por_dia_hora[(c["dia_semana"], c["hora"])] += c["piezas"]
        fechas_por_dia_semana[c["dia_semana"]].add(c["fecha"])

    promedio_por_celda = {
        (dia_semana, hora): piezas / len(fechas_por_dia_semana[dia_semana])
        for (dia_semana, hora), piezas in piezas_por_dia_hora.items()
    }
    pico = max(promedio_por_celda.values())
    if not pico:
        return []
    umbral = pico * _UMBRAL_HORA_MUERTA_PCT_DEL_PICO

    oportunidades = []
    for dia_semana, fechas in fechas_por_dia_semana.items():
        muestras = len(fechas)
        if muestras < _MIN_MUESTRAS_DIA_SEMANA:
            continue
        horas_muertas = [
            h for h in range(_HORA_MINIMA, _HORA_MAXIMA + 1) if promedio_por_celda.get((dia_semana, h), 0.0) < umbral
        ]
        for inicio, fin in _agrupar_consecutivos(horas_muertas):
            oportunidades.append(
                {
                    "tipo": "hora_muerta",
                    "dia_semana": dia_semana,
                    "mensaje": (
                        f"Los {_DIAS_SEMANA[dia_semana]} de {inicio}:00 a {fin + 1}:00 la actividad es muy baja "
                        f"(menos del {int(_UMBRAL_HORA_MUERTA_PCT_DEL_PICO * 100)}% del pico de ventas del rango)."
                    ),
                    "severidad": "media",
                    "accion_sugerida": (
                        f"Evalúa una promoción o combo especial los {_DIAS_SEMANA[dia_semana]} en ese horario "
                        "para activar la demanda."
                    ),
                }
            )
    return oportunidades


def _detectar_productos_desaprovechados(productos: list[dict]) -> list[dict]:
    con_margen = [p for p in productos if p["margen_pct"] is not None]
    if len(con_margen) < 4:
        return []

    margen_promedio = sum(p["margen_pct"] for p in con_margen) / len(con_margen)
    cantidades = sorted(p["cantidad"] for p in con_margen)
    cuartil_bajo = cantidades[len(cantidades) // 4]

    candidatos = [p for p in con_margen if p["margen_pct"] > margen_promedio and p["cantidad"] <= cuartil_bajo]
    candidatos.sort(key=lambda p: p["margen_pct"], reverse=True)

    return [
        {
            "tipo": "producto_desaprovechado",
            "dia_semana": None,
            "mensaje": (
                f"\"{p['producto']}\" tiene margen alto ({p['margen_pct']}%) pero muy poca venta "
                f"({p['cantidad']:g} unidades) en el rango."
            ),
            "severidad": "baja",
            "accion_sugerida": "Considera destacarlo en el menú o promoverlo — tiene buen margen y poca visibilidad.",
        }
        for p in candidatos[:_MAX_PRODUCTOS_DESAPROVECHADOS_REPORTADOS]
    ]


def _detectar_concentracion_ventas(productos: list[dict]) -> list[dict]:
    con_ingreso = [p for p in productos if p["ingreso_total"] > 0]
    if len(con_ingreso) < 5:
        return []

    ingreso_total = sum(p["ingreso_total"] for p in con_ingreso)
    if not ingreso_total:
        return []

    ordenados = sorted(con_ingreso, key=lambda p: p["ingreso_total"], reverse=True)
    n_top = max(1, round(len(ordenados) * _PCT_PRODUCTOS_TOP_CONCENTRACION))
    pct_concentrado = round(sum(p["ingreso_total"] for p in ordenados[:n_top]) / ingreso_total * 100, 1)

    if pct_concentrado < _UMBRAL_CONCENTRACION_INGRESO_PCT:
        return []

    return [
        {
            "tipo": "concentracion_ventas",
            "dia_semana": None,
            "mensaje": (
                f"{n_top} de {len(ordenados)} productos concentran el {pct_concentrado}% del ingreso del rango."
            ),
            "severidad": "alta",
            "accion_sugerida": (
                "Diversifica: si uno de estos productos falla (desabasto, tendencia a la baja), el impacto "
                "sería grande. Refuerza el resto del menú."
            ),
        }
    ]


def _detectar_grupos_subutilizados(grupos: list[dict]) -> list[dict]:
    con_ingreso = [g for g in grupos if g["ingreso_total"] > 0]
    if len(con_ingreso) < 3:
        return []

    promedio = sum(g["ingreso_total"] for g in con_ingreso) / len(con_ingreso)
    if not promedio:
        return []

    umbral = promedio * _UMBRAL_GRUPO_SUBUTILIZADO_PCT_DEL_PROMEDIO
    return [
        {
            "tipo": "grupo_subutilizado",
            "dia_semana": None,
            "mensaje": (
                f"El grupo \"{g['grupo']}\" genera muy poco ingreso frente al resto "
                f"(${g['ingreso_total']:.2f} vs. un promedio de ${promedio:.2f} entre grupos)."
            ),
            "severidad": "baja",
            "accion_sugerida": f"Revisa si el grupo \"{g['grupo']}\" necesita más variedad, mejor exhibición o promoción.",
        }
        for g in con_ingreso
        if g["ingreso_total"] < umbral
    ]


def detectar_productos_en_declive(productos: list[dict]) -> list[dict]:
    """
    Pública (sin guion bajo) a propósito: `services/alertas_riesgo.py` la
    reusa directamente para la alerta "producto estrella cayó más de 30%" en
    vez de duplicar el umbral `_UMBRAL_DECLIVE_FUERTE_PCT` ni la lógica de
    orden/top-5.
    """
    candidatos = [
        p
        for p in productos
        if p.get("variacion_pct_cantidad") is not None and p["variacion_pct_cantidad"] <= _UMBRAL_DECLIVE_FUERTE_PCT
    ]
    candidatos.sort(key=lambda p: p["variacion_pct_cantidad"])

    return [
        {
            "tipo": "producto_en_declive",
            "dia_semana": None,
            "mensaje": f"\"{p['producto']}\" cayó {abs(p['variacion_pct_cantidad']):g}% en ventas vs. el periodo anterior.",
            "severidad": "alta",
            "accion_sugerida": "Investiga la causa (precio, calidad, competencia) antes de que la caída se vuelva permanente.",
        }
        for p in candidatos[:_MAX_PRODUCTOS_DECLIVE_REPORTADOS]
    ]


def detectar_oportunidades(heatmap: dict, productos: list[dict], grupos: list[dict]) -> list[dict]:
    return [
        *detectar_productos_en_declive(productos),
        *_detectar_concentracion_ventas(productos),
        *_detectar_horas_muertas(heatmap),
        *_detectar_grupos_subutilizados(grupos),
        *_detectar_productos_desaprovechados(productos),
    ]
