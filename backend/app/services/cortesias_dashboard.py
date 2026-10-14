"""
Dashboard de Cortesías — impacto económico y ranking de productos con más
cortesías para un rango de fechas (módulo "Inteligencia de Negocio" →
"Análisis y Profundidad" → tab Cortesías, Restaurante).

Reutiliza al máximo lo ya construido, no reimplementa nada:
- `services/comparacion_iva.py::calcular_posibles_cortesias` — la fórmula
  de cortesía ya usada en el tab Cortesías del módulo mensual.
- `services/conciliacion_ventas_diarias.py::construir_productos_consolidados`
  — ya calcula el prorrateo de cortesía por turno, día por día.

Productos Vendidos se sube por LOTE (un rango de fechas elegido al subir,
no un día por fila), así que solo los lotes de **un solo día**
(`fecha_desde == fecha_hasta`) tienen granularidad real para desglosar por
día/turno — un lote de varios días solo puede aportar al total/ranking por
producto, nunca a "qué día" o "qué turno" tuvo más cortesías (no se inventa
esa precisión). Quien llama a `construir_desglose_dia_turno` es responsable
de filtrar solo los lotes de un solo día antes de pasarlos aquí.
"""

from collections import defaultdict
from datetime import date

from app.services.comparacion_iva import calcular_posibles_cortesias
from app.services.conciliacion_ventas_diarias import construir_productos_consolidados
from app.services.turnos import RANGOS_TURNO, SIN_CLASIFICAR
from app.services.venta_neta import AL_COSTO, CONSUMO_INTERNO, CORTESIA, clasificar_recibo, monto_neto, venta_neta_de

_ORDEN_TURNO = [nombre for nombre, _, _ in RANGOS_TURNO] + [SIN_CLASIFICAR]


def _orden_turno(turno: str) -> int:
    try:
        return _ORDEN_TURNO.index(turno)
    except ValueError:
        return len(_ORDEN_TURNO)


def construir_resumen_cortesias(productos_vendidos_en_rango: list) -> dict:
    """
    Corre `calcular_posibles_cortesias` sobre TODAS las filas de Productos
    Vendidos que se traslapan con el rango pedido (single u multi-día) y
    agrega por nombre de producto — un mismo producto puede aparecer en más
    de un lote dentro del rango, y sus cortesías deben sumarse, no listarse
    2 veces.
    """
    calculo = calcular_posibles_cortesias(productos_vendidos_en_rango)

    monto_por_producto: dict[str, float] = defaultdict(float)
    cantidad_por_producto: dict[str, float] = defaultdict(float)

    for fila in calculo["comparacion"]:
        if fila["monto_cortesia"] is not None:
            monto_por_producto[fila["nombre_producto"]] += fila["monto_cortesia"]
            cantidad_por_producto[fila["nombre_producto"]] += fila["cantidad_cortesia"] or 0

    productos = [
        {
            "producto": nombre,
            "monto_cortesia": round(monto, 2),
            "cantidad_cortesia": cantidad_por_producto[nombre],
        }
        for nombre, monto in monto_por_producto.items()
    ]
    productos.sort(key=lambda p: p["monto_cortesia"], reverse=True)

    return {
        "total_monto_cortesia": calculo["total_monto_cortesia"],
        "total_cantidad_cortesia": calculo["total_cantidad_cortesia"],
        "productos": productos,
    }


_MAX_CUENTAS_MAYORES = 10
_SIN_DEPARTAMENTO = "Sin departamento"


