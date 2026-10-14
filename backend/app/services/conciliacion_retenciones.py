"""
Conciliación de retenciones (IVA RET 10%/4%, ISR RET 10%/1.25%) contra un
archivo externo (auxiliar contable / estado de cuenta) con columnas
Fecha/Número/Concepto/Débito/Crédito. Módulo aislado: no toca la lógica de
Amarre existente, solo la consume ya calculada.
"""

import re
import unicodedata
from datetime import date
from io import BytesIO
from itertools import combinations

import pandas as pd

from app.services.cfdi_analysis import normalizar_fecha, parse_float
from app.services.excel_processor import _valor_json_seguro

_TOLERANCIA = 0.01


def _normalizar_nombre(texto: str) -> frozenset:
    """
    Normaliza un nombre/concepto a un conjunto de palabras (mayúsculas, sin
    acentos, sin puntuación) para poder comparar "REBECA CAMARENA MARROQUIN"
    contra "CAMARENA MARROQUIN REBECA" sin importar el orden ni la forma
    exacta en que esté escrito en cada archivo.
    """
    if not texto:
        return frozenset()
    sin_acentos = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode("ascii")
    palabras = re.findall(r"[A-Za-z]+", sin_acentos.upper())
    return frozenset(palabras)


_PALABRAS_CONECTORAS = frozenset({"DE", "DEL", "LA", "EL", "LOS", "LAS", "Y"})

# Sufijos de razón social (S.A. DE C.V., S. DE R.L., etc.) — no identifican a
# ningún emisor en particular, así que no cuentan como evidencia de que 2
# nombres son la misma empresa. "S.A DE C.V." partido por los puntos produce
# tokens de una sola letra (S, A, C, V) vía _normalizar_nombre (que separa en
# cualquier corte no alfabético) — esos también se excluyen, cualquiera que
# sea la letra, porque una sola letra nunca es evidencia real por sí sola.
_SUFIJOS_EMPRESARIALES = frozenset({"SA", "CV", "RL", "CIA", "SC", "AC", "SAB", "SAPI"})

# Palabras administrativas típicas de un auxiliar contable — no identifican a
# ningún emisor/proveedor en particular (ej. una línea de cancelación como
# "CANCELACION FACT934 MERAZ GUTIERREZ" no trae el nombre de pila, solo el
# apellido más estas palabras de relleno). Si no se quitan, inflan el tamaño
# del conjunto de palabras del renglón y hacen que falten "de más" las
# palabras reales del otro lado (ej. el nombre de pila en Amarre), superando
# la tolerancia y evitando que se reste correctamente del proveedor.
_PALABRAS_ADMINISTRATIVAS = frozenset({
    "CANCELACION", "FACTURA", "FACT", "SERVICIO", "COMPL", "CORRECCION", "CORRECC",
    "AJUSTE", "RETENCION", "RET", "ISR", "IVA", "PAGO", "SALDO", "CUENTA",
})

# Palabras genéricas de razón social — tan comunes en nombres de empresas
# mexicanas (sobre todo bancos/financieras) que no aportan evidencia real de
# que 2 nombres sean la misma entidad. Caso real: "GRUPO ECOSISTEMAS DE
# MEXICO" (3 palabras limpias: ECOSISTEMAS, MEXICO, GRUPO) hacía match con
# "...KAPITAL MEXICO GRUPO FINANCIERO" y "...GRUPO FINANCIERO SANTANDER
# MEXICO" (bancos totalmente ajenos) solo porque comparten MEXICO+GRUPO — la
# única palabra que de verdad identifica al proveedor (ECOSISTEMAS) era
# justo la que la tolerancia de "1 palabra faltante" dejaba pasar. Mismo
# mecanismo detrás de "SIGMA ALIMENTOS COMERCIAL" vs "SIGMA FOODSERVICE
# COMERCIAL" (COMERCIAL es el genérico ahí). Deliberadamente NO incluye
# términos como COMERCIALIZADORA/DISTRIBUIDORA/INDUSTRIAL/SERVICIOS: esos sí
# pueden ser la única palabra que distingue a 2 empresas reales (ej.
# "COMERCIALIZADORA GAMA" vs "DISTRIBUIDORA GAMA").
_PALABRAS_GENERICAS_EMPRESA = frozenset({
    "MEXICO", "MEXICANA", "MEXICANO", "GRUPO", "NACIONAL", "INSTITUCION",
    "BANCA", "MULTIPLE", "FINANCIERO", "SOCIEDAD", "ANONIMA", "BANCO", "COMERCIAL",
})


