"""
Cálculo de posibles cortesías — La Carreta de Mariscos. Copia de
services/comparacion_iva.py (Restaurante), misma fórmula (Impuesto ÷ 0.16
vs Subtotal, ver ese módulo para el detalle) — incluye `categoria_tipo`
(Carreta de Mariscos sí lo tiene) pero no `seccion_menu` (ese catálogo no
lo tiene).
"""

_TASA_IVA = 0.16


def calcular_posibles_cortesias_carreta_mariscos(productos_vendidos: list) -> dict:
    filas: list[dict] = []

    for producto in productos_vendidos:
        monto_cortesia = None
        cantidad_cortesia = None
        ingreso_real = None

        if producto.impuesto is not None and producto.costo:
            ingreso_real = round(producto.impuesto / _TASA_IVA, 2)
            monto_cortesia = round(abs(ingreso_real - (producto.subtotal or 0)), 2)
            cantidad_cortesia = round(monto_cortesia / producto.costo)

        filas.append(
            {
                "nombre_producto": producto.nombre_producto,
                "grupo": producto.grupo,
                "categoria_tipo": producto.categoria_tipo,
                "subtotal": producto.subtotal,
                "impuesto": producto.impuesto,
                "ingreso_real": ingreso_real,
                "monto_cortesia": monto_cortesia,
                "cantidad_cortesia": cantidad_cortesia,
            }
        )

    filas.sort(key=lambda f: f["monto_cortesia"] if f["monto_cortesia"] is not None else -1, reverse=True)

    total_monto_cortesia = round(sum(f["monto_cortesia"] or 0 for f in filas), 2)
    total_cantidad_cortesia = sum(f["cantidad_cortesia"] or 0 for f in filas)
    productos_con_cortesia = sum(1 for f in filas if (f["monto_cortesia"] or 0) > 0.01)

    return {
        "total_monto_cortesia": total_monto_cortesia,
        "total_cantidad_cortesia": total_cantidad_cortesia,
        "productos_con_cortesia": productos_con_cortesia,
        "comparacion": filas,
    }
