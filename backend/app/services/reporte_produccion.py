"""
Reporte de producción y ventas de Carnes y Mariscos — lógica pura (sin DB):
semilla del catálogo de renglones (tomada de "FORMATO PORCIONADOR Y COCINA.xlsx"),
cadena de saldos por renglón y entradas automáticas de cocina. El router hace
las consultas; aquí solo se calcula.

Regla central: la existencia final NO se captura, se calcula:
`final = inicial + entradas − salidas`, y el inicial de un día es la existencia
final del día previo con captura de ese renglón (solo el primer día del renglón
captura su saldo de apertura). Un conteo físico opcional corrige el arrastre.
"""

import re
import unicodedata
from typing import Any, Iterable

HOJAS = ("porcionador", "cocina")
TOLERANCIA = 0.005  # diferencias menores se consideran cuadradas (redondeo de captura)

# (producto, presentación, gramaje, unidad)
_P = "PORCION"
_K = "KG"

SEMILLA_PORCIONADOR: list[tuple[str, list[tuple[str, str | None, str | None, str]]]] = [
    ("CAMARÓN", [
        ("CAMARON COCTELERO 41/50 1 KG", "Cocido", "110g", _P),
        ("CAMARON COCTELERO 41/50 1 KG", "Fajitas, ceviche, ajillo, etc.", "130g", _P),
        ("CAMARON COCTELERO 41/50 1 KG", None, "1 KG", _K),
        ("CAMARON U-15 1 KG (ALMACEN)", "P/Imperiales", "140g", _P),
        ("CAMARON U-15 1 KG (ALMACEN)", "P/Empanizar, Ajo, Relleno", "140g", _P),
        ("CAMARON U-15 1 KG (ALMACEN)", "Enmaquetado", None, _K),
        ("CAMARON 16-20 1 KG (ALMACEN)", None, "140g", _P),
        ("CAMARON 16-20 1 KG (ALMACEN)", "Enmaquetado", "2 KG", _K),
        ("CAMARON 26-30 1 KG", None, "KG", _K),
    ]),
    ("PESCADO", [
        ("FILETE PESCADO (DORADO)", "P/Empanizar, Ajo, etc.", "180g", _P),
        ("FILETE PESCADO (DORADO)", "P/Ceviche", "150g", _P),
        ("FILETE PESCADO (DORADO)", "Entero", "KG", _K),
        ("FILETE PESCADO (JUREL)", "P/Empanizar, Ajo, etc.", "180g", _P),
        ("FILETE PESCADO (JUREL)", "P/Ceviche", "150g", _P),
        ("FILETE PESCADO (JUREL)", "Entero", "KG", _K),
        ("MEDALLON DE ATUN 1 KG (ALMACEN)", None, "200g", _P),
    ]),
    ("RES", [
        ("FILETE DE RES 1 KG", "Mignon", "180g", _P),
        ("FILETE DE RES 1 KG", "Mignoncito", "130g", _P),
        ("FILETE DE RES 1 KG", "Tampiqueña", "130-135g", _P),
        ("FILETE DE RES 1 KG", "Fajitas", "150g", _P),
        ("FILETE DE RES 1 KG", "Filete res corte", "400g", _P),
        ("FILETE DE RES 1 KG", None, "KG", _K),
        ("PULPA BOLA LA REVUELTA 1 KG", "Hamburguesa", "140-145g", _P),
        ("PULPA BOLA LA REVUELTA 1 KG", None, "KG", _K),
        ("CARNE SIRLOIN 1 KG. ALMACEN", "Bulto c/5 cortes", "2.00 KG", _K),
        ("CARNE SIRLOIN 1 KG. ALMACEN", "Pieza entera", "KG", _K),
    ]),
    ("CERDO Y EMBUTIDOS", [
        ("SALCHICHA CASA", "Pierna y grasa de cerdo", "150g", _P),
        ("CARNITAS", None, "150g", _P),
        ("PIERNA DE CERDO", None, "KG", _K),
        ("GRASA DE CERDO", None, "KG", _K),
        ("MACHACA DE RES", "Machaca", "70g", _P),
        ("MACHACA DE RES", None, "KG", _K),
    ]),
    ("POLLO", [
        ("PECHUGA DE POLLO 1 KG", "Dedos de pollo", "250g", _P),
        ("PECHUGA DE POLLO 1 KG", "Fajitas", "130g", _P),
        ("PECHUGA DE POLLO 1 KG", "Filetitos", None, _P),
        ("PECHUGA DE POLLO 1 KG", "Caja KG", "KG", _K),
        ("POLLO CANAL 1 KG", "Pollo a la parrilla", "440g", "1/2 PZA"),
        ("POLLO CANAL 1 KG", "Pollo BBQ", "600g", "1/2 PZA"),
        ("POLLO CANAL 1 KG", None, "KG", _K),
    ]),
    ("MARISCOS", [
        ("PULPA DE JAIBA 1 KG (ALMACEN)", None, "KG", _K),
        ("CALAMAR", "Porcion", "180g", _P),
        ("CALAMAR 1 KG", "Enmaquetado", "KG", _K),
        ("PULPO 1 KG (ALMACEN)", None, "KG", _K),
        ("PULPO 1 KG (ALMACEN)", "Caja", "KG", _K),
    ]),
    ("OTROS", [
        ("TOCINO AHUMADO SIGMA 1 KG (ALMACEN)", None, "KG", _K),
    ]),
]