def _quitar_ruido(clave: frozenset) -> frozenset:
    """
    Quita conectores, sufijos de razón social, palabras administrativas,
    palabras genéricas de razón social y tokens de una sola letra de un
    conjunto de palabras ya normalizado. Sin esto, 2 empresas totalmente
    distintas que ambas terminan en "S.A. DE C.V." (la inmensa mayoría)
    comparten varios tokens "de a gratis" (S, A, DE, C, V) que, combinados
    con la tolerancia de 1 palabra faltante, las hacía "coincidir" por error
    — y lo mismo pasa con palabras genéricas como MEXICO/GRUPO/BANCO entre
    proveedores no relacionados, o con una línea de cancelación que solo
    trae el apellido + relleno administrativo. Si no queda ninguna palabra
    después de limpiar, se conserva el conjunto original (nombre degenerado
    — mejor no perder toda la evidencia).
    """
    limpio = (
        frozenset(p for p in clave if len(p) > 1)
        - _PALABRAS_CONECTORAS
        - _SUFIJOS_EMPRESARIALES
        - _PALABRAS_GENERICAS_EMPRESA
        - _PALABRAS_ADMINISTRATIVAS
    )
    return limpio or clave


def _distancia_edicion(a: str, b: str, limite: int = 2) -> int:
    """
    Distancia de Levenshtein clásica (sin librerías nuevas). `limite` acota
    el atajo de longitud: si la diferencia de largo ya supera `limite`, la
    distancia real solo puede ser igual o mayor, así que no hace falta la DP
    completa para saber que no va a calificar.
    """
    if a == b:
        return 0
    len_a, len_b = len(a), len(b)
    if abs(len_a - len_b) > limite:
        return abs(len_a - len_b)
    fila_anterior = list(range(len_b + 1))
    for i, ca in enumerate(a, start=1):
        fila_actual = [i]
        for j, cb in enumerate(b, start=1):
            costo = 0 if ca == cb else 1
            fila_actual.append(min(
                fila_anterior[j] + 1,          # borrar
                fila_actual[j - 1] + 1,        # insertar
                fila_anterior[j - 1] + costo,  # sustituir
            ))
        fila_anterior = fila_actual
    return fila_anterior[-1]


def _palabras_parecidas(a: str, b: str) -> bool:
    """
    Dos palabras "se parecen" si son idénticas, si una es abreviatura/prefijo
    exacto de la otra (ej. "COMERC" de "COMERCIALIZADORA", "DIST" de
    "DISTRIBUIDORA" — un truncamiento típico de un auxiliar contable, no un
    error de captura), o si difieren en un error de captura razonable para
    su largo (ej. "BARROSO" vs "BARROZO", 1 letra; o "MAZATLAN" vs
    "MAZATATLAN", 2 letras insertadas) — solo para palabras de al menos 4
    letras, para no confundir por accidente palabras cortas distintas.
    Palabras de 7+ letras toleran distancia de edición <= 2 (más letras, más
    margen antes de volverse ambiguo); de 4 a 6 letras, <= 1.
    """
    if a == b:
        return True
    longitud_min = min(len(a), len(b))
    if longitud_min < 4:
        return False
    if b.startswith(a) or a.startswith(b):
        return True
    limite = 2 if longitud_min >= 7 else 1
    return _distancia_edicion(a, b, limite) <= limite


def _nombres_coinciden(a: frozenset, b: frozenset) -> bool:
    """
    Dos nombres "coinciden" si (casi) todas las palabras del conjunto más
    chico aparecen en el más grande — tolera reordenado, que uno de los dos
    traiga menos palabras (nombre parcial), un error de captura de 1 letra
    por palabra, y — solo cuando el nombre más chico tiene 3 palabras o
    más — que falte hasta 1 palabra (ej. un archivo que capturó el nombre
    sin el segundo apellido). Con nombres de 1-2 palabras no se tolera
    ninguna falta, para no generar coincidencias falsas por muy poca
    evidencia.
    """
    if not a or not b:
        return False
    # Los conectores (DE/LA/DEL/...) y los sufijos de razón social (S.A. DE
    # C.V., etc. — incluidos los tokens de 1 letra que deja ese partido por
    # puntos) no cuentan como evidencia real de que 2 nombres son la misma
    # empresa/persona — se excluyen antes de comparar.
    a_sig = _quitar_ruido(a)
    b_sig = _quitar_ruido(b)
    chico, grande = (a_sig, b_sig) if len(a_sig) <= len(b_sig) else (b_sig, a_sig)
    tolerancia = 1 if len(chico) >= 3 else 0
    faltantes = 0
    for palabra in chico:
        if any(_palabras_parecidas(palabra, otra) for otra in grande):
            continue
        faltantes += 1
        if faltantes > tolerancia:
            return False
    return True


