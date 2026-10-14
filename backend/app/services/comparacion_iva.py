"""
Cálculo de posibles cortesías a partir de Productos Vendidos — ya no
compara contra un segundo archivo ("Impuestos Generados por IVA"): desde
que Productos Vendidos también guarda su propia columna `impuesto`, el
mismo cálculo se puede hacer con una sola fuente.

Lógica (dada por el usuario, verificada con datos reales):
- `ingreso_real = impuesto / 0.16` — lo que el IVA registrado implica que
  debió ser el ingreso gravado (IVA = ingreso gravado × 16%).
- `monto_cortesia = |ingreso_real - subtotal|` — la diferencia entre lo que
  el impuesto implica y lo que el Subtotal realmente registra. El signo no
  importa (solo se usa para calcular cuántos productos fueron cortesía),
  así que se toma valor absoluto.
- `cantidad_cortesia = round(monto_cortesia / costo)` — el monto de
  cortesía expresado en piezas, usando el costo unitario del producto.

Tasa de IVA fija en 16% (0.16), sin hacerla configurable.
"""

_TASA_IVA = 0.16


def calcular_posibles_cortesias(productos_vendidos: list) -> dict:
    """
    Recorre `productos_vendidos` (instancias de ProductoVendidoDetalle) y
    calcula, por cada fila, el monto y la cantidad estimada de cortesía.
    Si a la fila le falta `impuesto` o `costo` (o `costo` es 0), no se
    puede calcular — se incluye igual con `monto_cortesia`/
    `cantidad_cortesia` en `None`, para que sea visible que ese producto
    necesita resubirse con la columna Impuesto ya capturada.

    Regresa `{"total_monto_cortesia", "total_cantidad_cortesia",
    "productos_con_cortesia", "comparacion"}` — `comparacion` incluye
    TODAS las filas, ordenadas por `monto_cortesia` descendente (las que no
    se pudieron calcular quedan al final).
    """
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
                "seccion_menu": producto.seccion_menu,
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