SEMILLA_COCINA: list[tuple[str, list[tuple[str, str | None, str | None, str]]]] = [
    ("CAMARÓN", [
        ("CAMARON COCTELERO 41/50 1 KG", "Cocido", "110g", _P),
        ("CAMARON COCTELERO 41/50 1 KG", "Fajitas, ceviche, ajillo, etc.", "130g", _P),
        ("CAMARON U-15 1 KG (ALMACEN)", "P/Imperiales", "130-140g", _P),
        ("CAMARON U-15 1 KG (ALMACEN)", "P/Empanizar, Ajo, Relleno", "130-140g", _P),
        ("CAMARON 16-20 1 KG (ALMACEN)", None, None, _P),
    ]),
    ("PESCADO Y ATÚN", [
        ("FILETE PESCADO (DORADO)", "P/Empanizar, Ajo, etc.", "170-180g", _P),
        ("FILETE PESCADO (DORADO)", "P/Ceviche", "140-150g", _P),
        ("FILETE PESCADO (JUREL)", "P/Empanizar, Ajo, etc.", "170-180g", _P),
        ("FILETE PESCADO (JUREL)", "P/Ceviche", "140-150g", _P),
        ("MEDALLON DE ATUN 1 KG (ALMACEN)", None, None, _K),
        ("PESCADO AHUMADO (MARLIN)", None, None, _K),
    ]),
    ("RES", [
        ("FILETE DE RES 1 KG", "Mignon", "180g", _P),
        ("FILETE DE RES 1 KG", "Mignoncito", "130g", _P),
        ("FILETE DE RES 1 KG", "Tampiqueña", "130-135g", _P),
        ("FILETE DE RES 1 KG", "Fajitas", "150g", _P),
    ]),
    ("OTRAS CARNES", [
        ("PULPA BOLA LA REVUELTA 1 KG", "Hamburguesa", "140-145g", _P),
        ("CARNITAS", None, "150g", _P),
        ("MACHACA DE RES", "Machaca", "70g", _P),
    ]),
    ("POLLO", [
        ("PECHUGA DE POLLO 1 KG", "Dedos de pollo", "220-250g", "BULTO"),
        ("PECHUGA DE POLLO 1 KG", "Fajitas", "120-130g", _P),
        ("POLLO CANAL 1 KG", "Pollo a la parrilla", "430-440g", "1/2 PZA"),
        ("POLLO CANAL 1 KG", "Pollo BBQ", "580-600g", "1/2 PZA"),
    ]),
    ("CORTES PREMIUM DE RES", [
        ("CORTE NEW YORK", None, "350g", "PZA"),
        ("CORTE T-BONE", None, None, "PZA"),
        ("CORTE TOMAHAWK", None, "1.2 KG", "PZA"),
        ("CORTE RIB EYE", None, "350g", "PZA"),
        ("TUETANO DE RES", None, None, _K),
        ("SHORT RIB (COSTILLA DE RES)", None, None, _K),
        ("PRIME RIB REVUELTA 1 KG (ALMACEN)", None, None, _K),
        ("COSTILLA DE BBQ SPIRE RIB 1 KG", None, None, _K),
    ]),
    ("MARISCOS", [
        ("PULPO 1 KG (ALMACEN)", None, None, _K),
        ("CALAMAR", "Porcion", None, _P),
    ]),
]

SEMILLAS = {"porcionador": SEMILLA_PORCIONADOR, "cocina": SEMILLA_COCINA}


def normalizar(texto: str | None) -> str:
    """Mayúsculas, sin acentos ni espacios repetidos."""
    if not texto:
        return ""
    sin_acentos = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sin_acentos).strip().upper()


def construir_clave_cruce(producto: str, presentacion: str | None) -> str:
    return f"{normalizar(producto)}|{normalizar(presentacion)}"