# Palabras genéricas típicas de un auxiliar contable de retenciones — no
# identifican a ningún emisor. Si después de quitarlas no queda ninguna
# palabra, el concepto no trae un nombre usable (ej. "RETENCION 1.25% ISR"
# repetido) y hay que buscar esa línea por fecha + monto en vez de por nombre.
_STOPLIST_CONCEPTO = frozenset({
    "RETENCION", "RET", "ISR", "IVA", "PAGO", "CANCELACION", "CORRECCION", "CORRECC",
    "AJUSTE", "SALDO", "CUENTA", "DE", "DEL", "LA", "EL", "Y",
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
    "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
})


def _tiene_nombre_usable(clave: frozenset) -> bool:
    return bool(clave - _STOPLIST_CONCEPTO)


def _buscar_combinacion(objetivo: float, filas_disponibles: list[dict], tol: float = _TOLERANCIA, max_elementos: int = 4) -> list[dict] | None:
    """
    Busca un subconjunto de 2 a max_elementos filas de Amarre cuya suma de
    montos calce con `objetivo` — para el caso de un Crédito del archivo que
    en realidad es la suma de varias facturas de Amarre sin nombre/fecha en
    común (el usuario trajo el ejemplo real y el algoritmo exacto a usar).
    """
    for tam in range(2, max_elementos + 1):
        for combo in combinations(filas_disponibles, tam):
            # redondear antes de comparar: sumar floats (ej. 945 + 129.63)
            # puede dar 1074.6300000000001 en vez de 1074.63 y fallar la
            # tolerancia por una fracción de centavo.
            suma = round(sum(f["monto"] for f in combo), 2)
            if round(abs(suma - objetivo), 2) <= tol:
                return list(combo)
    return None


def _fila_conciliado(tipo: str, emisor: str, factura: str, fecha_factura: str, monto_amarre: float, concepto_archivo: str, monto_archivo: float) -> dict:
    """
    Arma una fila de la hoja "Conciliado {retención}" con nombres de columna
    de exhibición (no las llaves internas de trabajo) y la columna
    Diferencia, para que la hoja se entienda sin tener que explicar qué es
    cada campo.
    """
    return {
        "Tipo": tipo,
        "Emisor": emisor,
        "Factura": factura,
        "Fecha Factura": fecha_factura,
        "Monto (Amarre)": monto_amarre,
        "Concepto (Archivo)": concepto_archivo,
        "Monto (Auxiliar de Retenciones)": monto_archivo,
        "Diferencia": round(monto_amarre - monto_archivo, 2),
    }


async def leer_archivo_retenciones(file_content: bytes) -> list[dict]:
    """
    Lee un archivo de auxiliar contable de retenciones por posición fija de
    columna (no por nombre de encabezado, igual que otros parsers de este
    repo para reportes contables con formato irregular):
      B (índice 1) = Fecha
      F (índice 5) = Número (factura)
      H (índice 7) = Concepto
      I (índice 8) = Débito
      J (índice 9) = Crédito
    Salta filas de título hasta encontrar la primera con Débito o Crédito
    numérico (no se asume una cantidad fija de filas de encabezado).
    """
    import zipfile

    try:
        df = pd.read_excel(BytesIO(file_content), header=None)
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), header=None, engine="xlrd")

    filas = []
    for _, row in df.iterrows():
        debito_raw = row.get(8)
        credito_raw = row.get(9)
        # ojo: parse_float no filtra NaN (es instancia de float), así que hay
        # que descartarlo explícitamente antes o el NaN se cuela como si
        # fuera un monto válido y corrompe cualquier suma/neto más adelante.
        debito = parse_float(debito_raw) if pd.notna(debito_raw) else None
        credito = parse_float(credito_raw) if pd.notna(credito_raw) else None
        if debito is None and credito is None:
            continue
        concepto = row.get(7)
        if pd.isna(concepto) or not str(concepto).strip():
            continue
        filas.append({
            "Fecha": _valor_json_seguro(row.get(1)),
            "Número": _valor_json_seguro(row.get(5)),
            "Concepto": str(concepto).strip(),
            "Débito": debito or 0.0,
            "Crédito": credito or 0.0,
        })
    return filas


