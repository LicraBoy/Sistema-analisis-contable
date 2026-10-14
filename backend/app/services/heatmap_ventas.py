"""
Heatmap Día×Hora de Ventas — afluencia por fecha exacta y hora (módulo
"Inteligencia de Negocio" → "Análisis y Profundidad" → tab Heatmap,
Restaurante). Se calcula al vuelo a partir de Comandas Emitidas (única
tabla con `hora` real de consumo por línea — la `hora` de Recibos es la de
cierre de cuenta, menos representativa del momento en que se pidió).

Una fila por FECHA real (no por día de la semana promediado): si el rango
tiene 2 lunes (ej. 7 y 14), se reportan 2 filas separadas, cada una con sus
propias piezas — nunca se combinan ni se promedian entre sí, para que un
lunes ajetreado no se diluya (ni un lunes flojo se infle) por mezclarse con
otro lunes del mismo mes. `dia_semana` viaja en cada celda solo para que el
frontend pueda mostrar la etiqueta ("Lun 7") sin tener que recalcularla.

Solo se reportan horas 06:00–23:00 (rango real de operación, ver
`services/turnos.py::RANGOS_TURNO`) — horas fuera de eso ("Sin Clasificar")
son un caso raro aún no confirmado con datos reales y se excluyen por ahora.
"""

from collections import defaultdict
from datetime import date

_HORA_MINIMA = 6
_HORA_MAXIMA = 23

# Una celda se considera "pico" si supera en 50%+ el promedio de piezas de
# esa misma hora en el resto de fechas del mes — criterio de juicio
# razonable, no verificado contra un caso real todavía (mismo espíritu que
# los umbrales de oportunidades_comerciales.py).
_UMBRAL_PICO_PCT_SOBRE_PROMEDIO = 50.0
# Se necesitan al menos esta cantidad de OTRAS fechas con esa misma hora
# para que el promedio de comparación no sea ruido de una sola muestra.
_MIN_FECHAS_PARA_COMPARAR = 2


def construir_heatmap_dia_hora(comandas: list) -> dict:
    piezas_por_celda: dict[tuple[date, int], float] = defaultdict(float)
    cantidad_por_producto_celda: dict[tuple[date, int], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    fechas_vistas: set[date] = set()

    for c in comandas:
        fechas_vistas.add(c.fecha)
        if _HORA_MINIMA <= c.hora.hour <= _HORA_MAXIMA:
            clave = (c.fecha, c.hora.hour)
            piezas_por_celda[clave] += c.cantidad
            cantidad_por_producto_celda[clave][c.producto] += c.cantidad

    celdas = []
    for (fecha, hora), piezas in piezas_por_celda.items():
        # Empates en cantidad se desempatan por nombre de producto (orden
        # alfabético) para que el top sea determinista entre corridas.
        productos_celda = sorted(cantidad_por_producto_celda[(fecha, hora)].items(), key=lambda kv: (-kv[1], kv[0]))
        celdas.append(
            {
                "fecha": fecha.isoformat(),
                "dia_semana": fecha.weekday(),
                "hora": hora,
                "piezas": round(piezas, 2),
                "top_productos": [
                    {"producto": producto, "cantidad": round(cantidad, 2)}
                    for producto, cantidad in productos_celda
                ],
            }
        )

    fechas_con_datos = sorted(fechas_vistas)

    return {"celdas": celdas, "fechas_con_datos": [f.isoformat() for f in fechas_con_datos]}


def detectar_picos_venta(celdas: list[dict]) -> list[dict]:
    """
    Compara cada celda (ya por fecha exacta, ver `construir_heatmap_dia_hora`)
    contra el promedio de `piezas` de esa misma `hora` en las DEMÁS fechas
    del mes (nunca contra sí misma) — una celda es "pico" si su variación %
    contra ese promedio alcanza `_UMBRAL_PICO_PCT_SOBRE_PROMEDIO`. Con menos
    de `_MIN_FECHAS_PARA_COMPARAR` otras fechas para esa hora, no hay base
    suficiente para comparar y la celda se omite (no se inventa un pico con
    una sola muestra de referencia).
    """
    suma_por_hora: dict[int, float] = defaultdict(float)
    conteo_por_hora: dict[int, int] = defaultdict(int)
    for c in celdas:
        suma_por_hora[c["hora"]] += c["piezas"]
        conteo_por_hora[c["hora"]] += 1

    picos = []
    for c in celdas:
        n_otras = conteo_por_hora[c["hora"]] - 1
        if n_otras < _MIN_FECHAS_PARA_COMPARAR:
            continue
        promedio_resto = (suma_por_hora[c["hora"]] - c["piezas"]) / n_otras
        if not promedio_resto:
            continue
        variacion_pct = round((c["piezas"] - promedio_resto) / promedio_resto * 100, 1)
        if variacion_pct < _UMBRAL_PICO_PCT_SOBRE_PROMEDIO:
            continue
        picos.append(
            {
                "fecha": c["fecha"],
                "hora": c["hora"],
                "piezas": c["piezas"],
                "promedio_resto_del_mes": round(promedio_resto, 2),
                "variacion_pct": variacion_pct,
                "top_productos": c["top_productos"],
            }
        )

    picos.sort(key=lambda p: p["variacion_pct"], reverse=True)
    return picos