def filas_semilla(hoja: str) -> list[dict[str, Any]]:
    """Renglones de la semilla de una hoja, con `orden` consecutivo."""
    filas: list[dict[str, Any]] = []
    for seccion, items in SEMILLAS[hoja]:
        for producto, presentacion, gramaje, unidad in items:
            filas.append({
                "hoja": hoja,
                "seccion": seccion,
                "producto": producto,
                "presentacion": presentacion,
                "gramaje": gramaje,
                "unidad": unidad,
                "orden": (len(filas) + 1) * 10,
                "activo": True,
                "clave_cruce": construir_clave_cruce(producto, presentacion),
            })
    return filas


def calcular_cadena_renglon(capturas: Iterable[Any]) -> list[dict[str, Any]]:
    """Cadena de saldos de UN renglón; cada captura trae fecha/inicial/entradas/salidas/conteo_fisico.

    - `inicial` = el capturado a mano ese día si existe (corrige un día olvidado o una falla);
      si no, la `existencia_final` efectiva del día previo con captura (los días sin captura
      se saltan: el saldo se arrastra). El primer día sin inicial capturado parte de 0.
    - `final_calculado = inicial + entradas − salidas` (vacío dentro de un día = 0).
    - Si hay `conteo_fisico` (la existencia final editada a mano), ésa es la `existencia_final`
      efectiva (corrige el arrastre)
      y `diferencia = conteo − final_calculado`; si no, `existencia_final = final_calculado`.
    - `alerta_negativo` si el final calculado queda por debajo de 0.
    Devuelve una fila por captura, ordenada por fecha.
    """
    filas: list[dict[str, Any]] = []
    saldo: float | None = None
    for c in sorted(capturas, key=lambda x: x.fecha):
        es_apertura = saldo is None
        inicial_manual = c.inicial
        inicial = inicial_manual if inicial_manual is not None else (saldo or 0.0)
        entradas = c.entradas or 0.0
        salidas = c.salidas or 0.0
        final_calculado = round(inicial + entradas - salidas, 4)
        conteo = c.conteo_fisico
        if conteo is not None:
            existencia = conteo
            diferencia = round(conteo - final_calculado, 4)
        else:
            existencia = final_calculado
            diferencia = None
        filas.append({
            "fecha": c.fecha,
            "es_apertura": es_apertura,
            "inicial": inicial,
            "inicial_manual": inicial_manual,
            "inicial_arrastrado": saldo,
            "entradas": entradas,
            "salidas": salidas,
            "final_calculado": final_calculado,
            "conteo_fisico": conteo,
            "existencia_final": existencia,
            "diferencia": diferencia,
            "alerta_negativo": final_calculado < -TOLERANCIA,
        })
        saldo = existencia
    return filas


def estado_diferencia(diferencia: float | None) -> str:
    """`sin_conteo` | `cuadra` | `sobrante` | `faltante` para la diferencia conteo − calculado."""
    if diferencia is None:
        return "sin_conteo"
    if abs(diferencia) <= TOLERANCIA:
        return "cuadra"
    return "sobrante" if diferencia > 0 else "faltante"


def construir_entradas_automaticas(renglones: Iterable[Any], capturas: Iterable[Any]):
    """Entradas de cocina derivadas de las "Salidas a cocina" del porcionador (misma `clave_cruce`, mismo día).

    Devuelve `entradas_auto(renglon_cocina, fecha) -> float | None`: `None` si el renglón de
    cocina no tiene equivalente en porcionador (sus entradas se capturan a mano); si lo tiene,
    la suma de las salidas de los renglones porcionador con esa clave ese día (0 si no hubo).
    `capturas`: cualquier objeto con renglon_id/fecha/salidas.
    """
    renglones = [r for r in renglones if r.activo and r.clave_cruce]
    claves_porcionador = {r.clave_cruce for r in renglones if r.hoja == "porcionador"}
    clave_de = {r.id: r.clave_cruce for r in renglones if r.hoja == "porcionador"}
    salidas: dict[tuple[str, Any], float] = {}
    for c in capturas:
        clave = clave_de.get(c.renglon_id)
        if clave is not None and c.salidas is not None:
            salidas[(clave, c.fecha)] = salidas.get((clave, c.fecha), 0.0) + c.salidas

    def entradas_auto(renglon: Any, fecha: Any) -> float | None:
        if renglon.hoja != "cocina" or renglon.clave_cruce not in claves_porcionador:
            return None
        return salidas.get((renglon.clave_cruce, fecha), 0.0)

    return entradas_auto