def _fecha_factura_de(fila: dict) -> str:
    """
    Las filas de Amarre "de banco" (Ingresos sin Pago emitidos por un banco)
    no traen 'FECHA FACTURA' — ese campo solo existe en filas que sí cruzaron
    con un Pago. Para esas filas de banco, la fecha equivalente es 'Fecha
    expedición' (viene directo del CFDI de Ingresos). Sin este fallback, esas
    filas quedaban excluidas de toda conciliación por "fecha no encontrada".
    """
    return fila.get("FECHA FACTURA") or fila.get("Fecha expedición") or ""


def _dentro_del_periodo(fecha_valor, fecha_desde: date | None, fecha_hasta: date | None) -> bool:
    fecha_norm = normalizar_fecha(fecha_valor)
    if not fecha_norm:
        return False
    if fecha_desde and fecha_norm < fecha_desde.isoformat():
        return False
    if fecha_hasta and fecha_norm > fecha_hasta.isoformat():
        return False
    return True


def conciliar_retencion(
    filas_amarre: list[dict],
    filas_archivo: list[dict],
    fecha_desde: date | None,
    fecha_hasta: date | None,
    columna_amarre: str,
) -> dict:
    """
    Concilia una columna de retención de Amarre (ej. 'IVA RET 10%', 'IVA RET
    4%', 'ISR RET 10%', 'ISR RET 1.25 %') contra un archivo externo ya
    parseado por leer_archivo_retenciones. Ver conciliacion_retenciones.py
    (este módulo) y el plan de la funcionalidad para la lógica completa:
    cancelación Débito/Crédito por monto exacto (sin importar el concepto),
    emparejamiento 1 a 1 por nombre difuso + monto, emparejamiento agrupado
    (suma de varias facturas del mismo emisor), y como último recurso —para
    líneas sin nombre de emisor identificable— emparejamiento por fecha+monto.
    """
    # ── 1. Filtrar el archivo al periodo ──
    filas_archivo_periodo = [f for f in filas_archivo if _dentro_del_periodo(f["Fecha"], fecha_desde, fecha_hasta)]

    # ── 2. Cancelación global por monto: un Débito y un Crédito con el mismo
    # monto exacto son el mismo movimiento cancelándose a sí mismo, sin
    # importar si el texto del concepto coincide (ej. "FATIMA ..." en Débito
    # vs "CANCELACION FATIMA ..." en Crédito) — se netean y no participan en
    # nada más. ──
    # != 0 (no solo > 0): algunos archivos traen ajustes en Débito con signo
    # negativo (ej. -$0.07) — deben seguir reportándose como diferencia, no
    # desaparecer silenciosamente del reporte.
    debitos = [f for f in filas_archivo_periodo if f["Débito"] != 0]
    creditos = [f for f in filas_archivo_periodo if f["Crédito"] != 0]
    creditos_usados: set[int] = set()
    debitos_cancelados: set[int] = set()
    netos_a_cero = []

    for i_deb, fila_deb in enumerate(debitos):
        for i_cred, fila_cred in enumerate(creditos):
            if i_cred in creditos_usados:
                continue
            if abs(fila_deb["Débito"] - fila_cred["Crédito"]) <= _TOLERANCIA:
                creditos_usados.add(i_cred)
                debitos_cancelados.add(i_deb)
                netos_a_cero.append({
                    "concepto_debito": fila_deb["Concepto"],
                    "concepto_credito": fila_cred["Concepto"],
                    "monto": fila_cred["Crédito"],
                })
                break

    # ── 3. Lo que no se canceló se convierte en entradas individuales — ya
    # no se agrupan por concepto: agrupar destruía la posibilidad de
    # emparejar cada línea con su factura específica por fecha cuando varias
    # comparten el mismo texto genérico (ej. "RETENCION 1.25% ISR" repetido). ──
    entradas_archivo = []
    for i_deb, fila_deb in enumerate(debitos):
        if i_deb in debitos_cancelados:
            continue
        entradas_archivo.append({
            "concepto": fila_deb["Concepto"],
            "fecha": fila_deb["Fecha"],
            "clave": frozenset(),
            "tiene_nombre": False,
            "neto": -fila_deb["Débito"],
            "es_debito": True,
            "emparejado": False,
        })
    for i_cred, fila_cred in enumerate(creditos):
        if i_cred in creditos_usados:
            continue
        clave = _normalizar_nombre(fila_cred["Concepto"])
        entradas_archivo.append({
            "concepto": fila_cred["Concepto"],
            "fecha": fila_cred["Fecha"],
            "clave": clave,
            "tiene_nombre": _tiene_nombre_usable(clave),
            "neto": fila_cred["Crédito"],
            "es_debito": False,
            "emparejado": False,
        })

    # ── 2. Filtrar Amarre a columna_amarre > 0. NO se filtra por periodo: las
    # filas que llegan aquí (filas_amarre_principal + filas_amarre_banco) ya
    # vienen acotadas al mes seleccionado desde _construir_filas_amarre (por
    # fecha del Pago / Fecha expedición) — volver a filtrar aquí por FECHA
    # FACTURA es un criterio de fecha distinto e inconsistente: una factura
    # de un mes puede pagarse al siguiente y sigue apareciendo en el Amarre
    # de ese mes; filtrar por su fecha de factura la excluía por error. ──
    filas_amarre_periodo = []
    for fila in filas_amarre:
        monto = parse_float(fila.get(columna_amarre))
        if not monto or monto <= 0:
            continue
        filas_amarre_periodo.append({
            "factura": fila.get("Factura (F)", ""),
            "fecha_factura": _fecha_factura_de(fila),
            "emisor": fila.get("Emisor", ""),
            "clave": _normalizar_nombre(fila.get("Emisor", "")),
            "monto": round(monto, 2),
            "emparejado": False,
        })

    conciliados = []

    # ── 3. Pase 1: emparejamiento 1 a 1 por nombre difuso + monto exacto ──
    for entrada in entradas_archivo:
        if entrada["es_debito"] or not entrada["tiene_nombre"]:
            continue
        for fila_am in filas_amarre_periodo:
            if fila_am["emparejado"]:
                continue
            if not _nombres_coinciden(entrada["clave"], fila_am["clave"]):
                continue
            if abs(fila_am["monto"] - entrada["neto"]) <= _TOLERANCIA:
                fila_am["emparejado"] = True
                entrada["emparejado"] = True
                conciliados.append(_fila_conciliado(
                    "1 a 1", fila_am["emisor"], fila_am["factura"], fila_am["fecha_factura"],
                    fila_am["monto"], entrada["concepto"], entrada["neto"],
                ))
                break

    # ── 4. Pase 2: emparejamiento agrupado (suma de facturas del mismo emisor) ──
    pendientes_amarre = [f for f in filas_amarre_periodo if not f["emparejado"]]
    grupos_por_emisor: dict[frozenset, list[dict]] = {}
    for fila_am in pendientes_amarre:
        grupos_por_emisor.setdefault(fila_am["clave"], []).append(fila_am)

    for entrada in entradas_archivo:
        if entrada["emparejado"] or entrada["es_debito"] or not entrada["tiene_nombre"]:
            continue
        for clave_emisor, filas_grupo in grupos_por_emisor.items():
            filas_sin_emparejar = [f for f in filas_grupo if not f["emparejado"]]
            if not filas_sin_emparejar:
                continue
            if not _nombres_coinciden(entrada["clave"], clave_emisor):
                continue
            suma = round(sum(f["monto"] for f in filas_sin_emparejar), 2)
            if abs(suma - entrada["neto"]) <= _TOLERANCIA:
                for f in filas_sin_emparejar:
                    f["emparejado"] = True
                entrada["emparejado"] = True
                conciliados.append(_fila_conciliado(
                    "agrupado", filas_sin_emparejar[0]["emisor"],
                    ", ".join(f["factura"] for f in filas_sin_emparejar),
                    ", ".join(f["fecha_factura"] for f in filas_sin_emparejar),
                    suma, entrada["concepto"], entrada["neto"],
                ))
                break

    # ── 5. Pase 3: para créditos SIN nombre usable (ej. "RETENCION 1.25%
    # ISR" repetido sin ningún nombre de emisor), buscar en Amarre por
    # FECHA + MONTO exactos en vez de por nombre. ──
    for entrada in entradas_archivo:
        if entrada["emparejado"] or entrada["es_debito"] or entrada["tiene_nombre"]:
            continue
        fecha_entrada = normalizar_fecha(entrada["fecha"])
        if not fecha_entrada:
            continue
        for fila_am in filas_amarre_periodo:
            if fila_am["emparejado"]:
                continue
            if normalizar_fecha(fila_am["fecha_factura"]) != fecha_entrada:
                continue
            if abs(fila_am["monto"] - entrada["neto"]) <= _TOLERANCIA:
                fila_am["emparejado"] = True
                entrada["emparejado"] = True
                conciliados.append(_fila_conciliado(
                    "fecha+monto", fila_am["emisor"], fila_am["factura"], fila_am["fecha_factura"],
                    fila_am["monto"], entrada["concepto"], entrada["neto"],
                ))
                break

    # ── Pase 4: combinaciones — un Crédito puede ser la SUMA de varias
    # facturas de Amarre — pero SOLO entre facturas de la MISMA fecha que el
    # renglón del archivo (confirmado con datos reales: las combinaciones que
    # sí son válidas comparten fecha exacta, ej. 945+129.63 ambas del mismo
    # día). Sin esta restricción, con muchas facturas chicas en el mes es
    # fácil que 2-3 montos sin ninguna relación real sumen por casualidad el
    # objetivo — se probó contra Amarre real y pasó exactamente eso. Va al
    # final por ser el método menos específico de todos los pases. ──
    pendientes_amarre = [f for f in filas_amarre_periodo if not f["emparejado"]]
    entradas_pendientes = sorted(
        (e for e in entradas_archivo if not e["emparejado"] and not e["es_debito"]),
        key=lambda e: e["neto"],
        reverse=True,
    )
    for entrada in entradas_pendientes:
        fecha_entrada = normalizar_fecha(entrada["fecha"])
        if not fecha_entrada:
            continue
        disponibles = [
            f for f in pendientes_amarre
            if not f["emparejado"] and normalizar_fecha(f["fecha_factura"]) == fecha_entrada
        ]
        if len(disponibles) > 60:  # resguardo: evitar explosión combinatoria
            continue
        combo = _buscar_combinacion(entrada["neto"], disponibles)
        if combo:
            for f in combo:
                f["emparejado"] = True
            entrada["emparejado"] = True
            conciliados.append(_fila_conciliado(
                "combinación", ", ".join(sorted({f["emisor"] for f in combo})),
                ", ".join(f["factura"] for f in combo), ", ".join(f["fecha_factura"] for f in combo),
                round(sum(f["monto"] for f in combo), 2), entrada["concepto"], entrada["neto"],
            ))

    # ── 6. Lo que sigue sin emparejar son las diferencias ──
    diferencias_amarre = [
        {
            "emisor": f["emisor"],
            "factura": f["factura"],
            "fecha_factura": f["fecha_factura"],
            "monto": f["monto"],
            "motivo": "No se encontró en el archivo de retenciones",
        }
        for f in filas_amarre_periodo
        if not f["emparejado"]
    ]

    diferencias_archivo = []
    for entrada in entradas_archivo:
        if entrada["emparejado"]:
            continue
        if entrada["es_debito"]:
            motivo = "Pago en débito, no es una factura — revisar a qué corresponde"
        elif not entrada["tiene_nombre"]:
            motivo = "Sin nombre de emisor en el concepto — no se encontró ninguna factura con esa misma fecha y monto en Amarre"
        else:
            motivo = "No se encontró en Amarre ninguna factura que corresponda a este concepto"
        diferencias_archivo.append({
            "concepto": entrada["concepto"],
            "monto": entrada["neto"],
            "motivo": motivo,
        })

    return {
        "conciliados": conciliados,
        "diferencias_amarre": diferencias_amarre,
        "diferencias_archivo": diferencias_archivo,
        "detalle_amarre": filas_amarre_periodo,
        "detalle_archivo": filas_archivo_periodo,
        "netos_a_cero": netos_a_cero,
        # Totales para la hoja resumen "Diferencia de Retenciones": el total
        # de Amarre ya incluye TODAS las facturas del periodo (emparejadas o
        # no), y el del archivo es la suma de los créditos netos (después de
        # cancelaciones débito/crédito) — sin importar si cada uno encontró
        # pareja o no, es la comparación de los 2 totales completos.
        "total_amarre": round(sum(f["monto"] for f in filas_amarre_periodo), 2),
        "total_archivo": round(sum(e["neto"] for e in entradas_archivo if not e["es_debito"]), 2),
    }


