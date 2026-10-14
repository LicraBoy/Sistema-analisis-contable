"""
Panel de Turnos — comparativo Desayuno/Comida/Cena para un rango de fechas
(módulo "Inteligencia de Negocio" → "Análisis y Profundidad" → tab Turnos,
Restaurante). Se calcula al vuelo a partir de Comandas Emitidas y Recibos
Emitidos — mismas fuentes y mismo criterio de "sin Productos Vendidos" ya
establecido en `services/resumen_ejecutivo.py` (dinero real desde Recibos,
piezas desde Comandas, sin depender de Productos Vendidos por su
desalineación con un rango de fechas arbitrario).
"""

from collections import defaultdict

from app.services.matching_productos import clasificar_producto_contra_catalogo
from app.services.turnos import RANGOS_TURNO, SIN_CLASIFICAR
from app.services.venta_neta import COMERCIAL, clasificar_recibo, monto_neto

_ORDEN_TURNO = [nombre for nombre, _, _ in RANGOS_TURNO] + [SIN_CLASIFICAR]


def _orden_turno(turno: str) -> int:
    try:
        return _ORDEN_TURNO.index(turno)
    except ValueError:
        return len(_ORDEN_TURNO)


def _margen_por_turno(comandas: list, catalogo: list) -> dict[str, float | None]:
    """
    Rentabilidad por turno — a diferencia de `total_vendido` (dinero real de
    Recibos, sin desglose por producto), el margen solo se puede calcular
    con Catálogo × Comandas (mismo criterio que Ranking de Productos), nunca
    mezclado con los montos de Recibos.
    """
    cache_clasificacion: dict[str, dict] = {}

    def _clasificar(producto: str, grupo: str | None) -> dict:
        if producto not in cache_clasificacion:
            cache_clasificacion[producto] = clasificar_producto_contra_catalogo(producto, catalogo, grupo)
        return cache_clasificacion[producto]

    ingreso_por_turno: dict[str, float] = defaultdict(float)
    costo_por_turno: dict[str, float] = defaultdict(float)

    for c in comandas:
        clasificacion = _clasificar(c.producto, c.grupo)
        precio = clasificacion["precio_venta_catalogo"]
        costo = clasificacion["costo_catalogo"]
        if precio:
            ingreso_por_turno[c.turno] += c.cantidad * precio
        if costo is not None:
            costo_por_turno[c.turno] += c.cantidad * costo

    margen_por_turno: dict[str, float | None] = {}
    for turno in set(ingreso_por_turno) | set(costo_por_turno):
        ingreso = ingreso_por_turno.get(turno, 0.0)
        costo = costo_por_turno.get(turno, 0.0)
        margen_por_turno[turno] = round((ingreso - costo) / ingreso * 100, 1) if ingreso else None

    return margen_por_turno


def construir_comparativo_turnos(comandas: list, recibos: list, catalogo: list) -> list[dict]:
    total_por_turno: dict[str, float] = defaultdict(float)
    cuentas_por_turno: dict[str, int] = defaultdict(int)
    piezas_por_turno: dict[str, float] = defaultdict(float)

    # Venta neta (sin IVA/propina, solo cuentas comerciales) — ver services/venta_neta.py.
    for r in recibos:
        if clasificar_recibo(r) != COMERCIAL:
            continue
        total_por_turno[r.turno] += monto_neto(r)
        cuentas_por_turno[r.turno] += 1

    for c in comandas:
        piezas_por_turno[c.turno] += c.cantidad

    margen_por_turno = _margen_por_turno(comandas, catalogo)

    turnos = set(total_por_turno) | set(piezas_por_turno)
    total_general = sum(total_por_turno.values())

    resultado = []
    for turno in turnos:
        total_vendido = round(total_por_turno.get(turno, 0.0), 2)
        cantidad_cuentas = cuentas_por_turno.get(turno, 0)
        resultado.append(
            {
                "turno": turno,
                "total_vendido": total_vendido,
                "cantidad_cuentas": cantidad_cuentas,
                "ticket_promedio": round(total_vendido / cantidad_cuentas, 2) if cantidad_cuentas else 0.0,
                "piezas_vendidas": round(piezas_por_turno.get(turno, 0.0), 2),
                "pct_participacion": round(total_vendido / total_general * 100, 1) if total_general else 0.0,
                "margen_pct": margen_por_turno.get(turno),
            }
        )

    resultado.sort(key=lambda fila: _orden_turno(fila["turno"]))
    return resultado