def renglones_sin_contraparte(renglones: Iterable[Any]) -> list[dict[str, Any]]:
    """Renglones activos cuya `clave_cruce` no existe en la otra hoja (no se descartan, se listan).

    Los de cocina son los que NO reciben entradas automáticas y se capturan a mano.
    """
    activos = [r for r in renglones if r.activo and r.clave_cruce]
    claves = {h: {r.clave_cruce for r in activos if r.hoja == h} for h in HOJAS}
    resultado = []
    for r in activos:
        otra = "cocina" if r.hoja == "porcionador" else "porcionador"
        if r.clave_cruce not in claves[otra]:
            resultado.append({"producto": r.producto, "presentacion": r.presentacion, "hoja": r.hoja})
    return resultado


# ── Inventario en kg bruto y en pesos (hoja PORCIONADOR del libro de inventario) ─────────────────────
# Por cada presentación: kg limpio = cantidad × gramaje_kg; factor = prueba_bruto / prueba_limpio;
# kg bruto = kg limpio × factor. El producto base suma sus kg bruto y se valúa con su precio por kg.
# Nada se inventa: sin gramaje o sin factor la fila queda marcada y NO suma (ni ceros ni factor 1).

# (producto, presentación) → (gramaje_kg, prueba_bruto_kg, prueba_limpio_kg), tomado de la hoja PORCIONADOR.
# El gramaje se toma de la hoja solo si coincide (±5 %) con el que dice el formato impreso; donde la hoja se
# contradice (filete corte 300 g vs 400 g, pollo a la parrilla/BBQ 0.55 kg vs 440/600 g) se deja vacío para
# que el usuario lo confirme en el catálogo.
RENDIMIENTOS_SEMILLA: dict[tuple[str, str | None], tuple[float | None, float | None, float | None]] = {
    ("CAMARON COCTELERO 41/50 1 KG", "Cocido"): (0.11, 10.0, 6.27),
    ("CAMARON COCTELERO 41/50 1 KG", "Fajitas, ceviche, ajillo, etc."): (0.13, 8.0, 5.28),
    ("CAMARON U-15 1 KG (ALMACEN)", "P/Imperiales"): (0.14, 6.0, 5.74),
    ("CAMARON U-15 1 KG (ALMACEN)", "P/Empanizar, Ajo, Relleno"): (0.14, 2.0, 1.82),
    ("CAMARON 16-20 1 KG (ALMACEN)", None): (0.14, 6.0, 5.74),
    ("FILETE PESCADO (DORADO)", "P/Empanizar, Ajo, etc."): (0.18, 11.06, 8.35),
    ("FILETE PESCADO (DORADO)", "P/Ceviche"): (0.15, None, None),
    ("FILETE DE RES 1 KG", "Mignon"): (0.185, 12.76, 9.65),
    ("FILETE DE RES 1 KG", "Mignoncito"): (0.13, 12.76, 9.65),
    ("FILETE DE RES 1 KG", "Tampiqueña"): (0.135, 12.76, 9.65),
    ("FILETE DE RES 1 KG", "Fajitas"): (0.15, 12.76, 9.65),
    ("FILETE DE RES 1 KG", "Filete res corte"): (None, 12.76, 9.65),
    ("PULPA BOLA LA REVUELTA 1 KG", "Hamburguesa"): (0.145, 9.31, 7.65),
    ("CARNE SIRLOIN 1 KG. ALMACEN", "Bulto c/5 cortes"): (2.0, 8.1, 6.51),
    ("SALCHICHA CASA", "Pierna y grasa de cerdo"): (0.15, 6.0, 5.7),
    ("MACHACA DE RES", "Machaca"): (0.07, 3.0, 3.0),
    ("PECHUGA DE POLLO 1 KG", "Dedos de pollo"): (0.25, 26.33, 12.14),
    ("PECHUGA DE POLLO 1 KG", "Fajitas"): (0.13, 26.33, 12.14),
    ("POLLO CANAL 1 KG", "Pollo a la parrilla"): (None, 1.2, 1.0),
    ("POLLO CANAL 1 KG", "Pollo BBQ"): (None, 1.25, 1.1),
    ("CALAMAR", "Porcion"): (0.18, 15.0, 7.02),
    ("PULPO 1 KG (ALMACEN)", None): (1.0, 15.0, 7.0),
}