def _agrupar_por_nombre_difuso(items: list[tuple[str, float]]) -> list[dict]:
    return [
        {"clave": g["clave"], "nombre": g["nombre"], "monto": g["monto"]}
        for g in _agrupar_con_indices(items)
    ]


def _agrupar_con_indices(items: list[tuple[str, float]]) -> list[dict]:
    """
    Agrupa pares (nombre, monto) por coincidencia DIFUSA de nombre (no por
    texto exacto) — si un nombre nuevo coincide difusamente con un grupo ya
    existente, se suma ahí (aunque el texto no sea idéntico, ej. "ABARROTERA
    DEL DUERO" vs "ABARROTERA DEL DUERO SA DE CV"); si no coincide con
    ninguno, se crea un grupo nuevo. Sin esto, el mismo proveedor real con 2
    formas de escritura ligeramente distintas dentro del MISMO archivo se
    partía en 2 totales separados en vez de sumarse junto.

    Cada renglón nuevo se compara SIEMPRE contra la clave del renglón que
    fundó el grupo (nunca se actualiza) — NO se une/acumula la clave en cada
    fusión. Acumular permitía una "fusión en cadena": el renglón A funde con
    B por compartir 2 de 3 palabras, y luego C funde con el grupo A+B porque
    ya acumuló más palabras de las que tenía A solo, aunque A y C nunca
    hubieran hecho match directo entre sí — terminaba fusionando proveedores
    no relacionados y sumando sus montos por error (caso real: DEREMATE.COM
    DE MEXICO arrastrando montos de otro proveedor).

    Devuelve los grupos en el orden en que aparecieron por primera vez (no
    ordenados por monto ni alfabéticamente) — necesario para poder dejar la
    hoja de salida en el mismo orden que Amarre.
    """
    grupos: list[dict] = []
    for posicion, (nombre, monto) in enumerate(items):
        clave = _normalizar_nombre(nombre)
        grupo_existente = None
        for grupo in grupos:
            if _nombres_coinciden(clave, grupo["clave"]):
                grupo_existente = grupo
                break
        if grupo_existente:
            grupo_existente["monto"] += monto
            grupo_existente["indices"].append(posicion)
        else:
            grupos.append({"clave": clave, "nombre": nombre, "monto": monto, "indices": [posicion]})
    return grupos


