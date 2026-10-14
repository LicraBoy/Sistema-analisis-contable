"""
Costeo de Recetas — % de costo real y precio sugerido por producto, todo
calculado en vivo a partir de `CatalogoProducto.costo`/`precio_venta` y la
configuración vigente (IVA, % descuento, % costo objetivo, % incremento por
grupo). Ningún campo calculado aquí se guarda en base de datos — si se
guardara, se desincronizaría en cuanto cambie el costo/precio real o la
configuración, exactamente el problema que tenían las fórmulas de Excel al
copiarse como valores fijos.

Valores de configuración por defecto (usados solo para sembrar
`configuracion_costeo` en la migración; en tiempo de ejecución siempre se
lee lo que haya en la base).
"""

from app.models import CatalogoProducto

IVA_FACTOR_DEFAULT = 1.16
DESCUENTO_PCT_DEFAULT = 0.05
PCT_COSTO_OBJETIVO_DEFAULT = 0.28
INCREMENTO_DEFAULT = 0.03


def configuracion_con_defaults(guardada: dict[str, float]) -> dict[str, float]:
    """Parámetros de costeo: lo guardado manda; lo que falte (base nueva sin filas) toma el valor por omisión."""
    return {
        "iva_factor": IVA_FACTOR_DEFAULT,
        "descuento_pct": DESCUENTO_PCT_DEFAULT,
        "pct_costo_objetivo": PCT_COSTO_OBJETIVO_DEFAULT,
        "incremento_default": INCREMENTO_DEFAULT,
        **guardada,
    }

CAMPOS_CALCULADOS = (
    "pct_costo",
    "pct_costo_desc5",
    "precio_sugerido",
    "pct_incremento_resultante",
    "pct_costo_sugerido",
    "pct_costo_sugerido_desc5",
)


def calcular_costeo(
    costo: float | None,
    precio_venta: float | None,
    pct_incremento: float,
    iva_factor: float,
    descuento_pct: float,
    pct_costo_objetivo: float,
    precio_sugerido_override: float | None = None,
) -> dict:
    """
    Calcula los 6 campos de costeo + `estado` (OK/REQ AJUSTE) para un
    producto. Si falta costo o precio de venta (o el precio es 0), todos los
    campos calculados quedan en None y `estado` en None — no hay costeo
    posible para ese producto, no es un error.

    `precio_sugerido_override`, si viene, reemplaza el `precio_sugerido`
    calculado por fórmula (cuando el usuario corrigió a mano el de un
    producto puntual porque el resultado de la fórmula no le convencía) —
    `pct_incremento_resultante`/`pct_costo_sugerido`/`pct_costo_sugerido_desc5`
    se recalculan a partir de ese valor. `pct_costo`/`pct_costo_desc5` NO
    cambian: dependen de `precio_venta`, no de `precio_sugerido`.
    """
    if costo is None or precio_venta is None or precio_venta == 0:
        return {campo: None for campo in CAMPOS_CALCULADOS} | {"estado": None, "precio_sugerido_editado": False}

    desc_factor = 1 - descuento_pct

    pct_costo = costo / (precio_venta / iva_factor)
    pct_costo_desc5 = costo / ((precio_venta * desc_factor) / iva_factor)
    precio_sugerido = (
        precio_sugerido_override if precio_sugerido_override is not None else round(precio_venta * (1 + pct_incremento))
    )
    pct_incremento_resultante = (precio_sugerido / precio_venta) - 1
    pct_costo_sugerido = costo / (precio_sugerido / iva_factor) if precio_sugerido else None
    pct_costo_sugerido_desc5 = (
        costo / ((precio_sugerido * desc_factor) / iva_factor) if precio_sugerido else None
    )
    estado = "OK" if pct_costo <= pct_costo_objetivo else "REQ AJUSTE"

    return {
        "pct_costo": pct_costo,
        "pct_costo_desc5": pct_costo_desc5,
        "precio_sugerido": precio_sugerido,
        "pct_incremento_resultante": pct_incremento_resultante,
        "pct_costo_sugerido": pct_costo_sugerido,
        "pct_costo_sugerido_desc5": pct_costo_sugerido_desc5,
        "estado": estado,
        "precio_sugerido_editado": precio_sugerido_override is not None,
    }


def costeo_producto(
    producto: CatalogoProducto,
    incrementos_por_grupo: dict[str, float],
    config: dict[str, float],
    overrides_precio_sugerido: dict[str, float] | None = None,
) -> dict:
    """Costeo de un producto, resolviendo su % de incremento por `grupo` (o el default) y su override de precio sugerido por nombre (si tiene)."""
    pct_incremento = incrementos_por_grupo.get(producto.grupo, config["incremento_default"])
    override = (overrides_precio_sugerido or {}).get(producto.nombre_producto)
    return calcular_costeo(
        costo=producto.costo,
        precio_venta=producto.precio_venta,
        pct_incremento=pct_incremento,
        iva_factor=config["iva_factor"],
        descuento_pct=config["descuento_pct"],
        pct_costo_objetivo=config["pct_costo_objetivo"],
        precio_sugerido_override=override,
    )


def costo_global_ponderado(productos: list[CatalogoProducto], iva_factor: float) -> float | None:
    """
    % de costo global = SUM(costo) / (SUM(precio_venta) / iva) — ponderado
    por el peso real de cada producto, no un promedio simple de porcentajes
    (un producto de $2000 no debe pesar igual que uno de $20).
    """
    productos_validos = [p for p in productos if p.costo is not None and p.precio_venta is not None]
    if not productos_validos:
        return None
    suma_costo = sum(p.costo for p in productos_validos)
    suma_precio = sum(p.precio_venta for p in productos_validos)
    if suma_precio == 0:
        return None
    return suma_costo / (suma_precio / iva_factor)