# producto base → precio por kg (bruto), inferido de las fórmulas de la hoja (L = kg bruto × precio) y comprobado.
PRECIOS_KG_SEMILLA: dict[str, float] = {
    "CAMARON COCTELERO 41/50 1 KG": 180.0,
    "CAMARON U-15 1 KG (ALMACEN)": 280.0,
    "CAMARON 16-20 1 KG (ALMACEN)": 280.0,
    "FILETE PESCADO (DORADO)": 180.0,
    "FILETE DE RES 1 KG": 240.0,
    "PULPA BOLA LA REVUELTA 1 KG": 102.0,
    "CARNE SIRLOIN 1 KG. ALMACEN": 122.0,
    "SALCHICHA CASA": 75.0,
    "MACHACA DE RES": 200.0,
    "PECHUGA DE POLLO 1 KG": 81.0,
    "POLLO CANAL 1 KG": 51.0,
    "CALAMAR": 130.0,
    "CALAMAR 1 KG": 130.0,
    "PULPO 1 KG (ALMACEN)": 200.0,
}


_RE_GRAMAJE = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*(kgs?|gramos?|grs?|g)\s*$", re.IGNORECASE)


def gramaje_desde_texto(texto: str | None) -> float | None:
    """Convierte el gramaje impreso del formato ("180g", "150 G", "2.00 KG") a kg; None si no es un valor único claro.

    Los rangos ("130-135g"), los textos sin número ("KG") y los números sin unidad ("2") NO se interpretan: se
    prefiere avisar que falta a inventar un gramaje. Un valor en gramos menor a 10 se descarta (p. ej. "1.300 G",
    que en realidad son 1,300 g con punto de miles).
    """
    if not texto:
        return None
    m = _RE_GRAMAJE.match(texto)
    if not m:
        return None
    valor = float(m.group(1).replace(",", "."))
    if m.group(2).lower().startswith("k"):
        return valor if valor > 0 else None
    return round(valor / 1000, 4) if valor >= 10 else None


def gramaje_efectivo_kg(r: Any) -> float | None:
    """Gramaje en kg de un renglón: el número capturado, o el que dice su texto impreso.

    En presentaciones en KG el texto NO se usa ("2 KG" de un enmaquetado es el tamaño del paquete, y la cantidad
    ya está en kg: multiplicar duplicaría los kg); ahí solo vale el número explícito.
    """
    if r.gramaje_kg is not None:
        return r.gramaje_kg
    if (r.unidad or "").upper() == "KG":
        return None
    return gramaje_desde_texto(r.gramaje)


def completar_rendimientos(renglones: Iterable[Any]) -> int:
    """Rellena SOLO los campos de rendimiento vacíos desde la semilla (no pisa lo que el usuario ya editó).

    Devuelve cuántos renglones cambiaron.
    """
    cambiados = 0
    for r in renglones:
        semilla = RENDIMIENTOS_SEMILLA.get((r.producto, r.presentacion))
        if semilla is None:
            continue
        gramaje, bruto, limpio = semilla
        tocado = False
        for campo, valor in (("gramaje_kg", gramaje), ("prueba_bruto_kg", bruto), ("prueba_limpio_kg", limpio)):
            if valor is not None and getattr(r, campo) is None:
                setattr(r, campo, valor)
                tocado = True
        cambiados += tocado
    return cambiados


def factor_rendimiento(bruto: float | None, limpio: float | None) -> float | None:
    """bruto / limpio de la prueba; None si falta alguno o el limpio es 0 (nunca se asume 1)."""
    if bruto is None or limpio is None or limpio <= 0 or bruto <= 0:
        return None
    return bruto / limpio


# ── Pesaje de limpieza: el factor real sale de lo que el porcionador pesa cada día ─────────────────────
# bruto = lo que recibe; limpio = lo que le queda tras quitar la merma. factor = Σbruto / Σlimpio.

TOLERANCIA_CONTROL_PCT = 5.0  # diferencia (limpio pesado vs porciones producidas) aceptada sin marcar, en % del limpio


def factor_de_pesajes(pesajes: Iterable[Any]) -> float | None:
    """Σbruto / Σlimpio de los pesajes dados; None si no hay o el limpio no es positivo."""
    bruto = limpio = 0.0
    for p in pesajes:
        bruto += p.bruto_kg or 0.0
        limpio += p.limpio_kg or 0.0
    return factor_rendimiento(bruto, limpio)


def merma_kg(bruto_kg: float, limpio_kg: float) -> float:
    return round(bruto_kg - limpio_kg, 4)