def construir_cortesias_desde_recibos(recibos: list) -> dict:
    """
    Cortesías desde Recibos Emitidos (`tipo = CORTESIA`), fuente principal del
    panel: cubre todos los meses (Productos Vendidos no siempre trae Impuesto,
    y sus lotes multi-día no permiten desglose día/turno) y trae el
    departamento que consumió (`segmento`). Donde coexisten, ambas fuentes
    cuadran (~0.4% en datos reales: ago $47,270 Recibos vs $47,283 PV).

    Monto = `subtotal − descuento` de la cuenta (a precio de lista, sin IVA
    ni propina — ver `services/venta_neta.py`). `total_monto_cortesia` usa la
    misma clave que `construir_resumen_cortesias` para que las alertas de
    riesgo puedan tomar cualquiera de las dos fuentes sin cambios.
    `al_costo`/`consumo_interno` se reportan aparte, sin sumarse al total.
    """
    cortesias = [r for r in recibos if clasificar_recibo(r) == CORTESIA]

    def _agrupar(clave) -> dict:
        monto: dict = defaultdict(float)
        cuentas: dict = defaultdict(int)
        for r in cortesias:
            k = clave(r)
            monto[k] += monto_neto(r)
            cuentas[k] += 1
        return {k: (round(monto[k], 2), cuentas[k]) for k in monto}

    total = round(sum(monto_neto(r) for r in cortesias), 2)
    venta_neta = venta_neta_de(recibos)

    por_departamento = [
        {"segmento": k, "monto": monto, "cuentas": cuentas}
        for k, (monto, cuentas) in _agrupar(lambda r: (r.segmento or "").strip() or _SIN_DEPARTAMENTO).items()
    ]
    por_departamento.sort(key=lambda f: f["monto"], reverse=True)

    por_turno = [
        {"turno": k, "monto": monto, "cuentas": cuentas} for k, (monto, cuentas) in _agrupar(lambda r: r.turno).items()
    ]
    por_turno.sort(key=lambda f: _orden_turno(f["turno"]))

    por_dia = [
        {"fecha": k.isoformat(), "monto": monto, "cuentas": cuentas}
        for k, (monto, cuentas) in sorted(_agrupar(lambda r: r.fecha).items())
    ]

    mayores = sorted(cortesias, key=monto_neto, reverse=True)[:_MAX_CUENTAS_MAYORES]
    mayores_cuentas = [
        {
            "fecha": r.fecha.isoformat(),
            "cuenta": r.cuenta,
            "turno": r.turno,
            "segmento": (r.segmento or "").strip() or _SIN_DEPARTAMENTO,
            "monto": round(monto_neto(r), 2),
        }
        for r in mayores
    ]

    def _otro(categoria: str) -> dict:
        filas = [r for r in recibos if clasificar_recibo(r) == categoria]
        return {"monto": round(sum(monto_neto(r) for r in filas), 2), "cuentas": len(filas)}

    return {
        "total_monto_cortesia": total,
        "cuentas_cortesia": len(cortesias),
        "pct_de_venta_neta": round(total / venta_neta * 100, 1) if venta_neta else None,
        "por_departamento": por_departamento,
        "por_turno": por_turno,
        "por_dia": por_dia,
        "mayores_cuentas": mayores_cuentas,
        "otros_no_comerciales": {"al_costo": _otro(AL_COSTO), "consumo_interno": _otro(CONSUMO_INTERNO)},
    }


def elegir_resumen_cortesias(
    recibos_actual: list, recibos_anterior: list, resumen_pv_actual: dict, resumen_pv_anterior: dict
) -> tuple[dict, dict]:
    """
    Par (actual, anterior) para la alerta de incremento de cortesías: usa
    Recibos si AMBOS periodos tienen recibos (comparación consistente y con
    cobertura completa), si no cae a Productos Vendidos como antes. Nunca
    mezcla una fuente para un periodo y otra para el otro.
    """
    if recibos_actual and recibos_anterior:
        return construir_cortesias_desde_recibos(recibos_actual), construir_cortesias_desde_recibos(recibos_anterior)
    return resumen_pv_actual, resumen_pv_anterior


def construir_desglose_dia_turno(datos_por_dia: dict[date, tuple[list, list]], catalogo: list) -> dict:
    """
    `datos_por_dia`: `{fecha: (productos_vendidos_de_ese_dia, comandas_de_ese_dia)}`
    — SOLO fechas cubiertas por un lote de un solo día (responsabilidad de
    quien llama filtrar esto antes). Reutiliza `construir_productos_consolidados`
    (ya calcula `monto_cortesia`/`cantidad_cortesia` prorrateado por turno)
    y solo suma sus resultados por fecha y por turno.
    """
    monto_por_dia: dict[date, float] = {}
    cantidad_por_dia: dict[date, float] = {}
    monto_por_turno: dict[str, float] = defaultdict(float)
    cantidad_por_turno: dict[str, float] = defaultdict(float)

    for fecha, (pv_dia, comandas_dia) in datos_por_dia.items():
        filas = construir_productos_consolidados(comandas_dia, pv_dia, catalogo)
        monto_por_dia[fecha] = round(sum(f["monto_cortesia"] or 0 for f in filas), 2)
        cantidad_por_dia[fecha] = sum(f["cantidad_cortesia"] or 0 for f in filas)
        for f in filas:
            if f["turno"] is not None:
                monto_por_turno[f["turno"]] += f["monto_cortesia"] or 0
                cantidad_por_turno[f["turno"]] += f["cantidad_cortesia"] or 0

    por_dia = [
        {"fecha": fecha.isoformat(), "monto_cortesia": monto_por_dia[fecha], "cantidad_cortesia": cantidad_por_dia[fecha]}
        for fecha in sorted(datos_por_dia)
    ]
    por_turno = [
        {"turno": turno, "monto_cortesia": round(monto, 2), "cantidad_cortesia": cantidad_por_turno[turno]}
        for turno, monto in monto_por_turno.items()
    ]
    por_turno.sort(key=lambda f: _orden_turno(f["turno"]))

    return {"por_dia": por_dia, "por_turno": por_turno}
