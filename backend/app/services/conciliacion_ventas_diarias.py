"""
Conciliación de Ventas Diarias — cruza Comandas Emitidas, Recibos Emitidos
y Productos Vendidos (Restaurante) para un mismo día. Todo se calcula al
vuelo a partir de las 3 tablas ya guardadas (mismo criterio que
`services/comparacion_iva.py` para Cortesía) — no hay tabla propia.

Dos vistas independientes:
- `construir_cuentas_consolidadas`: Comandas ⨝ Recibos por cuenta — qué se
  pidió (detalle de producto/hora) y cuánto se cobró, por cuenta.
- `construir_productos_consolidados`: Comandas ⨝ Productos Vendidos por
  nombre de producto — cantidad pedida vs. cantidad/valor reportado ese
  día, marcando discrepancias. Un producto de Comandas sin match en
  Productos Vendidos ese día (confirmado con datos reales: pasa cuando el
  export de Productos Vendidos simplemente no incluyó un producto que sí
  se vendió) cae a un precio estimado del Catálogo — ver
  `_estimar_desde_catalogo`.
"""

from app.services.comparacion_iva import calcular_posibles_cortesias
from app.services.costeo_recetas import IVA_FACTOR_DEFAULT
from app.services.matching_productos import clasificar_producto_contra_catalogo
from app.services.turnos import RANGOS_TURNO, SIN_CLASIFICAR

_ORDEN_TURNO = [nombre for nombre, _, _ in RANGOS_TURNO] + [SIN_CLASIFICAR]


def _orden_turno(turno: str | None) -> int:
    if turno is None:
        return len(_ORDEN_TURNO)
    try:
        return _ORDEN_TURNO.index(turno)
    except ValueError:
        return len(_ORDEN_TURNO)


def _cuenta_base(cuenta_recibo: str) -> str:
    """"450913/9A*506D" -> "450913" — el mismo número que trae Comandas."""
    return cuenta_recibo.split("/")[0]


def _prorratear(valor: float | None, fraccion: float) -> float | None:
    return round(valor * fraccion, 2) if valor is not None else None


def construir_cuentas_consolidadas(comandas: list, recibos: list) -> list[dict]:
    """
    Agrupa `comandas` (ComandaEmitidaDetalle) por `cuenta` y las une con su
    `ReciboEmitidoDetalle` correspondiente (mismo número inicial). Si una
    cuenta de Comandas no tiene recibo (no visto en datos reales, pero no
    se asume), `recibo_encontrado=False` y los campos del recibo van en
    None — no se descarta la cuenta.
    """
    recibos_por_cuenta_base = {_cuenta_base(r.cuenta): r for r in recibos if r.cuenta}

    productos_por_cuenta: dict[str, list] = {}
    for c in comandas:
        if not c.cuenta:
            continue
        productos_por_cuenta.setdefault(c.cuenta, []).append(c)

    resultado = []
    for cuenta, items in productos_por_cuenta.items():
        recibo = recibos_por_cuenta_base.get(cuenta)
        items_ordenados = sorted(items, key=lambda c: c.hora)
        resultado.append(
            {
                "cuenta": cuenta,
                "recibo_encontrado": recibo is not None,
                "turno": recibo.turno if recibo else None,
                "pos": recibo.pos if recibo else None,
                "tipo": recibo.tipo if recibo else None,
                "pagada": recibo.pagada if recibo else None,
                "segmento": recibo.segmento if recibo else None,
                "room_name": recibo.room_name if recibo else None,
                "num_cubiertos": recibo.num_cubiertos if recibo else None,
                "subtotal": recibo.subtotal if recibo else None,
                "descuento": recibo.descuento if recibo else None,
                "tax": recibo.tax if recibo else None,
                "propina": recibo.propina if recibo else None,
                "total": recibo.total if recibo else None,
                "productos": [
                    {
                        "producto": item.producto,
                        "grupo": item.grupo,
                        "categoria_tipo": item.categoria_tipo,
                        "seccion_menu": item.seccion_menu,
                        "cantidad": item.cantidad,
                        "hora": item.hora.isoformat(),
                        "mesa": item.mesa,
                        "estatus": item.estatus,
                    }
                    for item in items_ordenados
                ],
            }
        )

    resultado.sort(key=lambda fila: fila["productos"][0]["hora"] if fila["productos"] else "")
    return resultado