def factores_por_producto(pesajes: Iterable[Any], fecha: Any) -> dict[str, dict[str, Any]]:
    """Factor vigente de cada producto base: el del ÚLTIMO día con pesaje que no sea posterior a `fecha`.

    Si ese día hubo varios pesajes se suman (Σbruto / Σlimpio). Los pesajes futuros nunca cuentan.
    Devuelve `{producto: {factor, fecha (iso), bruto_kg, limpio_kg}}`; sin pesaje válido no hay entrada.
    """
    por_producto: dict[str, list[Any]] = {}
    for p in pesajes:
        if p.fecha <= fecha:
            por_producto.setdefault(p.producto, []).append(p)
    resultado: dict[str, dict[str, Any]] = {}
    for producto, lista in por_producto.items():
        ultimo = max(p.fecha for p in lista)
        del_dia = [p for p in lista if p.fecha == ultimo]
        factor = factor_de_pesajes(del_dia)
        if factor is None:
            continue
        resultado[producto] = {
            "factor": factor,
            "fecha": ultimo.isoformat(),
            "bruto_kg": round(sum(p.bruto_kg for p in del_dia), 4),
            "limpio_kg": round(sum(p.limpio_kg for p in del_dia), 4),
        }
    return resultado


def resolver_crudos(renglones: Iterable[Any]) -> set[int]:
    """Ids de los renglones de Porcionador que son el producto CRUDO que se limpia.

    Explícito primero: `es_crudo=True` lo marca el usuario y `es_crudo=False` lo descarta. Sin marcas explícitas
    en el producto, el crudo es su única presentación en KG; si hay varias en KG ninguna se elige sola (se
    marcaría mal): el usuario indica cuál en el catálogo.
    """
    por_producto: dict[str, list[Any]] = {}
    for r in renglones:
        if r.hoja == "porcionador" and r.activo:
            por_producto.setdefault(r.producto, []).append(r)
    crudos: set[int] = set()
    for rs in por_producto.values():
        explicitos = [r for r in rs if r.es_crudo is True]
        if explicitos:
            crudos.update(r.id for r in explicitos)
            continue
        candidatos = [
            r for r in rs if (r.unidad or "").upper() == "KG" and r.es_crudo is None and not getattr(r, "es_limpio", None)
        ]
        if len(candidatos) == 1:
            crudos.add(candidatos[0].id)
    return crudos


def salidas_auto_crudo(renglones: Iterable[Any], pesajes: Iterable[Any]) -> dict[tuple[int, Any], float]:
    """Salida automática del crudo: el bruto pesado ese día ("usado en limpieza"), por (renglon_id, fecha).

    Si un producto tiene varios crudos marcados, el bruto se asigna al primero (no se cuenta dos veces).
    """
    renglones = list(renglones)
    crudos = resolver_crudos(renglones)
    primer_crudo: dict[str, int] = {}
    for r in renglones:
        if r.id in crudos and r.producto not in primer_crudo:
            primer_crudo[r.producto] = r.id
    resultado: dict[tuple[int, Any], float] = {}
    for p in pesajes:
        rid = primer_crudo.get(p.producto)
        if rid is not None:
            clave = (rid, p.fecha)
            resultado[clave] = round(resultado.get(clave, 0.0) + p.bruto_kg, 4)
    return resultado


