"""
Mix de Ventas — distribución de ventas por categoria_tipo y seccion_menu del
Catálogo (módulo "Inteligencia de Negocio" → "Análisis y Profundidad" → tab
Mix de Ventas, Restaurante). Las dimensiones grupo y turno ya se calculan en
otros servicios de esta fase (`ranking_productos.py::construir_ranking_grupos`,
`panel_turnos.py::construir_comparativo_turnos`) — este archivo solo agrega
las 2 dimensiones que faltaban.

A diferencia de `grupo` (que `construir_ranking_productos` ya conserva por
producto), `ComandaEmitidaDetalle` no trae `categoria_tipo`/`seccion_menu`
propios — solo existen en el Catálogo — así que aquí se hace el match
producto→catálogo directamente (mismo matcher que usa `panel_turnos.py`),
en vez de envolver `construir_ranking_productos`.
"""

from collections import defaultdict

from app.services.matching_productos import clasificar_producto_contra_catalogo


def _construir_mix_por_dimension(comandas: list, catalogo: list, clave_dimension: str) -> list[dict]:
    """
    Mismo patrón de agregación que `ranking_productos.py::construir_ranking_grupos`,
    pero clasificando cada producto contra el catálogo para obtener
    `categoria_tipo`/`seccion_menu` (`clave_dimension`) en vez de leer `grupo`
    directo de la comanda.
    """
    cache_clasificacion: dict[str, dict] = {}

    def _clasificar(producto: str, grupo: str | None) -> dict:
        if producto not in cache_clasificacion:
            cache_clasificacion[producto] = clasificar_producto_contra_catalogo(producto, catalogo, grupo)
        return cache_clasificacion[producto]

    cantidad_por_valor: dict[str, float] = defaultdict(float)
    ingreso_por_valor: dict[str, float] = defaultdict(float)
    costo_total_por_valor: dict[str, float] = defaultdict(float)

    for c in comandas:
        clasificacion = _clasificar(c.producto, c.grupo)
        valor = clasificacion.get(clave_dimension) or "Sin Clasificar"
        precio = clasificacion["precio_venta_catalogo"]
        costo = clasificacion["costo_catalogo"]

        cantidad_por_valor[valor] += c.cantidad
        if precio:
            ingreso_por_valor[valor] += c.cantidad * precio
        if costo is not None:
            costo_total_por_valor[valor] += c.cantidad * costo

    ingreso_general = sum(ingreso_por_valor.values())

    resultado = []
    for valor, cantidad in cantidad_por_valor.items():
        ingreso_total = round(ingreso_por_valor.get(valor, 0.0), 2)
        costo_total = costo_total_por_valor.get(valor, 0.0)
        margen_pct = round((ingreso_total - costo_total) / ingreso_total * 100, 1) if ingreso_total else None
        pct_participacion = round(ingreso_total / ingreso_general * 100, 1) if ingreso_general else 0.0
        resultado.append(
            {
                "etiqueta": valor,
                "cantidad": round(cantidad, 2),
                "ingreso_total": ingreso_total,
                "margen_pct": margen_pct,
                "pct_participacion": pct_participacion,
            }
        )

    return resultado


def construir_mix_categoria_tipo(comandas: list, catalogo: list) -> list[dict]:
    """Distribución de ventas por `categoria_tipo` del Catálogo (Alimentos/Bebidas/Otros)."""
    return _construir_mix_por_dimension(comandas, catalogo, "categoria_tipo")


def construir_mix_seccion_menu(comandas: list, catalogo: list) -> list[dict]:
    """Distribución de ventas por `seccion_menu` del Catálogo (Desayuno/Comida-Cena/Bar/Extra/Otros)."""
    return _construir_mix_por_dimension(comandas, catalogo, "seccion_menu")