def _estimar_desde_catalogo(nombre: str, cantidad_comandas: float, catalogo: list) -> dict:
    """
    El monto en $ de cada producto sale **siempre** de aquí, nunca de
    Productos Vendidos — confirmado con datos reales que Productos
    Vendidos no es confiable ni para cantidad ni para el nombre del
    producto (a veces omite productos que sí se vendieron; a veces guarda
    la misma cantidad bajo un nombre de producto distinto al de Comandas/
    Catálogo, ej. "HF CERVEZA BUD LIGHT LATA" en Comandas con 6 unidades
    vs "HF CERVEZA LATA PACIFICO" en Productos Vendidos con esas mismas 6
    unidades). Busca `nombre` en el Catálogo (mismo fuzzy-match que ya usan
    Comandas/Productos Vendidos al subir) y, si lo encuentra, calcula
    subtotal/impuesto/total como `cantidad_comandas × precio_venta` — la
    cantidad siempre viene de Comandas (fuente directa del ticket), nunca
    de Productos Vendidos. Si el catálogo tiene el precio en 0 (visto en
    datos reales, ej. "CAFETERIA GALLETA COCO CAFE"), el resultado también
    queda en 0 — no se inventa un precio que el catálogo no tiene.
    """
    clasificacion = clasificar_producto_contra_catalogo(nombre, catalogo)
    if not clasificacion.get("producto_catalogo_encontrado"):
        return {
            "grupo": None, "categoria_tipo": None, "seccion_menu": None,
            "costo": None, "precio_venta": None, "costo_catalogo": None, "precio_venta_catalogo": None,
            "subtotal": None, "impuesto": None, "total": None,
            "precio_estimado_de_catalogo": False,
        }

    costo = clasificacion["costo_catalogo"]
    precio_venta = clasificacion["precio_venta_catalogo"]
    total = cantidad_comandas * precio_venta if precio_venta else 0.0
    subtotal = total / IVA_FACTOR_DEFAULT if total else 0.0
    impuesto = total - subtotal if total else 0.0

    return {
        "grupo": clasificacion["grupo"],
        "categoria_tipo": clasificacion["categoria_tipo"],
        "seccion_menu": clasificacion["seccion_menu"],
        "costo": costo,
        "precio_venta": precio_venta,
        "costo_catalogo": costo,
        "precio_venta_catalogo": precio_venta,
        "subtotal": subtotal,
        "impuesto": impuesto,
        "total": total,
        "precio_estimado_de_catalogo": True,
    }