def calcular_control_limpieza(
    pesajes_del_dia: Iterable[Any],
    renglones: Iterable[Any],
    entradas: dict[int, float | None],
    salidas: dict[int, float | None] | None = None,
) -> dict[str, Any]:
    """Control de un producto base y un día: los kg limpios pesados contra lo que salió en porciones.

    - `pesajes_del_dia`: pesajes de ESE producto ese día. `renglones`: los renglones del producto en Porcionador.
    - `entradas`: renglon_id → "Entradas y producción" del día. Solo cuentan las presentaciones procesadas
      (unidad distinta de KG): kg de porciones = Σ entradas × gramaje_kg.
    - Limpio intermedio (`es_limpio`, p. ej. filetitos): es pollo ya limpio que sobra. Sus entradas del día son limpio
      que sobró (cuenta como producido) y sus `salidas` lo que se usó para hacer porciones (se descuenta: esas
      porciones ya están contadas arriba). Se suma el neto (entradas − salidas), en kg.
    - Estados: `sin_pesaje` (hubo producción pero nada pesado), `cuadra` (dentro de ±5 % del limpio),
      `faltan_porciones` (se pesó más limpio del que se porcionó), `exceden_limpio` (más porciones de las que alcanzan).
    """
    pesajes = list(pesajes_del_dia)
    bruto = round(sum(p.bruto_kg for p in pesajes), 4)
    limpio = round(sum(p.limpio_kg for p in pesajes), 4)

    porciones: list[dict[str, Any]] = []
    sin_gramaje: list[str] = []
    kg_porciones = 0.0
    for r in renglones:
        cantidad = entradas.get(r.id)
        es_kg = (r.unidad or "").upper() == "KG"
        if es_kg and getattr(r, "es_limpio", None):
            neto = round((cantidad or 0.0) - ((salidas or {}).get(r.id) or 0.0), 4)
            if neto:
                kg_porciones += neto
                porciones.append({
                    "renglon_id": r.id, "presentacion": r.presentacion, "entradas": neto, "gramaje_kg": 1.0, "kg": neto,
                    "limpio_intermedio": True,
                })
            continue
        if es_kg or not cantidad:
            continue
        nombre = r.presentacion or r.producto
        gramaje = gramaje_efectivo_kg(r)
        if gramaje is None:
            sin_gramaje.append(nombre)
            continue
        kg = round(cantidad * gramaje, 4)
        kg_porciones += kg
        porciones.append({
            "renglon_id": r.id, "presentacion": r.presentacion, "entradas": cantidad, "gramaje_kg": gramaje, "kg": kg,
            "limpio_intermedio": False,
        })
    kg_porciones = round(kg_porciones, 4)

    factor = factor_rendimiento(bruto, limpio)
    diferencia = pct = None
    if not pesajes:
        estado = "sin_pesaje"
    else:
        diferencia = round(limpio - kg_porciones, 4)
        pct = round(diferencia / limpio * 100, 2) if limpio > 0 else None
        if pct is not None and abs(pct) <= TOLERANCIA_CONTROL_PCT:
            estado = "cuadra"
        else:
            estado = "faltan_porciones" if diferencia > 0 else "exceden_limpio"
    return {
        "bruto_kg": bruto,
        "limpio_kg": limpio,
        "merma_kg": merma_kg(bruto, limpio) if pesajes else None,
        "factor": round(factor, 4) if factor is not None else None,
        "kg_porciones": kg_porciones,
        "diferencia_kg": diferencia,
        "diferencia_pct": pct,
        "estado": estado,
        "porciones": porciones,
        "sin_gramaje": sin_gramaje,
    }


