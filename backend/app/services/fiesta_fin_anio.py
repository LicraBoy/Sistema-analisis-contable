"""
Reglas de negocio de Fiesta de Fin de Año — puras, sin DB.

Portan las fórmulas del Excel "CROQUIS RESERV FIN DE AÑO" (hojas de mesa,
Reservas, Resumen y Cobros) corrigiendo sus errores (ver
``fiesta_fin_anio_semilla.py`` y el plan del módulo). El router carga los
modelos y llama a estas funciones con datos simples.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Iterable

from app.services.fiesta_fin_anio_semilla import CAPACIDAD_MESAS

TIPOS = ("adulto", "nino", "cortesia")
TOLERANCIA = 0.005  # medio centavo: tolerancia para comparar saldos con 0

ESTADOS_SILLA = ("sin_pago", "anticipo", "pagada", "cortesia")

# Cada mesa admite hasta 12 sillas, pero el croquis solo dibuja 10: las sillas 11 y 12 ("extra")
# existen, se venden desde el panel de la mesa y cuentan en cupo y cobros.
MAX_SILLAS_MESA = 12
SILLAS_VISIBLES = 10


def es_silla_extra(numero: int) -> bool:
    """Silla que no se dibuja en el mapa (número mayor al de las sillas visibles)."""
    return numero > SILLAS_VISIBLES

# Precios por tipo: (precio_preventa, precio_normal)
Precios = dict[str, tuple[float, float]]


def es_preventa(fecha_venta: date, corte_preventa: date | None) -> bool:
    """Excel: `G <= Precios!B4` → preventa. Sin corte configurado todo es normal."""
    return corte_preventa is not None and fecha_venta <= corte_preventa


def precio_aplicable(
    tipo: str, fecha_venta: date, corte_preventa: date | None, precios: Precios
) -> float:
    """Precio de un boleto según el tipo y la fecha de venta.

    El Excel dejaba huecos (fecha entre los dos cortes → 0); aquí cualquier
    fecha posterior al corte usa el precio normal. La cortesía usa su propio
    precio (0 en el Excel) si está configurado.
    """
    if tipo not in TIPOS:
        raise ValueError(f"Tipo de boleto inválido: {tipo!r}")
    preventa, normal = precios.get(tipo, (0.0, 0.0))
    return preventa if es_preventa(fecha_venta, corte_preventa) else normal


def calcular_reservacion(
    sillas: Iterable[dict], pagos: Iterable[dict]
) -> dict:
    """Importe, pagado, saldo y estado de una reservación.

    `sillas`: dicts con `tipo`, `precio_aplicado` y (opcional) `activa`.
    `pagos`: dicts con `importe` y (opcional) `cancelado`.

    Estados (Reservas!AB:AE del Excel, pero a nivel reservación porque ahora
    los pagos son de la reservación, no de cada silla):
    - `cortesia`: no hay nada que cobrar (todas las sillas son cortesía).
    - `sin_pago`: hay importe y no se ha pagado nada.
    - `anticipo`: pagó algo pero aún debe.
    - `pagada`: saldo cubierto (un excedente se reporta aparte).
    """
    sillas_activas = [s for s in sillas if s.get("activa", True)]
    pagos_validos = [p for p in pagos if not p.get("cancelado", False)]

    importe = round(sum(float(s.get("precio_aplicado") or 0.0) for s in sillas_activas), 2)
    pagado = round(sum(float(p.get("importe") or 0.0) for p in pagos_validos), 2)
    saldo = round(importe - pagado, 2)

    if not sillas_activas:
        estado = "sin_sillas"
    elif importe <= TOLERANCIA:
        estado = "cortesia"
    elif pagado <= TOLERANCIA:
        estado = "sin_pago"
    elif saldo > TOLERANCIA:
        estado = "anticipo"
    else:
        estado = "pagada"

    return {
        "importe": importe,
        "pagado": pagado,
        "saldo": max(saldo, 0.0),
        "excedente": round(-saldo, 2) if saldo < -TOLERANCIA else 0.0,
        "estado": estado,
    }


def distribuir_abono(importe: float, saldos: dict[int, float]) -> tuple[dict[int, float], float]:
    """Reparte `importe` entre sillas **proporcionalmente a su saldo** (centavos exactos, mayor residuo).

    `saldos`: {silla_id: lo que le falta}. Nunca asigna más que el saldo de una silla; si el importe
    cubre todos los saldos, cada silla recibe el suyo. Devuelve `(reparto, sobrante)` donde `sobrante`
    es lo que no cupo (importe mayor que la suma de saldos).
    """
    importe = round(float(importe), 2)
    pendientes = {k: round(float(v), 2) for k, v in saldos.items() if v > TOLERANCIA}
    if importe <= TOLERANCIA:
        return {}, 0.0
    if not pendientes:
        return {}, importe
    total = round(sum(pendientes.values()), 2)
    if importe >= total - TOLERANCIA:
        return dict(pendientes), max(round(importe - total, 2), 0.0)
    centavos = int(round(importe * 100))
    cent_saldo = {k: int(round(v * 100)) for k, v in pendientes.items()}
    suma = sum(cent_saldo.values())
    base: dict[int, int] = {}
    fracciones: list[tuple[float, int]] = []
    for k, c in cent_saldo.items():
        exacto = centavos * c / suma
        base[k] = int(exacto)
        fracciones.append((exacto - base[k], k))
    faltan = centavos - sum(base.values())
    for _, k in sorted(fracciones, key=lambda x: -x[0])[:faltan]:
        base[k] += 1
    return {k: round(v / 100, 2) for k, v in base.items() if v > 0}, 0.0


def repartir_pagos_por_silla(sillas: Iterable[dict], pagos: Iterable[dict]) -> dict[int, dict]:
    """Refleja los pagos de una reservación silla por silla (hojas de mesa del Excel: Pago 1/2/3,
    Pagado, Saldo).

    `sillas`: dicts con `silla_id`, `precio_aplicado`, `orden` (clave para ordenar, p. ej. (mesa, silla))
    y opcional `activa`. `pagos`: dicts con `id`, `importe`, `fecha`, `referencia`, opcional `cancelado`,
    `silla_ids` (sillas a las que se dirigió el abono) y `reparto` ({silla_id: importe} guardado al
    capturarlo o editarlo por silla).

    1) Se aplica el `reparto` guardado de cada pago (solo sillas activas y hasta su saldo).
    2) Lo no colocado (abonos antiguos sin reparto, sillas liberadas, sobrantes) se distribuye con
       `distribuir_abono` (proporcional al saldo): primero los dirigidos a sus `silla_ids`, luego los
       generales entre todas las sillas con saldo. El excedente (pagado > importe) no se asigna a ninguna
       silla; el total de la reservación no cambia.
    Devuelve `{silla_id: {precio, pagado, saldo, estado, pagos[]}}` con `pagos` ordenados por fecha.
    """
    activas = sorted((s for s in sillas if s.get("activa", True)), key=lambda s: s["orden"])
    vigentes = sorted(
        (p for p in pagos if not p.get("cancelado", False)),
        key=lambda p: (p.get("fecha") or date.min, p.get("id") or 0),
    )

    filas: dict[int, dict] = {}
    for s in activas:
        precio = round(float(s.get("precio_aplicado") or 0.0), 2)
        filas[s["silla_id"]] = {"precio": precio, "pagado": 0.0, "pagos": []}
    ids_con_precio = [s["silla_id"] for s in activas if filas[s["silla_id"]]["precio"] > TOLERANCIA]

    def saldo(sid: int) -> float:
        return round(filas[sid]["precio"] - filas[sid]["pagado"], 2)

    def poner(p: dict, sid: int, monto: float, dirigido: bool) -> None:
        fila = filas[sid]
        fila["pagado"] = round(fila["pagado"] + monto, 2)
        cobro = p.get("cobro_id")
        # Un cobro con varias formas de pago (efectivo + tarjeta) es UN solo "Pago N": se fusiona por cobro_id.
        previa = next(
            (x for x in fila["pagos"] if x["pago_id"] == p.get("id") or (cobro and x.get("cobro_id") == cobro)),
            None,
        )
        parte = {"pago_id": p.get("id"), "forma_pago": p.get("forma_pago") or "", "importe": monto}
        if previa is not None:
            previa["importe"] = round(previa["importe"] + monto, 2)
            parte_previa = next((x for x in previa["partes"] if x["pago_id"] == p.get("id")), None)
            if parte_previa is not None:
                parte_previa["importe"] = round(parte_previa["importe"] + monto, 2)
            else:
                previa["partes"].append(parte)
            return
        fila["pagos"].append(
            {
                "pago_id": p.get("id"),
                "cobro_id": cobro,
                "referencia": p.get("referencia") or "",
                "fecha": p.get("fecha"),
                "importe": monto,
                "dirigido": dirigido,
                "partes": [parte],
            }
        )

    # 1) reparto guardado
    pendientes: list[tuple[dict, float]] = []
    for p in vigentes:
        resto = round(float(p["importe"]), 2)
        for sid, monto in (p.get("reparto") or {}).items():
            sid = int(sid)
            if sid not in ids_con_precio or resto <= TOLERANCIA:
                continue
            parte = round(min(float(monto), saldo(sid), resto), 2)
            if parte > TOLERANCIA:
                poner(p, sid, parte, True)
                resto = round(resto - parte, 2)
        pendientes.append((p, resto))

    # 2) lo no colocado: primero los dirigidos a sillas concretas, luego los generales
    pendientes.sort(key=lambda x: 0 if x[0].get("silla_ids") else 1)
    for p, resto in pendientes:
        if resto <= TOLERANCIA:
            continue
        elegidas = [sid for sid in ids_con_precio if sid in set(p.get("silla_ids") or [])]
        if elegidas:
            rep, resto = distribuir_abono(resto, {sid: saldo(sid) for sid in elegidas})
            for sid, monto in rep.items():
                poner(p, sid, monto, True)
        if resto > TOLERANCIA:
            rep, _ = distribuir_abono(resto, {sid: saldo(sid) for sid in ids_con_precio})
            for sid, monto in rep.items():
                poner(p, sid, monto, False)

    for fila in filas.values():
        fila["pagos"].sort(key=lambda x: (x["fecha"] or date.min, x["pago_id"] or 0))
        fila["saldo"] = max(round(fila["precio"] - fila["pagado"], 2), 0.0)
        if fila["precio"] <= TOLERANCIA:
            fila["estado"] = "cortesia"
        elif fila["saldo"] <= TOLERANCIA:
            fila["estado"] = "pagada"
        elif fila["pagado"] > TOLERANCIA:
            fila["estado"] = "anticipo"
        else:
            fila["estado"] = "sin_pago"
    return filas

UMBRALES_ABONO = (25, 50, 75, 100)
MAX_PAGOS_POR_SILLA = 3  # el Excel tiene Pago 1, 2 y 3 por silla


def sugerir_abonos(base: float, pagado: float, n_pagos: int = 0) -> list[dict]:
    """Abonos sugeridos para llegar a 25/50/75/100 % de `base` (precio de las sillas elegidas).

    Solo se ofrecen umbrales por encima de lo ya pagado: cada uno trae el monto que falta para
    alcanzarlo (`monto = pct·base − pagado`). El primero va marcado `sugerido`; con dos pagos ya hechos
    (máximo 3 por silla, como el Excel) solo se ofrece completar el saldo. Si ya está pagado, no hay.
    """
    base = round(float(base), 2)
    pagado = round(float(pagado), 2)
    saldo = round(base - pagado, 2)
    if base <= TOLERANCIA or saldo <= TOLERANCIA:
        return []
    if n_pagos >= MAX_PAGOS_POR_SILLA - 1:
        return [{"pct": 100, "monto": saldo, "sugerido": True, "completa": True}]
    res = []
    for pct in UMBRALES_ABONO:
        monto = round(base * pct / 100 - pagado, 2)
        if monto <= TOLERANCIA:
            continue
        res.append({"pct": pct, "monto": min(monto, saldo), "sugerido": False, "completa": pct == 100})
    if res:
        res[0]["sugerido"] = True
    return res

def estado_silla(tipo: str, estado_reservacion: str | None) -> str:
    """Estado a mostrar en el croquis; `libre` si no hay reservación activa."""
    if estado_reservacion is None:
        return "libre"
    if tipo == "cortesia":
        return "cortesia"
    if estado_reservacion in ("sin_pago", "anticipo", "pagada"):
        return estado_reservacion
    return "sin_pago"


def validar_cantidades(adultos: int, ninos: int, cortesias: int) -> list[str]:
    """Equivale a los avisos `CORREGIR` del Excel (cantidades enteras ≥ 0)."""
    errores = []
    for nombre, valor in (("adultos", adultos), ("niños", ninos), ("cortesías", cortesias)):
        if valor < 0:
            errores.append(f"La cantidad de {nombre} no puede ser negativa.")
    if adultos + ninos + cortesias == 0:
        errores.append("Indica al menos un boleto.")
    return errores


# ---------------------------------------------------------------------------
# Resumen (hoja Resumen del Excel)
# ---------------------------------------------------------------------------


def _pct(parte: float, total: float) -> float | None:
    return round(parte / total * 100, 1) if total else None


def _variacion(actual: float, anterior: float) -> dict:
    return {
        "actual": actual,
        "anterior": anterior,
        "variacion": actual - anterior,
        "pct": _pct(actual - anterior, anterior),
    }


def construir_resumen(
    reservaciones: Iterable[dict],
    capacidad_total: int,
    historico: Iterable[dict] | None = None,
    fecha_corte: date | None = None,
) -> dict:
    """KPIs de venta.

    `reservaciones`: dicts de reservaciones ACTIVAS con `sillas` (cada una con
    `tipo`, `precio_aplicado`, `preventa` bool, `activa`) más `importe`,
    `pagado`, `saldo`, `estado` (salida de `calcular_reservacion`).
    `historico`: filas de una edición anterior con `fecha`, `reservados`,
    `pagados`, `anticipos`, `sin_anticipo`, `cortesias` (acumulado diario).
    """
    por_tipo = {"adulto": 0, "nino": 0, "cortesia": 0}
    pagadas = anticipos = sin_pago = 0
    preventa = {"adulto": [0, 0.0], "nino": [0, 0.0]}  # [cantidad, importe]
    normal = {"adulto": [0, 0.0], "nino": [0, 0.0]}
    importe_total = pagado_total = saldo_total = excedente_total = 0.0
    importe_cortesias = 0.0
    n_reservaciones = 0

    for r in reservaciones:
        n_reservaciones += 1
        importe_total += r["importe"]
        pagado_total += r["pagado"]
        saldo_total += r["saldo"]
        excedente_total += r.get("excedente", 0.0)
        for s in r["sillas"]:
            if not s.get("activa", True):
                continue
            tipo = s["tipo"]
            por_tipo[tipo] += 1
            if tipo == "cortesia":
                importe_cortesias += s["precio_aplicado"]
                continue
            destino = preventa if s.get("preventa") else normal
            destino[tipo][0] += 1
            destino[tipo][1] += s["precio_aplicado"]
            if r["estado"] == "pagada":
                pagadas += 1
            elif r["estado"] == "anticipo":
                anticipos += 1
            else:
                sin_pago += 1

    total = sum(por_tipo.values())
    cortesias = por_tipo["cortesia"]
    # Excel: R.SIN ANTIC = sin pago + cortesías (Resumen!E16 = AB865 + E11)
    sin_anticipo_con_cortesias = sin_pago + cortesias

    resumen = {
        "capacidad_total": capacidad_total,
        "reservaciones": n_reservaciones,
        "reservas": {
            "adultos": por_tipo["adulto"],
            "ninos": por_tipo["nino"],
            "cortesias": cortesias,
            "total": total,
        },
        "estado": {
            "pagadas": pagadas,
            "anticipos": anticipos,
            "sin_anticipo": sin_pago,
            "cortesias": cortesias,
            "sin_anticipo_con_cortesias": sin_anticipo_con_cortesias,
            "pct_pagadas": _pct(pagadas, total),
            "pct_anticipos": _pct(anticipos, total),
            "pct_sin_anticipo": _pct(sin_anticipo_con_cortesias, total),
        },
        "ocupacion": {
            "ocupadas": total,
            "disponibles": max(capacidad_total - total, 0),
            "pct": _pct(total, capacidad_total),
            # De qué está hecha la ocupación (las cortesías también ocupan silla)
            "adultos": por_tipo["adulto"],
            "ninos": por_tipo["nino"],
            "cortesias": cortesias,
        },
        # Las cortesías no son preventa ni normal: se muestran aparte para que preventa + normal + cortesías = total
        "cortesias_tarifa": {"cantidad": cortesias, "importe": round(importe_cortesias, 2)},
        "preventa": {
            "adultos": {"cantidad": preventa["adulto"][0], "importe": round(preventa["adulto"][1], 2)},
            "ninos": {"cantidad": preventa["nino"][0], "importe": round(preventa["nino"][1], 2)},
        },
        "normal": {
            "adultos": {"cantidad": normal["adulto"][0], "importe": round(normal["adulto"][1], 2)},
            "ninos": {"cantidad": normal["nino"][0], "importe": round(normal["nino"][1], 2)},
        },
        "dinero": {
            "importe_total": round(importe_total, 2),
            "pagado": round(pagado_total, 2),
            "saldo_pendiente": round(saldo_total, 2),
            "excedente": round(excedente_total, 2),
        },
        "comparativo": None,
    }

    anterior = fila_historico_a_fecha(historico or [], fecha_corte)
    if anterior is not None:
        resumen["comparativo"] = {
            "fecha_referencia": anterior["fecha"],
            "reservados": _variacion(total, anterior["reservados"]),
            "pagadas": _variacion(pagadas, anterior["pagados"]),
            "anticipos": _variacion(anticipos, anterior["anticipos"]),
            "sin_anticipo": _variacion(sin_anticipo_con_cortesias, anterior["sin_anticipo"] + anterior["cortesias"]),
            "cortesias": _variacion(cortesias, anterior["cortesias"]),
        }
    return resumen


def fila_historico_a_fecha(historico: Iterable[dict], fecha_corte: date | None) -> dict | None:
    """Fila del histórico equivalente al día de corte (mismo mes/día de esa edición).

    Si esa edición no tiene ese día exacto, usa la última fila anterior a él; si
    no hay `fecha_corte`, la última fila de la serie. Sin datos → None.
    """
    filas = sorted(historico, key=lambda f: f["fecha"])
    if not filas:
        return None
    if fecha_corte is None:
        return filas[-1]
    anio_edicion = filas[0]["fecha"].year
    try:
        objetivo = fecha_corte.replace(year=anio_edicion)
    except ValueError:  # 29 de febrero
        objetivo = fecha_corte.replace(year=anio_edicion, day=28)
    candidatas = [f for f in filas if f["fecha"] <= objetivo]
    return candidatas[-1] if candidatas else None


# ---------------------------------------------------------------------------
# Cobros (hoja Cobros del Excel)
# ---------------------------------------------------------------------------


def construir_cobros(pagos: Iterable[dict], iva_factor: float = 1.16) -> dict:
    """Cobros por día con acumulado. `pagos`: dicts `fecha`, `importe`, `forma_pago`.

    `sin_iva` replica Cobros!F (`importe / 1.16`). El desglose completo con
    propina está en `desglose_fiscal`.
    """
    por_dia: dict[date, float] = defaultdict(float)
    por_forma: dict[str, float] = defaultdict(float)
    for p in pagos:
        por_dia[p["fecha"]] += p["importe"]
        por_forma[p.get("forma_pago") or "Sin especificar"] += p["importe"]

    filas = []
    acumulado = 0.0
    for dia in sorted(por_dia):
        importe = round(por_dia[dia], 2)
        acumulado = round(acumulado + importe, 2)
        filas.append(
            {
                "fecha": dia,
                "importe": importe,
                "sin_iva": round(importe / iva_factor, 2) if iva_factor else importe,
                "acumulado": acumulado,
            }
        )
    total = round(sum(por_dia.values()), 2)
    return {
        "dias": filas,
        "total": total,
        "total_sin_iva": round(total / iva_factor, 2) if iva_factor else total,
        "por_forma_pago": [
            {"forma_pago": k, "importe": round(v, 2)} for k, v in sorted(por_forma.items())
        ],
    }


def construir_cobros_diarios(
    reservaciones: Iterable[dict],
    polizas: dict[date, float],
    iva_factor: float,
    fecha_evento: date | None,
    hoy: date,
) -> dict:
    """Tabla de la hoja Cobros del Excel, día por día, con el bloque "cómo vamos" (reservas al día).

    `reservaciones`: dicts con `fecha_venta`, `cancelada` (bool), `cancelado_en` (date | None),
    `sillas` ([{silla_id, precio_aplicado, activa, orden}]) y `pagos` ([{id, fecha, importe, cancelado,
    referencia, silla_ids, reparto}]). `polizas`: {fecha: total que contabilidad registró ese día}.

    - Días: de la primera venta o pago a `fecha_evento` (o al último movimiento), TODOS, aun sin movimiento.
    - Pago 1/2/3: el 1.º, 2.º y 3.º+ abono vigente de cada reservación (por fecha, id).
    - sin IVA = total / iva_factor; diferencia = sin IVA − póliza (solo si hay póliza ese día).
    - Reservas al día D (sillas): reservaciones con fecha_venta ≤ D que no estaban canceladas, con el
      estado de cada silla calculado con los pagos con fecha ≤ D (`repartir_pagos_por_silla`).
    """
    from datetime import timedelta

    reservaciones = list(reservaciones)
    pagos_vigentes: list[tuple[dict, dict, int]] = []  # (reservación, pago, ordinal)
    for r in reservaciones:
        vigentes = sorted((p for p in r["pagos"] if not p.get("cancelado")), key=lambda p: (p["fecha"], p.get("id") or 0))
        # Los pagos de un mismo cobro (varias formas de pago) comparten número: son UN Pago N.
        ordinal_de_cobro: dict[str, int] = {}
        k = 0
        for p in vigentes:
            cobro = p.get("cobro_id")
            if cobro and cobro in ordinal_de_cobro:
                pagos_vigentes.append((r, p, ordinal_de_cobro[cobro]))
                continue
            k += 1
            if cobro:
                ordinal_de_cobro[cobro] = k
            pagos_vigentes.append((r, p, k))

    movimientos = [p["fecha"] for _, p, _ in pagos_vigentes] + [r["fecha_venta"] for r in reservaciones]
    if not movimientos:
        return {"dias": [], "totales": _totales_cobros([]), "hoy": None}
    inicio = min(movimientos)
    fin = max(max(movimientos), fecha_evento) if fecha_evento else max(movimientos)

    por_dia: dict[date, dict] = {}
    dia = inicio
    while dia <= fin:
        por_dia[dia] = {"pago1": 0.0, "pago2": 0.0, "pago3": 0.0, "ventas": 0, "vendidas": {"adulto": 0, "nino": 0, "cortesia": 0}}
        dia += timedelta(days=1)
    for r, p, k in pagos_vigentes:
        if p["fecha"] in por_dia:
            por_dia[p["fecha"]][f"pago{min(k, 3)}"] += p["importe"]
    for r in reservaciones:
        if r["fecha_venta"] in por_dia:
            por_dia[r["fecha_venta"]]["ventas"] += 1
            # Boletos vendidos ese día por tipo (adulto / niño / cortesía), sin contar los que se cancelaron.
            if not r.get("cancelada"):
                for s in r["sillas"]:
                    if s.get("activa") and s.get("tipo") in por_dia[r["fecha_venta"]]["vendidas"]:
                        por_dia[r["fecha_venta"]]["vendidas"][s["tipo"]] += 1

    def reservas_al(d: date) -> dict:
        cuentas = {"pagadas": 0, "anticipos": 0, "sin_anticipo": 0, "cortesias": 0}
        por_tipo = {"adulto": 0, "nino": 0, "cortesia": 0}
        for r in reservaciones:
            if r["fecha_venta"] > d:
                continue
            if r.get("cancelada") and (r.get("cancelado_en") is None or r["cancelado_en"] <= d):
                continue
            sillas = [s for s in r["sillas"] if s.get("activa") or r.get("cancelada")]
            filas = repartir_pagos_por_silla(
                [{**s, "activa": True} for s in sillas],
                [p for p in r["pagos"] if p["fecha"] <= d],
            )
            for fila in filas.values():
                clave = {"pagada": "pagadas", "anticipo": "anticipos", "sin_pago": "sin_anticipo", "cortesia": "cortesias"}[fila["estado"]]
                cuentas[clave] += 1
            for s in sillas:
                if s.get("tipo") in por_tipo:
                    por_tipo[s["tipo"]] += 1
        cuentas["reservados"] = sum(cuentas.values())
        # Tipo de boleto acumulado al día (no entra en `reservados`, que ya suma por estado de pago)
        cuentas["tipos"] = por_tipo
        return cuentas

    dias = []
    acumulado = 0.0
    for d in sorted(por_dia):
        x = por_dia[d]
        pago1, pago2, pago3 = (round(x["pago1"], 2), round(x["pago2"], 2), round(x["pago3"], 2))
        total = round(pago1 + pago2 + pago3, 2)
        acumulado = round(acumulado + total, 2)
        sin_iva = round(total / iva_factor, 2) if iva_factor else total
        poliza = polizas.get(d)
        dias.append(
            {
                "fecha": d,
                "pago1": pago1,
                "pago2": pago2,
                "pago3": pago3,
                "total": total,
                "sin_iva": sin_iva,
                "poliza": poliza,
                "diferencia": round(sin_iva - poliza, 2) if poliza is not None else None,
                "acumulado": acumulado,
                "movimiento": total != 0 or x["ventas"] > 0,
                "vendidas": x["vendidas"],
                "reservas": reservas_al(d),
            }
        )

    ref = min(max(hoy, inicio), fin)
    snapshot_hoy = next(d for d in dias if d["fecha"] == ref)
    activas = [r for r in reservaciones if not r.get("cancelada")]
    importe_activo = sum(s["precio_aplicado"] for r in activas for s in r["sillas"] if s.get("activa"))
    pagado_activo = sum(p["importe"] for r in activas for p in r["pagos"] if not p.get("cancelado"))
    return {
        "dias": dias,
        "totales": _totales_cobros(dias),
        "hoy": {
            "fecha": ref,
            "es_hoy": ref == hoy,
            "reservas": snapshot_hoy["reservas"],
            "cobrado_hoy": snapshot_hoy["total"],
            "acumulado": snapshot_hoy["acumulado"],
            "por_cobrar": round(max(importe_activo - pagado_activo, 0.0), 2),
        },
    }


def _totales_cobros(dias: list[dict]) -> dict:
    con_poliza = [d for d in dias if d["poliza"] is not None]
    return {
        "pago1": round(sum(d["pago1"] for d in dias), 2),
        "pago2": round(sum(d["pago2"] for d in dias), 2),
        "pago3": round(sum(d["pago3"] for d in dias), 2),
        "total": round(sum(d["total"] for d in dias), 2),
        "sin_iva": round(sum(d["sin_iva"] for d in dias), 2),
        "poliza": round(sum(d["poliza"] for d in con_poliza), 2),
        "diferencia": round(sum(d["diferencia"] for d in con_poliza), 2),
        "dias_con_poliza": len(con_poliza),
    }


def desglose_fiscal(total: float, iva_factor: float = 1.16, propina_pct: float = 0.15) -> dict:
    """Reservas!T870:T874 — el precio del boleto incluye IVA y propina.

    subtotal = total / (iva_factor + propina_pct)  (1.16 + 0.15 = 1.31);
    iva = subtotal × (iva_factor − 1);  propina = subtotal × propina_pct.
    """
    divisor = iva_factor + propina_pct
    subtotal = total / divisor if divisor else total
    iva = subtotal * (iva_factor - 1)
    propina = subtotal * propina_pct
    return {
        "subtotal": round(subtotal, 2),
        "iva": round(iva, 2),
        "propina": round(propina, 2),
        "total": round(subtotal + iva + propina, 2),
    }


def conciliar_contabilidad(total_sistema: float, total_contabilidad: float | None) -> dict:
    """Reservas!X869 (`T867 − W869`): lo cobrado en el sistema contra contabilidad."""
    if total_contabilidad is None:
        return {"total_sistema": round(total_sistema, 2), "total_contabilidad": None, "diferencia": None}
    return {
        "total_sistema": round(total_sistema, 2),
        "total_contabilidad": round(total_contabilidad, 2),
        "diferencia": round(total_sistema - total_contabilidad, 2),
    }


# ---------------------------------------------------------------------------
# Semilla del croquis
# ---------------------------------------------------------------------------

_ZONA_PRINCIPAL = "Salón principal"
_ZONA_200 = "Zona 200"


def posicion_semilla(numero: int) -> tuple[float, float]:
    """Posición inicial (unidades de cuadrícula) copiada de la rejilla del Croquis.

    Mesas 10-113: 11 columnas (de 6 en 6) × 4 filas (de 5 en 5); el 2º dígito
    es la fila. Mesas 200-236: 7 columnas × 4 filas; la decena es la fila.
    """
    if numero < 200:
        col, fila = numero // 10 - 1, numero % 10
        return 79.0 + 6 * col, 14.5 + 5 * fila
    fila, col = (numero - 200) // 10, numero % 10
    return 37.0 + 6 * col, 55.5 + 5 * fila


def mesas_semilla() -> list[dict]:
    """Las 72 mesas del Excel con su capacidad y posición inicial."""
    mesas = []
    for numero, capacidad in sorted(CAPACIDAD_MESAS.items()):
        x, y = posicion_semilla(numero)
        mesas.append(
            {
                "numero": numero,
                "zona": _ZONA_PRINCIPAL if numero < 200 else _ZONA_200,
                "x": x,
                "y": y,
                "capacidad": capacidad,
            }
        )
    return mesas