def construir_productos_consolidados(
    comandas: list,
    productos_vendidos: list,
    catalogo: list,
    nombres_con_historial: set | None = None,
    tolerancia: float = 0.01,
) -> list[dict]:
    """
    Una fila por producto **y turno** (ej. "CAFE" puede salir 2 veces si se
    pidió en Desayuno y en Comida) — Comandas es la única fuente con
    hora/turno por línea, así que `hora_apertura`/`hora_cierre` (mínima
    /máxima hora dentro de ese turno) y `cantidad_comandas` (de ese turno)
    salen de ahí. Un producto que solo existe en Productos Vendidos (nunca
    se capturó en Comandas) sale como una sola fila con `turno=None`.

    `comandas` normalmente son solo las de un día (llamado desde
    `api/conciliacion_ventas_diarias.py` para la `fecha` pedida), pero
    cuando el lote de Productos Vendidos que cubre esa fecha abarca varios
    días, quien llama pasa las Comandas de **todo el rango del lote**, no
    solo ese día — esta función no lo sabe ni le importa, simplemente
    agrupa/prorratea sobre lo que reciba; el desglose por turno y
    `hora_apertura`/`hora_cierre` terminan reflejando ese rango completo en
    ese caso, no necesariamente un solo día.

    `nombres_con_historial` (nombres con al menos una fila en Productos
    Vendidos en CUALQUIER lote, no solo el de este día) permite distinguir,
    cuando `sin_match_productos_vendidos=True`, un producto real que
    Productos Vendidos solo omitió ese día puntual (confirmado con datos
    reales: ej. "HAMBURGUESA POLLO QUESO TOCINO" no salió en Productos
    Vendidos el 17 de septiembre pero sí vendió 14/5/13 unidades en los 3
    meses anteriores — no es un error de búsqueda, el fuzzy-match ya
    encuentra la fila correcta del catálogo) de uno que nunca se ha visto
    reportado en absoluto (ver `confirmado_en_historial` en el resultado).

    La reconciliación contra Productos Vendidos (`cantidad_vendida`,
    `sin_match_productos_vendidos`, `discrepancia`) es una cifra de **todo
    el día** — Productos Vendidos no tiene desglose por turno — así que se
    calcula una vez por producto y se repite igual en cada una de sus filas
    de turno (no tiene sentido prorratearla: es una cantidad de referencia
    para comparar, no un monto en $). `cantidad_comandas_dia` (suma de
    todos los turnos) se incluye aparte para esa comparación, sin tener que
    sumar las filas a mano.

    `subtotal`/`impuesto`/`descuento` (los que trae Productos Vendidos tal
    cual) y `ingreso_real`/`monto_cortesia`/`cantidad_cortesia` (mismo
    cálculo que `services/comparacion_iva.py::calcular_posibles_cortesias`
    ya usa en la pestaña Cortesía), en cambio, **sí se prorratean por
    turno** — Productos Vendidos solo da el total del día, pero repetirlo
    tal cual en cada fila de turno sería una trampa para cualquier análisis
    futuro que sume esas columnas (duplicaría el monto real). Se reparte
    proporcional a `cantidad_comandas` de ese turno sobre
    `cantidad_comandas_dia` — así que sumar cualquiera de estas columnas a
    través de las filas de turno de un mismo producto reconstruye
    exactamente el total real del día. `cantidad_cortesia` no se prorratea
    directamente (arrastraría el redondeo del día) — se recalcula por turno
    a partir del `monto_cortesia` ya prorrateado, igual que
    `calcular_posibles_cortesias` lo calcula a partir de `monto_cortesia`.

    `costo`/`precio_venta` siguen viniendo siempre del Catálogo (nunca de
    Productos Vendidos — ver `_estimar_desde_catalogo`) y no varían por
    turno; `total` se recalcula por turno (`cantidad_comandas` de ese turno
    × precio del catálogo).
    """
    nombres_con_historial = nombres_con_historial or set()

    cantidad_por_producto_turno: dict[tuple[str, str], float] = {}
    horas_por_producto_turno: dict[tuple[str, str], list] = {}
    turnos_por_producto: dict[str, set] = {}
    cantidad_comandas_dia: dict[str, float] = {}
    grupo_por_producto: dict[str, dict] = {}

    for c in comandas:
        clave = (c.producto, c.turno)
        cantidad_por_producto_turno[clave] = cantidad_por_producto_turno.get(clave, 0.0) + c.cantidad
        horas_por_producto_turno.setdefault(clave, []).append(c.hora)
        turnos_por_producto.setdefault(c.producto, set()).add(c.turno)
        cantidad_comandas_dia[c.producto] = cantidad_comandas_dia.get(c.producto, 0.0) + c.cantidad
        if c.producto not in grupo_por_producto:
            grupo_por_producto[c.producto] = {
                "grupo": c.grupo,
                "categoria_tipo": c.categoria_tipo,
                "seccion_menu": c.seccion_menu,
            }

    pv_por_producto = {p.nombre_producto: p for p in productos_vendidos}
    cortesia_por_producto = {
        fila["nombre_producto"]: fila for fila in calcular_posibles_cortesias(productos_vendidos)["comparacion"]
    }

    productos = set(cantidad_comandas_dia) | set(pv_por_producto)

    resultado = []
    for nombre in productos:
        cantidad_dia = cantidad_comandas_dia.get(nombre, 0.0)
        pv = pv_por_producto.get(nombre)
        clasificacion = grupo_por_producto.get(nombre, {})
        cortesia = cortesia_por_producto.get(nombre)
        info_catalogo = _estimar_desde_catalogo(nombre, cantidad_dia, catalogo)

        cantidad_vendida = pv.cantidad if pv else None
        sin_match = pv is None
        discrepancia = sin_match or (
            cantidad_vendida is not None and abs(cantidad_dia - cantidad_vendida) > tolerancia
        )

        base = {
            "producto": nombre,
            "cantidad_comandas_dia": cantidad_dia,
            "cantidad_vendida": cantidad_vendida,
            "sin_match_productos_vendidos": sin_match,
            "confirmado_en_historial": nombre in nombres_con_historial,
            "discrepancia": discrepancia,
            "grupo": clasificacion.get("grupo") or info_catalogo["grupo"] or (pv.grupo if pv else None),
            "categoria_tipo": clasificacion.get("categoria_tipo") or info_catalogo["categoria_tipo"] or (pv.categoria_tipo if pv else None),
            "seccion_menu": clasificacion.get("seccion_menu") or info_catalogo["seccion_menu"] or (pv.seccion_menu if pv else None),
            "costo": info_catalogo["costo"],
            "precio_venta": info_catalogo["precio_venta"],
            "costo_catalogo": info_catalogo["costo_catalogo"],
            "precio_venta_catalogo": info_catalogo["precio_venta_catalogo"],
            "precio_estimado_de_catalogo": info_catalogo["precio_estimado_de_catalogo"],
            "subtotal": pv.subtotal if pv else None,
            "impuesto": pv.impuesto if pv else None,
            "descuento": pv.descuento if pv else None,
            "ingreso_real": cortesia["ingreso_real"] if cortesia else None,
            "monto_cortesia": cortesia["monto_cortesia"] if cortesia else None,
            "cantidad_cortesia": cortesia["cantidad_cortesia"] if cortesia else None,
        }

        for turno in turnos_por_producto.get(nombre) or {None}:
            clave = (nombre, turno)
            cantidad_turno = cantidad_por_producto_turno.get(clave, 0.0)
            horas = horas_por_producto_turno.get(clave, [])
            precio_venta = info_catalogo["precio_venta"]
            fraccion = (cantidad_turno / cantidad_dia) if cantidad_dia > 0 else 1.0

            monto_cortesia_turno = _prorratear(base["monto_cortesia"], fraccion)
            costo = info_catalogo["costo"]
            cantidad_cortesia_turno = (
                round(monto_cortesia_turno / costo)
                if monto_cortesia_turno is not None and costo
                else None
            )

            resultado.append(
                {
                    **base,
                    "turno": turno,
                    "hora_apertura": min(horas).isoformat() if horas else None,
                    "hora_cierre": max(horas).isoformat() if horas else None,
                    "cantidad_comandas": cantidad_turno,
                    "total": cantidad_turno * precio_venta if precio_venta else 0.0,
                    "subtotal": _prorratear(base["subtotal"], fraccion),
                    "impuesto": _prorratear(base["impuesto"], fraccion),
                    "descuento": _prorratear(base["descuento"], fraccion),
                    "ingreso_real": _prorratear(base["ingreso_real"], fraccion),
                    "monto_cortesia": monto_cortesia_turno,
                    "cantidad_cortesia": cantidad_cortesia_turno,
                }
            )

    resultado.sort(key=lambda fila: (not fila["discrepancia"], fila["producto"], _orden_turno(fila["turno"])))
    return resultado