def agrupar_por_seccion(productos: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa los productos ya calculados por sección (CAMARÓN, RES…) en el orden del catálogo.

    El valor del grupo suma solo los productos con precio; `sin_precio` avisa si algún producto con bruto no
    lo tiene (no se inventa un 0). La suma de los grupos coincide con los totales del inventario.
    """
    grupos: dict[str, dict[str, Any]] = {}
    for p in productos:
        g = grupos.setdefault(
            p["seccion"], {"seccion": p["seccion"], "kg_bruto_total": 0.0, "valor": 0.0, "sin_precio": False, "productos": []}
        )
        g["productos"].append(p)
        g["kg_bruto_total"] = round(g["kg_bruto_total"] + p["kg_bruto_total"], 4)
        if p["kg_bruto_total"] > 0:
            if p["valor"] is None:
                g["sin_precio"] = True
            else:
                g["valor"] = round(g["valor"] + p["valor"], 2)
    return list(grupos.values())


def calcular_inventario_bruto(
    renglones: Iterable[Any],
    cantidades: dict[int, float | None],
    precios: dict[str, float | None],
    catalogo_referencia: Iterable[Any] = (),
    factores_pesaje: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Inventario expresado en kg limpio, kg bruto y pesos, agrupado por producto base.

    - `renglones`: los de la hoja a calcular (orden = orden del catálogo); `cantidades`: renglon_id → existencia.
    - `precios`: producto base → precio por kg.
    - `catalogo_referencia`: renglones de la OTRA hoja; si un renglón no tiene gramaje/prueba propios, hereda los
      del renglón con la misma `clave_cruce` (Cocina usa lo medido en Porcionador).
    - Una presentación en KG sin gramaje cuenta 1 kg por unidad, y sin prueba su bruto es su cantidad (ya viene en bruto).
    - `factores_pesaje` (de `factores_por_producto`): el factor del último pesaje de limpieza manda sobre la prueba fija
      del renglón, salvo en piezas en KG sin prueba (ya son bruto). Cada producto informa de dónde salió su factor.
    """
    referencia: dict[str, Any] = {}
    for r in catalogo_referencia:
        if r.clave_cruce and r.clave_cruce not in referencia:
            referencia[r.clave_cruce] = r

    productos: dict[str, dict[str, Any]] = {}
    advertencias: list[str] = []

    renglones = list(renglones)
    # prueba bruto/limpio del producto (la de su primer renglón que la tenga): la usan los sobrantes ya limpios
    prueba_del_producto: dict[str, tuple[float, float]] = {}
    for r in renglones:
        if r.prueba_bruto_kg is not None and r.prueba_limpio_kg is not None and r.producto not in prueba_del_producto:
            prueba_del_producto[r.producto] = (r.prueba_bruto_kg, r.prueba_limpio_kg)

    for r in renglones:
        ref = referencia.get(r.clave_cruce) if r.clave_cruce else None
        gramaje = gramaje_efectivo_kg(r)
        if gramaje is None and ref is not None:
            gramaje = gramaje_efectivo_kg(ref)
        bruto_p = r.prueba_bruto_kg if r.prueba_bruto_kg is not None else (ref.prueba_bruto_kg if ref is not None else None)
        limpio_p = r.prueba_limpio_kg if r.prueba_limpio_kg is not None else (ref.prueba_limpio_kg if ref is not None else None)
        es_kg = (r.unidad or "").upper() == "KG"
        if gramaje is None and es_kg:
            gramaje = 1.0
        # sobrante ya LIMPIO en KG (p. ej. filetitos): su cantidad son kg limpios, así que sí lleva el factor del producto
        es_limpio = es_kg and bool(getattr(r, "es_limpio", None))
        if es_limpio and (bruto_p is None or limpio_p is None):
            bruto_p, limpio_p = prueba_del_producto.get(r.producto, (None, None))
        factor = factor_rendimiento(bruto_p, limpio_p)
        origen_fila = "catalogo" if factor is not None else None
        pesaje = (factores_pesaje or {}).get(r.producto)
        if pesaje is not None and (not es_kg or factor is not None or es_limpio):
            factor = pesaje["factor"]
            bruto_p, limpio_p = pesaje["bruto_kg"], pesaje["limpio_kg"]
            origen_fila = "pesaje"

        cantidad = cantidades.get(r.id)
        kg_limpio = kg_bruto = None
        falta: str | None = None
        # un limpio intermedio puede quedar en negativo (neto de producción: se usó más de lo que sobró ese día)
        if cantidad is not None and (cantidad > 0 or (es_limpio and cantidad < 0)):
            if gramaje is None:
                falta = "sin gramaje"
            else:
                kg_limpio = round(cantidad * gramaje, 4)
                if factor is not None:
                    kg_bruto = round(kg_limpio * factor, 4)
                elif es_kg and not es_limpio:
                    kg_bruto = kg_limpio  # ya viene en bruto
                else:
                    falta = "sin factor de rendimiento"
            if falta:
                nombre = f"{r.producto}{f' ({r.presentacion})' if r.presentacion else ''}"
                advertencias.append(f"{nombre}: {falta}")
        elif cantidad is not None:
            kg_limpio = kg_bruto = 0.0

        prod = productos.setdefault(
            r.producto,
            {
                "producto": r.producto,
                "seccion": r.seccion,
                "precio_kg": precios.get(r.producto),
                "filas": [],
                "kg_bruto_total": 0.0,
                "factor_origen": None,
                "factor_fecha": None,
            },
        )
        if origen_fila == "pesaje":
            prod["factor_origen"], prod["factor_fecha"] = "pesaje", pesaje["fecha"]
        elif origen_fila == "catalogo" and prod["factor_origen"] is None:
            prod["factor_origen"] = "catalogo"
        prod["filas"].append({
            "renglon_id": r.id,
            "presentacion": r.presentacion,
            "unidad": r.unidad,
            "cantidad": cantidad,
            "gramaje_kg": gramaje,
            "kg_limpio": kg_limpio,
            "factor": round(factor, 4) if factor is not None else None,
            "prueba_bruto_kg": bruto_p,
            "prueba_limpio_kg": limpio_p,
            "kg_bruto": kg_bruto,
            "falta": falta,
            "limpio_intermedio": es_limpio,
        })
        if kg_bruto:
            prod["kg_bruto_total"] = round(prod["kg_bruto_total"] + kg_bruto, 4)

    total_kg = total_valor = 0.0
    lista = []
    for prod in productos.values():
        precio = prod["precio_kg"]
        prod["valor"] = round(prod["kg_bruto_total"] * precio, 2) if precio is not None else None
        if prod["kg_bruto_total"] > 0:
            total_kg += prod["kg_bruto_total"]
            if prod["valor"] is not None:
                total_valor += prod["valor"]
            else:
                advertencias.append(f"{prod['producto']}: sin precio por kg (no suma al valor)")
        lista.append(prod)
    return {
        "productos": lista,
        "grupos": agrupar_por_seccion(lista),
        "total_kg_bruto": round(total_kg, 4),
        "total_valor": round(total_valor, 2),
        "advertencias": advertencias,
    }