def conciliar_iva_acreditable(
    filas_amarre: list[dict],
    filas_archivo: list[dict],
    fecha_desde: date | None,
    fecha_hasta: date | None,
) -> dict:
    """
    Compara el Traslado IVA MXN de Amarre (agrupado por proveedor) contra el
    IVA acreditable de un archivo externo ya parseado por
    leer_archivo_retenciones (mismo formato Fecha/Concepto/Débito). A
    diferencia de conciliar_retencion, aquí NO hay fecha comparable entre
    ambos archivos para emparejar 1 a 1 (confirmado con el usuario) — sí se
    filtra cada lado al mismo periodo fecha_desde/fecha_hasta — y el cruce es
    por PROVEEDOR completo, no por factura individual: se suma todo el
    Traslado IVA MXN de cada emisor en Amarre (agrupando también por nombre
    difuso dentro del propio Amarre, por si el mismo proveedor trae más de
    una forma de escritura) y se compara contra la suma de Débito de ese
    mismo proveedor en el archivo.

    Devuelve un dict con:
    - "comparacion": una fila por cada proveedor que aparezca en cualquiera
      de los 2 lados, en el mismo orden en que aparecen en Amarre (los que
      solo existen en el archivo van al final) — no clasifica en
      "conciliado/diferencia", es una tabla comparativa (las diferencias de
      centavos son esperadas, no un error).
    - "detalle_archivo": las filas del archivo subido ya filtradas al mismo
      periodo (todas sus columnas originales), para que el usuario pueda
      verificar la comparación contra el archivo de origen.
    """
    # ── 1. Amarre: filtrar a Traslado IVA MXN > 0. NO se filtra por periodo:
    # las filas que llegan aquí ya vienen acotadas al mes seleccionado desde
    # _construir_filas_amarre (por fecha del Pago / Fecha expedición) —
    # volver a filtrar por FECHA FACTURA es un criterio de fecha distinto e
    # inconsistente (una factura de un mes puede pagarse al siguiente y
    # sigue apareciendo en el Amarre de ese mes; filtrar por su fecha de
    # factura la excluía por error). ──
    items_amarre = []
    indices_filas_amarre = []
    for indice_fila, fila in enumerate(filas_amarre):
        monto = parse_float(fila.get("Traslado IVA MXN"))
        if not monto or monto <= 0:
            continue
        items_amarre.append((fila.get("Emisor", ""), monto))
        indices_filas_amarre.append(indice_fila)
    grupos_amarre = _agrupar_con_indices(items_amarre)

    # ── 2. Archivo: filtrar al mismo periodo que Amarre (el usuario sube el
    # auxiliar completo del año, hay que acotarlo al mes seleccionado — sus
    # fechas no sirven para emparejar 1 a 1 contra una factura, pero sí para
    # restringir al periodo correcto). filas_archivo_periodo se conserva tal
    # cual (todas las columnas) para que el usuario pueda verificar contra
    # el origen; items_archivo es lo que se suma por proveedor: cada fila
    # aporta su NETO (Débito - Crédito), no solo el Débito — un Crédito
    # representa una corrección/cancelación de una compra anterior del mismo
    # proveedor (mismo criterio que en conciliar_retencion) y debe restarse,
    # no ignorarse. No hace falta el emparejamiento exacto Débito/Crédito por
    # monto que usan las retenciones (ese existe para reconstruir qué
    # factura puntual se canceló); aquí solo se comparan TOTALES por
    # proveedor, así que basta con sumar el neto de cada fila ya agrupada. ──
    filas_archivo_periodo = [f for f in filas_archivo if _dentro_del_periodo(f.get("Fecha"), fecha_desde, fecha_hasta)]
    items_archivo = []
    for fila in filas_archivo_periodo:
        debito = fila.get("Débito") or 0.0
        credito = fila.get("Crédito") or 0.0
        neto = debito - credito
        if neto == 0:
            continue
        items_archivo.append((fila.get("Concepto", ""), neto, _normalizar_nombre(fila.get("Concepto", ""))))

    # ── 3. Sumar el archivo DIRECTAMENTE contra cada grupo de Amarre, sin
    # pre-agrupar el archivo entre sí. Agrupar el archivo de forma
    # independiente (como se hacía antes) permite una "fusión en cadena":
    # el renglón A funde con B por compartir 2 de 3 palabras, luego C funde
    # con el grupo A+B porque ya acumuló más palabras — aunque A y C nunca
    # habrían hecho match directo entre sí. Comparando cada renglón de
    # archivo contra la clave FIJA de cada grupo de Amarre (que no se toca
    # aquí) se elimina ese riesgo de fusión transitiva. Cada renglón de
    # archivo se reclama una sola vez (por el primer grupo de Amarre que
    # matchee, en su orden de aparición) para no contarlo doble. ──
    archivo_usado = [False] * len(items_archivo)
    filas_comparacion = []
    for grupo_amarre in grupos_amarre:
        monto_archivo = 0.0
        for i, (_concepto, neto, clave_item) in enumerate(items_archivo):
            if archivo_usado[i]:
                continue
            if _nombres_coinciden(grupo_amarre["clave"], clave_item):
                archivo_usado[i] = True
                monto_archivo += neto
        monto_amarre = round(grupo_amarre["monto"], 2)
        monto_archivo = round(monto_archivo, 2)
        filas_comparacion.append({
            "emisor": grupo_amarre["nombre"],
            "traslado_iva_amarre": monto_amarre,
            "iva_acreditable_archivo": monto_archivo,
            "diferencia": round(monto_amarre - monto_archivo, 2),
            "filas_amarre_idx": [indices_filas_amarre[p] for p in grupo_amarre["indices"]],
        })

    # ── 4. Proveedores que solo existen en el archivo (no en Amarre): los
    # renglones no reclamados por ningún grupo de Amarre sí se agrupan entre
    # sí aquí, ya que solo afecta estas filas finales "solo en archivo", no
    # el total comparado contra Amarre. ──
    items_sin_reclamar = [
        (concepto, neto) for i, (concepto, neto, _clave) in enumerate(items_archivo) if not archivo_usado[i]
    ]
    grupos_archivo_restantes = _agrupar_por_nombre_difuso(items_sin_reclamar)
    for grupo_archivo in grupos_archivo_restantes:
        monto_archivo = round(grupo_archivo["monto"], 2)
        filas_comparacion.append({
            "emisor": grupo_archivo["nombre"],
            "traslado_iva_amarre": 0.0,
            "iva_acreditable_archivo": monto_archivo,
            "diferencia": round(0.0 - monto_archivo, 2),
            "filas_amarre_idx": [],
        })

    return {
        "comparacion": filas_comparacion,
        "detalle_archivo": filas_archivo_periodo,
    }
