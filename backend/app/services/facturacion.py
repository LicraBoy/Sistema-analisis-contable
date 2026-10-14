"""
Servicio de Facturación — combina "Formas de Pago" y "Recibos Emitidos" por
Recibo/Cuenta, y opcionalmente enriquece el resultado con "Movimientos por
Periodo". Módulo independiente del flujo de Ingresos/Pagos/Conciliación: no
lee ni escribe la base de datos, solo transforma DataFrames.
"""

import re
import unicodedata
from io import BytesIO
from pathlib import Path
from typing import Literal

import pandas as pd

from app.core.config import settings
from app.services.cfdi_analysis import parse_float
from app.services.excel_processor import _calcular_valores_hacienda

COLUMNAS_DATOS_COMBINADOS = [
    "Fecha_x", "POS_x", "Forma de Pago", "Tipo", "Recibo", "Subtotal",
    "Descuento", "Tax", "Room Serv.", "Servicio", "Propina", "TOTAL",
    "Subtotal Tipo Producto", "Segmento", "Clientes", "PAGO",
]

COLUMNAS_FORMULA_HACIENDA = [
    "Cálculo Hacienda", "INGTASA 0 p2", "Subtotal Tienda", "Desfiltro", "suma",
]

COLUMNAS_SEGUNDA_LIMPIEZA = [
    "Fecha", "POS", "FORMA DE PAGO", "Tipo", "Segmento", "Cuenta",
    "Subtotal", "Descuento", "GRAVADO", "INGTASA 0", "DESC TASA 0",
    "SUBTASA 0", "Iva", "Propina", "PAGO PROVEDOR", "TOTAL",
]

# Columna de Segunda_Limpieza -> columna equivalente en Datos_Combinados,
# solo para las columnas que son copia directa (no fórmula, no constante 0).
MAPEO_SEGUNDA_LIMPIEZA = {
    "Fecha": "Fecha_x",
    "POS": "POS_x",
    "FORMA DE PAGO": "Forma de Pago",
    "Tipo": "Tipo",
    "Segmento": "Segmento",
    "Cuenta": "Recibo",
    "Subtotal": "Subtotal",
    "Descuento": "Descuento",
    "Iva": "Tax",
    "Propina": "Propina",
    "TOTAL": "TOTAL",
}

POS_LA_HACIENDA = "LA HACIENDA"
POS_AGENCIA_DE_VIAJES = "AGENCIA DE VIAJES"

# POS que, a diferencia de LA HACIENDA, no manejan "Tasa 0" — en cuentas con
# forma de pago mixta no necesitan la regla de pool ancla/vaciada, solo un
# reparto simple por fila (ver corregir_total_subtotal_pago_mixto).
POS_TASA_NORMAL_PAGO_MIXTO = ("CAFETERIA LAPA LAPA", "RESTAURANT LA PALAPA", "LA CARRETA MARISCOS")

# En el Excel real de Formas de Pago, el Recibo viene en la columna C (3ra
# columna) sin importar cómo esté rotulado su encabezado (p. ej. "Voucher")
# — se toma por posición, no por nombre, igual que el resto de la app trata
# los Excel de Pagos/Ingresos por columnas fijas.
COL_RECIBO_FORMAS_PAGO = 2  # índice 0-based de la columna C

SEGMENTO_FUNCIONARIOS = "FUNCIONARIOS&EMPLEA"
SEGMENTO_TUSOSA = "TUSOSA"
FORMA_PAGO_AMEX = "AMERICAN EXPRESS"
SEGMENTO_CORTESIA = "CORTESIA"

# Palabra clave -> segmento canónico, usada para detectar filas de título de
# sección en Movimientos por Periodo (case-insensitive, substring). "AMERICAN"
# cubre tanto "AMERICAN EXPRESS" como la variante "AMERICAN XPRESS".
_PALABRAS_CLAVE_SEGMENTO = [
    ("FUNCIONARIOS", SEGMENTO_FUNCIONARIOS),
    ("TUSOSA", SEGMENTO_TUSOSA),
    ("AMERICAN", FORMA_PAGO_AMEX),
]

_PATRON_CUENTA = re.compile(r"cuenta\s*:\s*(\d+)", re.IGNORECASE)


def _normalizar_clave_recibo(serie: pd.Series) -> pd.Series:
    """
    Normaliza un valor de Recibo/Cuenta para el cruce: quita espacios y, si
    pandas leyó la columna como numérica (ej. "449425.0" por una celda vacía
    en la columna), quita el ".0" final para que calce con el valor de texto
    plano del otro archivo.
    """
    texto = serie.astype(str).str.strip()
    return texto.str.replace(r"\.0$", "", regex=True)


def _deduplicar_formas_pago(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cuando 2+ filas de Formas de Pago comparten el mismo Recibo Y la misma
    Forma de Pago (ej. dos cargos VISA para la misma cuenta), son un
    duplicado de facturación — no se puede facturar dos veces con el mismo
    método de pago para la misma cuenta — así que se conserva solo la
    primera fila y se descartan las demás (su Total Cuenta ya es el mismo
    en todas, así que no se pierde información al quedarse con una sola).
    Si el Recibo se repite pero con Forma de Pago DISTINTA entre las filas
    (pago dividido entre métodos, ej. VISA + Efectivo), todas se conservan.
    """
    if "Recibo" not in df.columns or "Forma de Pago" not in df.columns:
        return df

    clave_recibo = _normalizar_clave_recibo(df["Recibo"])
    clave_forma_pago = df["Forma de Pago"].astype(str).str.strip().str.upper()
    clave_duplicado = clave_recibo + "|" + clave_forma_pago

    return df[~clave_duplicado.duplicated(keep="first")].copy()


def _forzar_propina_cero_efectivo(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cualquier fila cuya Forma de Pago sea "Efectivo" no debe llevar Propina
    — se fuerza a 0, sin importar si tiene un Recibo duplicado o no.
    """
    if "Forma de Pago" not in df.columns or "Propina" not in df.columns:
        return df

    df = df.copy()
    es_efectivo = df["Forma de Pago"].astype(str).str.strip().str.upper() == "EFECTIVO"
    df.loc[es_efectivo, "Propina"] = 0
    return df


def _limpiar_recibos_emitidos(df: pd.DataFrame) -> pd.DataFrame:
    """
    Recibos Emitidos no es una tabla plana de una fila por transacción: cada
    transacción real trae Cuenta con formato "<Recibo>/<código>" (ej.
    "449425/RIGO"), pero va seguida de filas de desglose por categoría
    (ALIMENTOS/BEBIDAS/OTROS) que solo traen Tipo y un monto, con Cuenta y
    el resto de columnas en blanco. Esas filas de desglose no son
    transacciones cruzables por Recibo — si no se filtran, el outer join
    las deja como filas "huérfanas" (Recibo vacío) que ensucian el
    resultado combinado. Se identifican por NO tener "/" en Cuenta, lo que
    de paso también filtra cualquier fila de encabezado repetida que se
    hubiera colado como dato.
    """
    if "Cuenta" not in df.columns:
        return df
    tiene_formato_cuenta = df["Cuenta"].astype(str).str.contains("/", na=False)
    return df[tiene_formato_cuenta].copy()


async def leer_excel_facturacion(file_content: bytes) -> pd.DataFrame:
    """
    Leer un archivo Excel de Facturación (Formas de Pago o Recibos Emitidos):
    lector genérico de la primera hoja, con fallback a xlrd para .xls.
    """
    import zipfile

    try:
        df = pd.read_excel(BytesIO(file_content))
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), engine="xlrd")
    return df


def combinar_formas_pago_y_recibos_completo(
    df_formas_pago: pd.DataFrame,
    df_recibos_emitidos: pd.DataFrame,
) -> pd.DataFrame:
    """
    Mismo preprocesamiento y merge que combinar_formas_pago_y_recibos (rename
    de Recibo, deduplicación, Propina=0 en Efectivo, normalización de claves)
    pero SIN recortar a COLUMNAS_DATOS_COMBINADOS — devuelve todas las
    columnas de ambos archivos. Para el reporte final se usa
    combinar_formas_pago_y_recibos (que llama a esta y recorta); esta versión
    completa es para casos como la vista previa de duplicados, donde se
    necesita ver toda la información original de ambos Excel.
    """
    df_formas_pago = df_formas_pago.copy()
    df_recibos_emitidos = df_recibos_emitidos.copy()

    df_formas_pago.columns = df_formas_pago.columns.astype(str).str.strip()
    df_recibos_emitidos.columns = df_recibos_emitidos.columns.astype(str).str.strip()

    if df_formas_pago.shape[1] <= COL_RECIBO_FORMAS_PAGO:
        raise ValueError(
            "El archivo de Formas de Pago no tiene suficientes columnas "
            "(se espera el Recibo en la columna C)."
        )
    df_formas_pago = df_formas_pago.rename(
        columns={df_formas_pago.columns[COL_RECIBO_FORMAS_PAGO]: "Recibo"}
    )
    df_formas_pago = _deduplicar_formas_pago(df_formas_pago)
    df_formas_pago = _forzar_propina_cero_efectivo(df_formas_pago)

    if "Cuenta" not in df_recibos_emitidos.columns:
        raise ValueError("El archivo de Recibos Emitidos no contiene la columna 'Cuenta'.")

    df_formas_pago["Recibo"] = _normalizar_clave_recibo(df_formas_pago["Recibo"])
    df_recibos_emitidos["Cuenta"] = df_recibos_emitidos["Cuenta"].astype(str).str.strip()
    df_recibos_emitidos = _limpiar_recibos_emitidos(df_recibos_emitidos)
    df_recibos_emitidos["Recibo"] = _normalizar_clave_recibo(
        df_recibos_emitidos["Cuenta"].str.split("/").str[0]
    )

    return pd.merge(df_formas_pago, df_recibos_emitidos, on="Recibo", how="outer")


def combinar_formas_pago_y_recibos(
    df_formas_pago: pd.DataFrame,
    df_recibos_emitidos: pd.DataFrame,
) -> pd.DataFrame:
    """
    Combina Formas de Pago y Recibos Emitidos por Recibo (outer join) y filtra
    a COLUMNAS_DATOS_COMBINADOS (solo las que existan, preservando el orden).
    """
    resultado = combinar_formas_pago_y_recibos_completo(df_formas_pago, df_recibos_emitidos)

    columnas_existentes = [c for c in COLUMNAS_DATOS_COMBINADOS if c in resultado.columns]
    if not columnas_existentes:
        raise ValueError(
            "No se encontró ninguna de las columnas esperadas en los archivos combinados."
        )

    return resultado[columnas_existentes].copy()


def detectar_duplicados_forma_pago_mixta(df_combinado: pd.DataFrame) -> pd.DataFrame:
    """
    Filtra a las filas cuyo Recibo se repite en el archivo combinado con
    Forma de Pago DISTINTA entre ellas (pago dividido entre métodos, ej.
    VISA+Efectivo) — para que el usuario las revise antes de decidir qué
    hacer con cada grupo. Las de Recibo+Forma de Pago repetidos ya se
    resolvieron dentro de combinar_formas_pago_y_recibos (_deduplicar_formas_pago),
    así que cualquier grupo con más de 1 fila que llegue aquí es, por
    construcción, de forma de pago mixta. Se excluyen las filas sin Cuenta
    (huérfanas del outer join, sin contraparte en Recibos Emitidos) —
    espera recibir el resultado de combinar_formas_pago_y_recibos_completo,
    con todas las columnas de ambos archivos.
    """
    if "Recibo" not in df_combinado.columns or "Forma de Pago" not in df_combinado.columns:
        return df_combinado.iloc[0:0].copy()

    clave_recibo = _normalizar_clave_recibo(df_combinado["Recibo"])
    conteo = clave_recibo.groupby(clave_recibo).transform("count")

    if "Cuenta" in df_combinado.columns:
        tiene_cuenta = df_combinado["Cuenta"].notna() & (df_combinado["Cuenta"].astype(str).str.strip() != "")
    else:
        tiene_cuenta = pd.Series(True, index=df_combinado.index)

    return df_combinado[(conteo > 1) & tiene_cuenta].copy()


def detectar_duplicados_segunda_limpieza(df_segunda_limpieza: pd.DataFrame) -> pd.DataFrame:
    """
    Igual que detectar_duplicados_forma_pago_mixta pero opera sobre las
    columnas ya remapeadas de Segunda_Limpieza ('Cuenta' en vez de 'Recibo',
    'FORMA DE PAGO' en mayúsculas) — para la vista editable de duplicados,
    que necesita mostrar Segmento/GRAVADO/INGTASA 0/etc., no las columnas de
    Datos_Combinados. Excluye filas sin contraparte en Recibos Emitidos
    usando 'Tipo' (columna exclusiva de Recibos Emitidos) como señal de que
    sí hubo cruce.
    """
    if "Cuenta" not in df_segunda_limpieza.columns or "FORMA DE PAGO" not in df_segunda_limpieza.columns:
        return df_segunda_limpieza.iloc[0:0].copy()

    clave_recibo = _normalizar_clave_recibo(df_segunda_limpieza["Cuenta"])
    conteo = clave_recibo.groupby(clave_recibo).transform("count")

    if "Tipo" in df_segunda_limpieza.columns:
        tiene_match = df_segunda_limpieza["Tipo"].notna() & (df_segunda_limpieza["Tipo"].astype(str).str.strip() != "")
    else:
        tiene_match = pd.Series(True, index=df_segunda_limpieza.index)

    return df_segunda_limpieza[(conteo > 1) & tiene_match].copy()


def detectar_filas_revision_segunda_limpieza(df_segunda_limpieza: pd.DataFrame) -> pd.DataFrame:
    """
    Filas a mostrar en la tabla editable "Cuentas duplicadas con forma de
    pago mixta" de /duplicados-preview: la unión de (a) cuentas con forma de
    pago mixta (detectar_duplicados_segunda_limpieza) y (b) TODAS las
    cuentas de POS == AGENCIA DE VIAJES, sean o no duplicadas — a pedido del
    usuario, para poder revisar/editar esas cuentas ahí también, aunque no
    tengan pago dividido. Solo afecta esta vista previa/edición: NO se usa
    para corregir_total_subtotal_pago_mixto (la corrección ancla/vaciada
    sigue aplicando solo a pago mixto real) ni para la columna "Revisión" de
    Tablas_Forma_Pago (que sigue marcando solo pago mixto real).
    """
    duplicados = detectar_duplicados_segunda_limpieza(df_segunda_limpieza)

    if "POS" in df_segunda_limpieza.columns:
        es_agencia = df_segunda_limpieza["POS"].astype(str).str.strip().str.upper() == POS_AGENCIA_DE_VIAJES
        indices_agencia = df_segunda_limpieza.index[es_agencia]
    else:
        indices_agencia = df_segunda_limpieza.index[0:0]

    indices_final = duplicados.index.union(indices_agencia)
    return df_segunda_limpieza.loc[indices_final].sort_index()


def clave_fila_segunda_limpieza(df_segunda_limpieza: pd.DataFrame) -> pd.Series:
    """
    Clave estable por fila (Cuenta + FORMA DE PAGO normalizados) usada para
    identificar una fila de Segunda_Limpieza entre la vista previa de
    duplicados (donde el usuario la edita) y la generación final del
    reporte (donde esas ediciones se aplican) — ambas parten de los mismos
    2-3 archivos, así que la clave es estable entre una llamada y otra.
    """
    return (
        _normalizar_clave_recibo(df_segunda_limpieza["Cuenta"])
        + "|"
        + df_segunda_limpieza["FORMA DE PAGO"].astype(str).str.strip().str.upper()
    )


def aplicar_ediciones_segunda_limpieza(
    df_segunda_limpieza: pd.DataFrame,
    ediciones: list[dict],
) -> pd.DataFrame:
    """
    Aplica ediciones manuales hechas por el usuario en la vista de "Cuentas
    duplicadas con forma de pago mixta" sobre Segunda_Limpieza. Cada
    edición trae "clave" (ver clave_fila_segunda_limpieza, calculada con los
    valores ORIGINALES de la fila tal como se mostraron en la vista previa)
    y "cambios" (columna -> nuevo valor) a aplicar sobre esa fila. Como
    Tablas_Forma_Pago se construye a partir de este mismo DataFrame ya
    editado, los cambios se propagan automáticamente a ambas hojas del
    reporte final.
    """
    if not ediciones:
        return df_segunda_limpieza

    df = df_segunda_limpieza.copy()
    clave_actual = clave_fila_segunda_limpieza(df)

    for edicion in ediciones:
        clave = str(edicion.get("clave", "")).strip()
        cambios = edicion.get("cambios") or {}
        if not clave or not cambios:
            continue
        for idx in df.index[clave_actual == clave]:
            for columna, valor in cambios.items():
                if columna in df.columns:
                    df.at[idx, columna] = valor

    return df


def celdas_editadas_segunda_limpieza(
    df_segunda_limpieza: pd.DataFrame,
    ediciones: list[dict],
) -> dict:
    """
    Calcula, ANTES de aplicar las ediciones (usa la misma clave "pre-edición"
    que aplicar_ediciones_segunda_limpieza), qué columnas quedaron editadas
    manualmente por fila: {índice de fila: {"Subtotal", "INGTASA 0", ...}}.
    generar_reporte_facturacion_excel usa esto para saber qué celdas debe
    respetar tal cual en vez de recalcular con las fórmulas/reglas de
    Hacienda (INGTASA 0 / DESC TASA 0 / SUBTASA 0 se recalculan siempre desde
    cero al generar el Excel, así que sin esta señal cualquier edición manual
    a esas 3 columnas se perdía silenciosamente).
    """
    resultado: dict = {}
    if not ediciones:
        return resultado

    clave_actual = clave_fila_segunda_limpieza(df_segunda_limpieza)
    for edicion in ediciones:
        clave = str(edicion.get("clave", "")).strip()
        cambios = edicion.get("cambios") or {}
        if not clave or not cambios:
            continue
        for idx in df_segunda_limpieza.index[clave_actual == clave]:
            resultado.setdefault(idx, set()).update(cambios.keys())

    return resultado


def _a_flotante(valor) -> float:
    try:
        if valor is None or (isinstance(valor, float) and pd.isna(valor)):
            return 0.0
        return float(valor)
    except (TypeError, ValueError):
        return 0.0


def corregir_total_subtotal_pago_mixto(
    df_segunda_limpieza: pd.DataFrame,
    df_datos_combinados: pd.DataFrame,
) -> tuple[pd.DataFrame, dict]:
    """
    Corrige TOTAL (todas las filas) y, para filas POS == LA HACIENDA o de
    POS_TASA_NORMAL_PAGO_MIXTO, también Subtotal/Descuento/Iva/INGTASA 0/
    DESC TASA 0/SUBTASA 0, en las cuentas con forma de pago mixta (ej.
    EFECTIVO+VISA para la misma Cuenta). Por defecto esas columnas se
    copian/calculan sobre el recibo COMPLETO (duplicado en cada fila del
    pago dividido), así que sumarlas entre las filas duplica el ingreso.

    TOTAL siempre se reemplaza por 'PAGO' de Formas de Pago (el monto
    realmente pagado por esa fila/método), para cualquier POS.

    Para POS_TASA_NORMAL_PAGO_MIXTO (puntos de venta que, a diferencia de
    Hacienda, no manejan "Tasa 0"): reparto simple por fila, sin pool
    ancla/vaciada — cada fila calcula su propio Subtotal/Iva a partir de su
    propio PAGO: Subtotal = PAGO / 1.16, Iva = Subtotal * 0.16. INGTASA 0/
    DESC TASA 0/SUBTASA 0 no aplican a estos POS y quedan en su valor por
    defecto (0).

    Para un grupo de 2+ filas POS == LA HACIENDA de la misma Cuenta, se
    replica a mano la regla que ya usa el equipo de contabilidad: se calcula
    una sola vez el INGTASA 0 / DESC TASA 0 / Subtotal Tienda "del recibo
    completo" (misma fórmula de Hacienda que ya usa Datos_Combinados), y se
    reparte así:
    - La fila EFECTIVO (si la hay en el grupo; si no, la de menor TOTAL) se
      "vacía": Subtotal=0, Descuento=0, Iva=0, INGTASA 0 = su propio TOTAL
      (tope: lo que quede del "pool" de INGTASA 0 de la cuenta), DESC TASA 0=0.
      Si hay más de una fila así, se procesan de menor a mayor TOTAL.
    - La fila restante de mayor TOTAL (la "ancla" — nunca Efectivo si hay
      alguna otra opción) se queda con el Subtotal/Descuento/Iva ORIGINALES
      del recibo completo (sin dividir) y con el INGTASA 0/DESC TASA 0 que
      sobra del pool después de repartir a las demás filas.
    Así, sumando Subtotal/Descuento/Iva/INGTASA 0/DESC TASA 0 entre todas
    las filas del grupo se sigue obteniendo el mismo resultado que el
    cálculo de la cuenta completa (antes de dividirla). No-op sobre estas 6
    columnas si el grupo tiene menos de 2 filas LA HACIENDA con PAGO válido;
    TOTAL sigue corrigiéndose igual para cualquier otra fila del grupo.

    No-op por completo si el archivo de Formas de Pago no trae la columna
    'PAGO'. Devuelve (df_corregido, celdas_corregidas) —
    celdas_corregidas es {índice de fila: {columnas...}} para que
    generar_reporte_facturacion_excel sepa qué celdas debe respetar tal cual
    (mismo mecanismo que una edición manual, para que esta corrección gane
    también sobre las fórmulas de Hacienda en filas LA HACIENDA).
    """
    if "PAGO" not in df_datos_combinados.columns:
        return df_segunda_limpieza, {}

    df_duplicados = detectar_duplicados_segunda_limpieza(df_segunda_limpieza)
    if df_duplicados.empty:
        return df_segunda_limpieza, {}

    df = df_segunda_limpieza.copy()
    pago = pd.to_numeric(df_datos_combinados["PAGO"], errors="coerce")
    subtotal_dc = df_datos_combinados["Subtotal"] if "Subtotal" in df_datos_combinados.columns else None
    descuento_dc = df_datos_combinados["Descuento"] if "Descuento" in df_datos_combinados.columns else None
    tax_dc = df_datos_combinados["Tax"] if "Tax" in df_datos_combinados.columns else None

    celdas_corregidas: dict = {}

    cuentas_grupo = df_duplicados["Cuenta"].astype(str).str.strip()
    for _, indices in cuentas_grupo.groupby(cuentas_grupo).groups.items():
        indices = list(indices)

        for idx in indices:
            pago_valor = pago.get(idx)
            if pago_valor is None or pd.isna(pago_valor):
                continue
            df.at[idx, "TOTAL"] = round(float(pago_valor), 2)
            celdas_corregidas.setdefault(idx, set()).add("TOTAL")

        # POS sin Tasa 0 (Carreta de Mariscos, Restaurant La Palapa,
        # Cafetería La Palapa): reparto simple por fila, independiente de la
        # regla ancla/vaciada de Hacienda de abajo.
        for idx in indices:
            pos_valor = str(df.at[idx, "POS"]).strip().upper()
            if pos_valor not in POS_TASA_NORMAL_PAGO_MIXTO:
                continue
            pago_valor = pago.get(idx)
            if pago_valor is None or pd.isna(pago_valor):
                continue
            subtotal = round(float(pago_valor) / 1.16, 2)
            iva = round(subtotal * 0.16, 2)
            df.at[idx, "Subtotal"] = subtotal
            df.at[idx, "Iva"] = iva
            celdas_corregidas.setdefault(idx, set()).update({"Subtotal", "Iva"})

        indices_hacienda = [
            idx for idx in indices
            if str(df.at[idx, "POS"]).strip().upper() == POS_LA_HACIENDA
            and pago.get(idx) is not None and pd.notna(pago.get(idx))
        ]
        if len(indices_hacienda) < 2:
            continue

        idx_ref = indices_hacienda[0]
        subtotal_val = _a_flotante(subtotal_dc.get(idx_ref)) if subtotal_dc is not None else 0.0
        descuento_val = _a_flotante(descuento_dc.get(idx_ref)) if descuento_dc is not None else 0.0
        tax_val = _a_flotante(tax_dc.get(idx_ref)) if tax_dc is not None else 0.0
        subtotal_tienda_total, desc_tasa0_total, ingtasa0_total = _calcular_valores_hacienda(
            subtotal_val, descuento_val, tax_val
        )
        ingtasa0_total = round(ingtasa0_total, 2)

        no_efectivo = [
            idx for idx in indices_hacienda
            if str(df.at[idx, "FORMA DE PAGO"]).strip().upper() != "EFECTIVO"
        ]
        candidatos_ancla = no_efectivo or indices_hacienda
        idx_ancla = max(candidatos_ancla, key=lambda i: pago.get(i) or 0.0)

        vaciadas = sorted(
            (i for i in indices_hacienda if i != idx_ancla),
            key=lambda i: pago.get(i) or 0.0,
        )

        pool_restante = ingtasa0_total
        for idx in vaciadas:
            pago_fila = float(pago.get(idx) or 0.0)
            asignado = round(min(pago_fila, max(pool_restante, 0.0)), 2)
            df.at[idx, "Subtotal"] = 0.0
            df.at[idx, "Descuento"] = 0.0
            df.at[idx, "Iva"] = 0.0
            df.at[idx, "INGTASA 0"] = asignado
            df.at[idx, "DESC TASA 0"] = 0.0
            df.at[idx, "SUBTASA 0"] = asignado
            celdas_corregidas.setdefault(idx, set()).update(
                {"Subtotal", "Descuento", "INGTASA 0", "DESC TASA 0", "SUBTASA 0"}
            )
            pool_restante = round(pool_restante - asignado, 2)

        df.at[idx_ancla, "Subtotal"] = round(subtotal_tienda_total, 2)
        df.at[idx_ancla, "Descuento"] = round(descuento_val, 2)
        df.at[idx_ancla, "Iva"] = round(tax_val, 2)
        df.at[idx_ancla, "INGTASA 0"] = round(pool_restante, 2)
        df.at[idx_ancla, "DESC TASA 0"] = round(desc_tasa0_total, 2)
        df.at[idx_ancla, "SUBTASA 0"] = round(pool_restante - desc_tasa0_total, 2)
        celdas_corregidas.setdefault(idx_ancla, set()).update(
            {"Subtotal", "Descuento", "INGTASA 0", "DESC TASA 0", "SUBTASA 0"}
        )

    return df, celdas_corregidas


def corregir_cupon_ventas(df_segunda_limpieza: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Para CUALQUIER fila cuyo FORMA DE PAGO sea "CUPON VENTAS" (cualquier
    POS, sea o no cuenta con pago mixto), recalcula Descuento/GRAVADO/Iva a
    partir del Subtotal que ya tenga la fila en ese momento — el de
    construir_segunda_limpieza, o el ya corregido por
    corregir_total_subtotal_pago_mixto si es una cuenta con pago mixto (se
    debe llamar después de esa función para heredar ese Subtotal):
    - Descuento = Subtotal / 2
    - GRAVADO = Subtotal - Descuento
    - Iva = GRAVADO * 0.16
    Reemplaza lo que sea que esas 3 columnas ya tuvieran (incluida la regla
    ancla/vaciada de Hacienda, si aplicó). Devuelve (df_corregido,
    celdas_corregidas) — mismo mecanismo que las demás correcciones, para
    que una edición manual del usuario siga ganando por encima de esto.
    """
    if "FORMA DE PAGO" not in df_segunda_limpieza.columns:
        return df_segunda_limpieza, {}

    es_cupon_ventas = df_segunda_limpieza["FORMA DE PAGO"].astype(str).str.strip().str.upper().str.contains("CUPON", na=False)
    if not es_cupon_ventas.any():
        return df_segunda_limpieza, {}

    df = df_segunda_limpieza.copy()
    celdas_corregidas: dict = {}
    for idx in df.index[es_cupon_ventas]:
        subtotal = _a_flotante(df.at[idx, "Subtotal"])
        descuento = round(subtotal / 2, 2)
        gravado = round(subtotal - descuento, 2)
        iva = round(gravado * 0.16, 2)
        df.at[idx, "Descuento"] = descuento
        df.at[idx, "GRAVADO"] = gravado
        df.at[idx, "Iva"] = iva
        celdas_corregidas.setdefault(idx, set()).update({"Descuento", "GRAVADO", "Iva"})

    return df, celdas_corregidas


def construir_segunda_limpieza(df_datos_combinados: pd.DataFrame) -> pd.DataFrame:
    """
    Construye el DataFrame base (sin fórmulas) de la hoja 'Segunda_Limpieza' a
    partir de df_datos_combinados, usando MAPEO_SEGUNDA_LIMPIEZA para las
    columnas que sean copia directa; GRAVADO y PAGO PROVEDOR son siempre 0;
    INGTASA 0 / DESC TASA 0 / SUBTASA 0 quedan vacías (se llenan con fórmulas
    de Excel al escribir el archivo).
    """
    num_filas = len(df_datos_combinados)
    datos: dict[str, list] = {}

    for col_destino in COLUMNAS_SEGUNDA_LIMPIEZA:
        if col_destino in ("GRAVADO", "PAGO PROVEDOR"):
            datos[col_destino] = [0] * num_filas
        elif col_destino in ("INGTASA 0", "DESC TASA 0", "SUBTASA 0"):
            datos[col_destino] = [""] * num_filas
        else:
            col_origen = MAPEO_SEGUNDA_LIMPIEZA.get(col_destino)
            if col_origen and col_origen in df_datos_combinados.columns:
                datos[col_destino] = df_datos_combinados[col_origen].tolist()
            else:
                datos[col_destino] = [""] * num_filas

    return pd.DataFrame(datos, columns=COLUMNAS_SEGUNDA_LIMPIEZA)


async def leer_excel_movimientos(file_content: bytes) -> pd.DataFrame:
    """
    Lee "Movimientos por Periodo" como grilla cruda (header=None): es un
    reporte con filas de título de sección (Funcionarios&Emplea, TUSOSA,
    American Express) seguidas de filas de cuentas, no una tabla plana con
    encabezados normales.
    """
    import zipfile

    try:
        df = pd.read_excel(BytesIO(file_content), header=None)
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), header=None, engine="xlrd")
    return df


COL_INICIO_SEGMENTO = 0  # columna A: fila de título que ABRE un bloque de segmento
COL_FIN_SEGMENTO = 2  # columna C: fila de total que CIERRA el bloque (misma columna que "Descripción"/Cuenta)


def _valor_celda(fila, indice: int) -> str:
    if indice >= len(fila) or pd.isna(fila.iloc[indice]):
        return ""
    return str(fila.iloc[indice]).strip().upper()


def extraer_cuentas_por_segmento(df_movimientos: pd.DataFrame) -> dict[str, set[str]]:
    """
    Recorre Movimientos por Periodo fila por fila. Cada bloque de segmento
    empieza con una fila cuya columna A contiene el nombre del segmento
    (FUNCIONARIOS/TUSOSA/AMERICAN) y termina con una fila cuya columna C
    contiene ese mismo nombre (la fila de total del bloque, con el mismo
    texto repetido junto al monto). Toda fila "Cuenta: NNNNNN" encontrada
    mientras hay un bloque abierto (subtítulos de empleado y encabezados de
    tabla repetidos entre medio no afectan esto) se asigna a ese segmento;
    fuera de cualquier bloque abierto, se acumula para Cortesía.

    Devuelve {segmento: {cuentas...}} para los 3 segmentos conocidos, más
    SEGMENTO_CORTESIA con las cuentas encontradas en cualquier parte del
    archivo que no cayeron en ninguno de los 3 rangos nombrados.
    """
    cuentas_por_segmento: dict[str, set[str]] = {
        SEGMENTO_FUNCIONARIOS: set(),
        SEGMENTO_TUSOSA: set(),
        FORMA_PAGO_AMEX: set(),
    }
    todas_las_cuentas: set[str] = set()
    segmento_actual: str | None = None

    for _, fila in df_movimientos.iterrows():
        col_a = _valor_celda(fila, COL_INICIO_SEGMENTO)
        col_c = _valor_celda(fila, COL_FIN_SEGMENTO)

        for palabra, segmento in _PALABRAS_CLAVE_SEGMENTO:
            if palabra in col_a:
                segmento_actual = segmento
                break

        if any(palabra in col_c for palabra, _ in _PALABRAS_CLAVE_SEGMENTO):
            segmento_actual = None

        texto_fila = " ".join(str(v) for v in fila.values if pd.notna(v))
        match = _PATRON_CUENTA.search(texto_fila)
        if match:
            cuenta = _normalizar_clave_recibo(pd.Series([match.group(1)])).iloc[0]
            todas_las_cuentas.add(cuenta)
            if segmento_actual in cuentas_por_segmento:
                cuentas_por_segmento[segmento_actual].add(cuenta)

    cubiertas: set[str] = set()
    for cuentas in cuentas_por_segmento.values():
        cubiertas |= cuentas
    cuentas_por_segmento[SEGMENTO_CORTESIA] = todas_las_cuentas - cubiertas

    return cuentas_por_segmento


def aplicar_movimientos_periodo(
    df_segunda_limpieza: pd.DataFrame,
    cuentas_por_segmento: dict[str, set[str]],
) -> pd.DataFrame:
    """
    Aplica los resultados de Movimientos por Periodo sobre Segunda_Limpieza,
    comparando por Cuenta normalizada:
    - FORMA DE PAGO se reemplaza SIEMPRE según a qué rango pertenezca la
      cuenta (American Express, Cortesía, Funcionarios&Emplea o TUSOSA, en
      ese orden de prioridad), sin importar el valor previo ni si Segmento
      se actualiza o no — son dos reglas independientes.
    - Segmento sigue su propia regla: Cortesía SIEMPRE reemplaza (tenga o
      no valor ya asignado); Funcionarios&Emplea/TUSOSA solo si Segmento
      viene vacío.
    """
    df = df_segunda_limpieza.copy()
    cuenta_normalizada = _normalizar_clave_recibo(df["Cuenta"])

    def _vacio(valor) -> bool:
        return valor is None or (isinstance(valor, float) and pd.isna(valor)) or str(valor).strip() == ""

    for idx in df.index:
        cuenta = cuenta_normalizada.loc[idx]

        if cuenta in cuentas_por_segmento[FORMA_PAGO_AMEX]:
            df.at[idx, "FORMA DE PAGO"] = FORMA_PAGO_AMEX
        elif cuenta in cuentas_por_segmento[SEGMENTO_CORTESIA]:
            df.at[idx, "FORMA DE PAGO"] = SEGMENTO_CORTESIA
        elif cuenta in cuentas_por_segmento[SEGMENTO_FUNCIONARIOS]:
            df.at[idx, "FORMA DE PAGO"] = SEGMENTO_FUNCIONARIOS
        elif cuenta in cuentas_por_segmento[SEGMENTO_TUSOSA]:
            df.at[idx, "FORMA DE PAGO"] = SEGMENTO_TUSOSA

        if cuenta in cuentas_por_segmento[SEGMENTO_CORTESIA]:
            df.at[idx, "Segmento"] = SEGMENTO_CORTESIA
        elif _vacio(df.at[idx, "Segmento"]):
            if cuenta in cuentas_por_segmento[SEGMENTO_FUNCIONARIOS]:
                df.at[idx, "Segmento"] = SEGMENTO_FUNCIONARIOS
            elif cuenta in cuentas_por_segmento[SEGMENTO_TUSOSA]:
                df.at[idx, "Segmento"] = SEGMENTO_TUSOSA

    return df


# Palabras clave de FORMA DE PAGO que, combinadas con Tipo == "CORTESIA" en
# la misma fila, disparan la alerta de "esta categoría no debería recibir
# cortesía" (Huésped, Visa, Efectivo, Funcionarios y Empleados, American
# Express, TUSOSA).
_PALABRAS_ALERTA_CORTESIA = (
    "HUESPED", "VISA", "EFECTIVO", "FUNCIONARIOS", "AMERICAN", "TUSOSA",
)


def es_alerta_cortesia(forma_pago_valor, tipo_valor) -> bool:
    """
    True si FORMA DE PAGO es Huésped/Visa/Efectivo/Funcionarios y Empleados/
    American Express/TUSOSA Y, en la misma fila, Tipo dice "CORTESIA" — son
    2 columnas independientes que pueden coexistir; esta combinación es una
    alerta para dar seguimiento, ya que esas categorías no deberían recibir
    cortesía.
    """
    tipo = str(tipo_valor).strip().upper()
    if "CORTESIA" not in tipo:
        return False
    forma_pago = str(forma_pago_valor).strip().upper()
    return any(palabra in forma_pago for palabra in _PALABRAS_ALERTA_CORTESIA)


# Título de la tabla -> palabras clave (cualquiera) a buscar en FORMA DE PAGO
# (case-insensitive, substring). Una fila cae en, a lo más, una tabla: la
# primera cuya palabra clave calce.
TABLAS_FACTURACION = [
    ("EFECTIVO", ("EFECTIVO",)),
    ("VISA / MASTERCARD", ("VISA", "MASTERCARD")),
    ("AMERICAN EXPRESS", ("AMERICAN",)),
    ("FUNCIONARIOS Y EMPLEADOS", ("FUNCIONARIOS",)),
    ("HUÉSPED", ("HUESPED",)),
    ("TUSOSA", ("TUSOSA", "CUPON")),
    ("CORTESÍA", ("CORTESIA",)),
]

COLUMNAS_TABLA_FACTURACION = [
    "Revisión", "Fecha", "POS", "Forma de Pago", "Cuenta", "Subtotal", "Descuento",
    "GRAVADO", "INGTASA 0", "DESC TASA 0", "SUBTASA 0", "IVA", "Propina",
    "PAGO PROVEDOR", "TOTAL",
]

# Para el "paso 2" (agregar_pue_ppd_tablas_forma_pago en excel_processor.py):
# secciones de Tablas_Forma_Pago cuyas filas se agrupan en el bloque PUE/PPD
# combinado (Huésped, TUSOSA y Cortesía quedan fuera de ese combinado —
# Huésped tiene su propio bloque PUE/PPD aparte, ver TITULO_HUESPED).
CATEGORIAS_PUE_PPD = ("EFECTIVO", "VISA / MASTERCARD", "AMERICAN EXPRESS", "FUNCIONARIOS Y EMPLEADOS")
TITULO_HUESPED = "HUÉSPED"

# Para el guardado en base de datos del detalle de Tablas_Forma_Pago
# ("Paso 2"): clasificación PUE/PPD por tabla de origen, denormalizada en
# cada fila guardada para no repetir este mapeo en cada consulta futura de
# análisis. None para TUSOSA/CORTESÍA (no aplican a PUE/PPD).
CATEGORIA_PUE_PPD_POR_TABLA = {
    "EFECTIVO": "PUE",
    "VISA / MASTERCARD": "PUE",
    "AMERICAN EXPRESS": "PUE",
    "FUNCIONARIOS Y EMPLEADOS": "PUE",
    "HUÉSPED": "PPD",
    "TUSOSA": None,
    "CORTESÍA": None,
}

# Para el endpoint de analítica (/tablas-forma-pago/analitica): clave segura
# para JSON/frontend (snake_case, sin acentos ni espacios) por tabla de
# origen — se usa para desglosar el total de cada día por tabla.
CLAVE_ANALITICA_POR_TABLA = {
    "EFECTIVO": "efectivo",
    "VISA / MASTERCARD": "visa_mastercard",
    "AMERICAN EXPRESS": "american_express",
    "FUNCIONARIOS Y EMPLEADOS": "funcionarios_y_empleados",
    "HUÉSPED": "huesped",
    "TUSOSA": "tusosa",
    "CORTESÍA": "cortesia",
}

# Para la gráfica "Ventas por punto de venta" (/tablas-forma-pago/ventas-por-pos):
# 7 puntos de venta fijos, exhaustivo (cualquier otro POS no listado queda
# fuera de esta vista a propósito). El campo POS no es un catálogo cerrado
# — "Sobrante"/"Recepción" en particular vienen con variantes reales
# ("SOBRANTE", "SOBRANTE CAFETERIA", "SOBRANTE caja"), así que se agrupan
# por substring, no por igualdad exacta. clave, etiqueta, substrings que
# activan el match (ya normalizados: mayúsculas, sin acentos), y qué
# métrica sumar: "ingreso_real" = GRAVADO + SUBTASA 0 (ambos ya netos de
# descuento, mismo criterio entre sí); "total" = total tal cual — Sobrante
# y Recepción se piden expresamente así, no como ingreso gravado.
PUNTOS_VENTA_ANALITICA: list[tuple[str, str, tuple[str, ...], str]] = [
    ("hacienda", "La Hacienda", ("LA HACIENDA",), "ingreso_real"),
    ("cafeteria", "Cafetería Lapa Lapa", ("CAFETERIA LAPA LAPA",), "ingreso_real"),
    ("carreta", "La Carreta Mariscos", ("CARRETA MARISCOS",), "ingreso_real"),
    ("agencia", "Agencia de Viajes", ("AGENCIA",), "ingreso_real"),
    ("palapa", "Restaurant La Palapa", ("PALAPA",), "ingreso_real"),
    ("sobrante", "Sobrante", ("SOBRANTE",), "total"),
    ("recepcion", "Recepción", ("RECEPCION",), "total"),
]


def _normalizar_pos(pos: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", pos).encode("ascii", "ignore").decode("ascii")
    return sin_acentos.upper()


def clasificar_pos_en_punto_venta(pos: str | None) -> str | None:
    """
    Regresa la clave del primer punto de venta de PUNTOS_VENTA_ANALITICA
    cuyo substring aparezca en `pos` (normalizado: mayúsculas, sin
    acentos), o None si no coincide con ninguno de los 6 — esas filas
    simplemente no participan en esa gráfica, no es un error.
    """
    if not pos:
        return None
    pos_normalizado = _normalizar_pos(pos)
    for clave, _etiqueta, substrings, _metrica in PUNTOS_VENTA_ANALITICA:
        if any(substring in pos_normalizado for substring in substrings):
            return clave
    return None


# Mapea cada nombre de columna de COLUMNAS_TABLA_FACTURACION al nombre de
# campo snake_case del modelo FacturacionTablaFormaPagoDetalle.
_CAMPO_MODELO_POR_COLUMNA = {
    "Revisión": "revision",
    "Fecha": "fecha_texto",
    "POS": "pos",
    "Forma de Pago": "forma_de_pago",
    "Cuenta": "cuenta",
    "Subtotal": "subtotal",
    "Descuento": "descuento",
    "GRAVADO": "gravado",
    "INGTASA 0": "ingtasa_0",
    "DESC TASA 0": "desc_tasa_0",
    "SUBTASA 0": "subtasa_0",
    "IVA": "iva",
    "Propina": "propina",
    "PAGO PROVEDOR": "pago_proveedor",
    "TOTAL": "total",
}


def filas_a_registros_tabla_forma_pago(filas: list[dict], periodo: str) -> list[dict]:
    """
    Mapea las filas planas de excel_processor.leer_filas_completas_tablas_forma_pago
    (claves = nombres de columna de COLUMNAS_TABLA_FACTURACION, más
    "tabla_origen"/"fila_excel") a dicts listos para construir instancias de
    FacturacionTablaFormaPagoDetalle: nombres de campo snake_case, más
    "periodo" (capturado a mano por el usuario al guardar) y
    "categoria_pue_ppd" (derivado de "tabla_origen").
    """
    registros = []
    for fila in filas:
        registro = {
            "periodo": periodo,
            "tabla_origen": fila["tabla_origen"],
            "fila_excel": fila["fila_excel"],
            "categoria_pue_ppd": CATEGORIA_PUE_PPD_POR_TABLA.get(fila["tabla_origen"]),
        }
        for columna, campo in _CAMPO_MODELO_POR_COLUMNA.items():
            registro[campo] = fila.get(columna)
        registros.append(registro)
    return registros


# ── Adjuntos (XML/PDF) de FacturacionFacturaAdjunta — facturas registradas
# sueltas para un día, sin amarrarlas a ninguna cuenta de las 7 tablas. Los
# archivos viven en disco (settings.storage_dir), NUNCA en la base de
# datos: con muchos PDFs, un BLOB en SQLite infla el propio archivo
# .sqlite3 y degrada cada consulta de la tabla, no solo la de adjuntos. La
# BD solo guarda la ruta relativa devuelta aquí + metadata de exhibición
# (nombre original, tamaño) — ver FacturacionFacturaAdjunta.

DIRECTORIO_ADJUNTOS = "facturacion_adjuntos"
_EXTENSION_POR_TIPO_ADJUNTO: dict[str, str] = {"xml": "xml", "pdf": "pdf"}


def _directorio_almacenamiento() -> Path:
    return Path(settings.storage_dir)


def guardar_adjunto_factura(registro_id: int, tipo: Literal["xml", "pdf"], contenido: bytes) -> str:
    """
    Escribe `contenido` en <storage_dir>/facturacion_adjuntos/<registro_id>/factura.<tipo>
    y regresa la ruta relativa (a guardar en FacturacionFacturaAdjunta.
    xml_ruta/pdf_ruta). `registro_id` es el único componente variable de la
    ruta — es el id autoincrement de FacturacionFacturaAdjunta, nunca texto
    capturado por el usuario, así que no hace falta sanitizar nada para
    evitar un path traversal (no hay forma de inyectar "../" a través de un
    ID entero).
    """
    ruta_relativa = f"{DIRECTORIO_ADJUNTOS}/{registro_id}/factura.{_EXTENSION_POR_TIPO_ADJUNTO[tipo]}"
    ruta_absoluta = _directorio_almacenamiento() / ruta_relativa
    ruta_absoluta.parent.mkdir(parents=True, exist_ok=True)
    ruta_absoluta.write_bytes(contenido)
    return ruta_relativa


def ruta_absoluta_adjunto(ruta_relativa: str) -> Path:
    return _directorio_almacenamiento() / ruta_relativa


def eliminar_adjunto_factura(ruta_relativa: str | None) -> None:
    """Borra el archivo si existe. Silencioso si ya no está (DELETE repetido no debe fallar)."""
    if not ruta_relativa:
        return
    ruta_absoluta = ruta_absoluta_adjunto(ruta_relativa)
    ruta_absoluta.unlink(missing_ok=True)


# ── Balanza contable (comparación futura contra "Ventas por punto de
# venta") — el archivo real sí trae un encabezado confiable con estos 7
# nombres de columna (a diferencia de leer_archivo_retenciones/
# leer_excel_movimientos, que no tienen encabezado utilizable), pero no en
# una fila fija: antes de esa fila vienen varias filas de título (nombre de
# la empresa, periodo del reporte, etc.) cuya cantidad varía según cómo se
# exportó — hay que localizar la fila de encabezado, no asumir header=0.

_COLUMNAS_BALANZA = {
    "Código Cuenta": "codigo_cuenta",
    "Descripción": "descripcion",
    "Saldo Ant": "saldo_anterior",
    "Débitos Mes": "debitos_mes",
    "Créditos Mes": "creditos_mes",
    "Saldo Mes": "saldo_mes",
    "Saldo Actual": "saldo_actual",
}
_COLUMNAS_BALANZA_MONTO = {
    "saldo_anterior", "debitos_mes", "creditos_mes", "saldo_mes", "saldo_actual",
}
_MAX_FILAS_TITULO_BALANZA = 20  # tope de filas de título a explorar antes de darse por vencido


def _normalizar_encabezado(texto) -> str:
    if texto is None:
        return ""
    sin_acentos = unicodedata.normalize("NFKD", str(texto).strip()).encode("ascii", "ignore").decode("ascii")
    return sin_acentos.lower()


_ENCABEZADOS_BALANZA_NORMALIZADOS = {
    _normalizar_encabezado(original): campo for original, campo in _COLUMNAS_BALANZA.items()
}


def _parse_monto_balanza(valor) -> float:
    """
    Como parse_float pero tolera montos formateados con separador de miles
    ("54,782,501.71"), que la balanza real trae si la celda de Excel quedó
    guardada como texto en vez de numérica.
    """
    resultado = parse_float(valor)
    if resultado is not None:
        return resultado
    if isinstance(valor, str):
        resultado = parse_float(valor.strip().replace("$", "").replace(",", ""))
        if resultado is not None:
            return resultado
    return 0.0


def leer_excel_balanza(file_content: bytes) -> list[dict]:
    """
    Lee la balanza contable (columnas: Código Cuenta, Descripción, Saldo
    Ant, Débitos Mes, Créditos Mes, Saldo Mes, Saldo Actual) y regresa una
    lista de dicts con las claves snake_case de BalanzaCuenta, listos para
    insertarse. Se lee todo como texto (dtype=str) para no perder códigos
    de cuenta jerárquicos (ej. "1000001.001") ni convertir uno simple como
    "1" en "1.0" — mismo bug de _normalizar_clave_recibo ya documentado en
    este archivo, aquí evitado desde el origen en vez de parcheado después.
    La fila de encabezado se busca en las primeras _MAX_FILAS_TITULO_BALANZA
    filas (la primera que contenga "Código Cuenta"), no se asume header=0.
    Filas sin Código Cuenta o Descripción se descartan (filas vacías al
    final del archivo, si las hubiera).
    """
    crudo = pd.read_excel(BytesIO(file_content), header=None, dtype=str)

    campo_por_columna: dict[int, str] = {}
    for idx_fila in range(min(_MAX_FILAS_TITULO_BALANZA, len(crudo))):
        candidatos = {
            idx_col: _ENCABEZADOS_BALANZA_NORMALIZADOS.get(_normalizar_encabezado(valor))
            for idx_col, valor in crudo.iloc[idx_fila].items()
        }
        campo_por_columna = {idx_col: campo for idx_col, campo in candidatos.items() if campo}
        if "codigo_cuenta" in campo_por_columna.values():
            fila_datos_inicio = idx_fila + 1
            break
    else:
        raise ValueError("No se encontró la fila de encabezado de la balanza (columna 'Código Cuenta')")

    registros = []
    for idx_fila in range(fila_datos_inicio, len(crudo)):
        fila = crudo.iloc[idx_fila]
        valores = {campo: fila[idx_col] for idx_col, campo in campo_por_columna.items()}
        codigo_cuenta = str(valores.get("codigo_cuenta", "")).strip()
        descripcion = str(valores.get("descripcion", "")).strip()
        if not codigo_cuenta or codigo_cuenta.lower() == "nan" or not descripcion or descripcion.lower() == "nan":
            continue
        registro = {"codigo_cuenta": codigo_cuenta, "descripcion": descripcion}
        for campo in _COLUMNAS_BALANZA_MONTO:
            registro[campo] = _parse_monto_balanza(valores.get(campo))
        registros.append(registro)
    return registros


# ── Desglose Balanza vs "Ventas por punto de venta" — mapeo fijo, dado a
# mano por el usuario cuenta por cuenta (códigos de cuenta que "nunca
# cambian"), igual criterio de constante de negocio fija que
# PUNTOS_VENTA_ANALITICA/CATEGORIA_PUE_PPD_POR_TABLA en este mismo módulo.
# Cada entrada es (grupo, codigo_cuenta, etiqueta); el grupo es solo para
# presentación (agrupar Gravado/Tasa 0%/Otros al mostrar el desglose). Los
# puntos de venta sin entrada aquí todavía no tienen su desglose definido
# — se agregan uno por uno conforme el usuario los va dando.
MAPEO_BALANZA_POR_PUNTO_VENTA: dict[str, list[tuple[str, str, str]]] = {
    "hacienda": [
        ("Gravado", "4001006.001", "Ingresos Tienda"),
        ("Gravado", "4001006.006", "Descuentos"),
        ("Tasa 0%", "4001006.003", "Ingresos Tienda Tasa 0%"),
        ("Tasa 0%", "4001006.007", "Descuentos Tasa 0%"),
        ("Otros", "4002001.003", "Fichas de Lavandería"),
        ("Otros", "4002007.002", "Ladatel"),
    ],
    # Más simple que La Hacienda: no hay separación Gravado/Tasa 0%, sino
    # Ingresos (las 3 subcuentas de venta de 4001007) vs. Descuentos (su
    # propio descuento) — 2 resultados separados, mismo criterio visual que
    # Gravado/Tasa 0% en "hacienda".
    "cafeteria": [
        ("Ingresos", "4001007.001", "Ingresos Cafetería Bebidas Café"),
        ("Ingresos", "4001007.002", "Ingresos Cafetería Alimentos"),
        ("Ingresos", "4001007.003", "Ingresos Cafetería Souvenirs"),
        ("Descuentos", "4001007.050", "Desc. sobre Ventas Cafetería"),
    ],
    # La Carreta y Restaurant La Palapa comparten la cuenta de Bar (familia
    # 4001002) — no se puede partir limpiamente por código entre los dos,
    # así que cada uno queda con una diferencia de ~$265 contra su propia
    # meta (en sentidos opuestos), pero la suma de ambos sí cuadra con la
    # suma de sus dos metas (confirmado con datos reales: diferencia de
    # apenas $0.37). El grupo "Bar" se muestra por separado del propio del
    # punto de venta en ambos, por pedido explícito del usuario.
    "carreta": [
        ("Alimentos", "4001005.002", "Ingrs Alimentos La Carreta"),
        ("Bar", "4001002.003", "Ingrs Bebidas Bar La Carreta"),
    ],
    "palapa": [
        ("Restaurante", "4001005.001", "Ingresos Alimentos"),
        ("Restaurante", "4001005.003", "Descuentos Restaurante"),
        ("Restaurante", "4001005.004", "Eventos"),
        ("Restaurante", "4001005.006", "Varios"),
        ("Bar", "4001002.001", "Ingresos Bar"),
        ("Bar", "4001002.002", "Descuentos Bar"),
    ],
    # Clave sintética (no es un punto de venta real de PUNTOS_VENTA_ANALITICA):
    # unión de "carreta" + "palapa" en un solo desglose, pedido por el
    # usuario para que el frontend los muestre juntos en el Análisis — así
    # la diferencia de ~$265 de cada uno por separado (por el Bar
    # compartido) desaparece, ya que combinados sí cuadran casi exacto.
    "carreta_palapa": [
        ("Alimentos", "4001005.002", "Ingrs Alimentos La Carreta"),
        ("Restaurante", "4001005.001", "Ingresos Alimentos"),
        ("Restaurante", "4001005.003", "Descuentos Restaurante"),
        ("Restaurante", "4001005.004", "Eventos"),
        ("Restaurante", "4001005.006", "Varios"),
        ("Bar", "4001002.001", "Ingresos Bar"),
        ("Bar", "4001002.002", "Descuentos Bar"),
        ("Bar", "4001002.003", "Ingrs Bebidas Bar La Carreta"),
    ],
    # 2 grupos según sus propias cuentas madre: 4001004 (Boletos Tours) y
    # 4002006 (Actividades Especiales) — ambas familias de ingresos, sin
    # cuentas de Bar ni cuentas de otra familia involucradas.
    "agencia": [
        ("Boletos Tours", "4001004.001", "Ingresos Boletos Tours"),
        ("Boletos Tours", "4001004.002", "Descuentos Boletos Tours"),
        ("Actividades Especiales", "4002006.005", "Servicio Masajes"),
        ("Actividades Especiales", "4002006.006", "Servicio de Belleza"),
        ("Actividades Especiales", "4002006.007", "Pintura Cerámica"),
    ],
}


def calcular_detalle_balanza_punto_venta(punto_venta: str, cuentas_balanza: list[dict]) -> dict:
    """
    Arma el desglose "Balanza vs Ventas por punto de venta" para
    `punto_venta` a partir de MAPEO_BALANZA_POR_PUNTO_VENTA y las cuentas ya
    consultadas de BalanzaCuenta (cada dict con al menos codigo_cuenta y
    saldo_mes). Regresa {"disponible": False} si el punto de venta todavía
    no tiene mapeo definido.

    Los montos de cada cuenta se muestran tal cual están en la balanza (con
    su signo real, para transparencia); el subtotal por grupo también
    conserva el signo. Solo el TOTAL final se invierte a positivo — el
    usuario confirmó, con datos reales, que sumar los Saldo Mes firmados de
    las cuentas listadas reproduce el mismo negativo que la cuenta madre, y
    que ese acumulado se reporta en positivo para comparar contra el
    "ingreso real" ya calculado en /tablas-forma-pago/ventas-por-pos.
    """
    mapeo = MAPEO_BALANZA_POR_PUNTO_VENTA.get(punto_venta)
    if mapeo is None:
        return {"disponible": False}

    saldo_por_codigo = {c["codigo_cuenta"]: c["saldo_mes"] for c in cuentas_balanza}

    grupos_ordenados: list[str] = []
    cuentas_por_grupo: dict[str, list[dict]] = {}
    for grupo, codigo_cuenta, etiqueta in mapeo:
        if grupo not in cuentas_por_grupo:
            cuentas_por_grupo[grupo] = []
            grupos_ordenados.append(grupo)
        encontrada = codigo_cuenta in saldo_por_codigo
        cuentas_por_grupo[grupo].append({
            "codigo_cuenta": codigo_cuenta,
            "etiqueta": etiqueta,
            "saldo_mes": saldo_por_codigo.get(codigo_cuenta),
            "encontrada": encontrada,
        })

    grupos = []
    total_firmado = 0.0
    for grupo in grupos_ordenados:
        subtotal = sum(c["saldo_mes"] or 0.0 for c in cuentas_por_grupo[grupo])
        total_firmado += subtotal
        grupos.append({"grupo": grupo, "cuentas": cuentas_por_grupo[grupo], "subtotal": round(subtotal, 2)})

    return {
        "disponible": True,
        "punto_venta": punto_venta,
        "grupos": grupos,
        "total": round(-total_firmado, 2),
    }


def _a_numero(df: pd.DataFrame, columna: str) -> pd.Series:
    if columna not in df.columns:
        return pd.Series(0.0, index=df.index)
    return pd.to_numeric(df[columna], errors="coerce").fillna(0.0)


def construir_tablas_por_forma_pago(df_segunda_limpieza: pd.DataFrame) -> list[tuple[str, pd.DataFrame]]:
    """
    Agrupa Segunda_Limpieza (ya con Segmento/FORMA DE PAGO final aplicados
    por aplicar_movimientos_periodo, si corresponde) en tablas por categoría
    de FORMA DE PAGO — ver TABLAS_FACTURACION. Cada tabla usa columnas y
    fórmulas propias de esta vista (no las de Segunda_Limpieza):
    - GRAVADO = Subtotal - Descuento
    - IVA = GRAVADO * 0.16
    - TOTAL = GRAVADO + (INGTASA 0 - DESC TASA 0) + IVA + Propina + PAGO PROVEDOR
    Una fila cae en, a lo más, una tabla (la primera cuya palabra clave
    calce con su FORMA DE PAGO); filas que no calzan con ninguna no
    aparecen en ninguna tabla. Excepción: una fila Huésped cuyo Tipo diga
    "CORTESIA" (la misma condición de es_alerta_cortesia) no cae en la
    tabla Huésped — se mueve a la tabla Cortesía (la última sección), donde
    se suma en su fila TOTAL, conservando el resaltado rojo de alerta.
    Devuelve una lista (título, DataFrame) en el orden de TABLAS_FACTURACION.
    """
    if "FORMA DE PAGO" not in df_segunda_limpieza.columns:
        return [(titulo, df_segunda_limpieza.iloc[0:0]) for titulo, _ in TABLAS_FACTURACION]

    forma_pago = df_segunda_limpieza["FORMA DE PAGO"].astype(str).str.strip().str.upper()

    subtotal = _a_numero(df_segunda_limpieza, "Subtotal")
    descuento = _a_numero(df_segunda_limpieza, "Descuento")
    ingtasa0 = _a_numero(df_segunda_limpieza, "INGTASA 0")
    desc_tasa0 = _a_numero(df_segunda_limpieza, "DESC TASA 0")
    propina = _a_numero(df_segunda_limpieza, "Propina")
    pago_proveedor = _a_numero(df_segunda_limpieza, "PAGO PROVEDOR")

    gravado = subtotal - descuento
    iva = gravado * 0.16
    subtasa0 = ingtasa0 - desc_tasa0
    total = gravado + subtasa0 + iva + propina + pago_proveedor

    # Cuentas con forma de pago mixta (ej. EFECTIVO+VISA para la misma
    # Cuenta) — mismo criterio que usa la vista previa de "Ver duplicados",
    # para marcarlas visualmente y que el equipo de contabilidad revise los
    # valores ancla/vaciada que les aplicó corregir_total_subtotal_pago_mixto.
    indices_pago_mixto = set(detectar_duplicados_segunda_limpieza(df_segunda_limpieza).index)

    alerta_cortesia = pd.Series(
        [
            es_alerta_cortesia(fp, tipo)
            for fp, tipo in zip(
                df_segunda_limpieza["FORMA DE PAGO"],
                df_segunda_limpieza.get("Tipo", pd.Series("", index=df_segunda_limpieza.index)),
            )
        ],
        index=df_segunda_limpieza.index,
    )
    # Huésped+Cortesía es un caso especial: en vez de sumarse en la tabla
    # Huésped, se mueve a la tabla Cortesía (la última sección) — sigue
    # marcada en rojo por _alerta_cortesia, solo cambia en qué tabla se suma.
    es_huesped_cortesia = forma_pago.str.contains("HUESPED", na=False) & alerta_cortesia

    df_calculado = pd.DataFrame({
        "Revisión": [
            "PAGO MIXTO" if idx in indices_pago_mixto else ""
            for idx in df_segunda_limpieza.index
        ],
        "Fecha": df_segunda_limpieza.get("Fecha", ""),
        "POS": df_segunda_limpieza.get("POS", ""),
        "Forma de Pago": df_segunda_limpieza["FORMA DE PAGO"],
        "Cuenta": df_segunda_limpieza.get("Cuenta", ""),
        "Subtotal": subtotal,
        "Descuento": descuento,
        "GRAVADO": gravado,
        "INGTASA 0": ingtasa0,
        "DESC TASA 0": desc_tasa0,
        "SUBTASA 0": subtasa0,
        "IVA": iva,
        "Propina": propina,
        "PAGO PROVEDOR": pago_proveedor,
        "TOTAL": total,
        # Columna interna (no forma parte de COLUMNAS_TABLA_FACTURACION, no
        # se escribe como columna visible) usada solo para resaltar la fila.
        "_alerta_cortesia": alerta_cortesia,
    }, index=df_segunda_limpieza.index)

    tablas = []
    ya_asignada = pd.Series(False, index=df_segunda_limpieza.index)
    for titulo, palabras_clave in TABLAS_FACTURACION:
        mascara = pd.Series(False, index=df_segunda_limpieza.index)
        for palabra in palabras_clave:
            mascara |= forma_pago.str.contains(palabra, na=False)
        if titulo == "HUÉSPED":
            mascara &= ~es_huesped_cortesia
        mascara &= ~ya_asignada
        ya_asignada |= mascara

        if titulo == "CORTESÍA":
            # Las filas Huésped+Cortesía se agregan al final de esta tabla
            # (no intercaladas por su posición original) — se procesan por
            # separado y se concatenan después de las filas "nativas" de
            # Cortesía. Su "Forma de Pago" se relabela a "CORTESIA" (solo en
            # esta vista de Tablas_Forma_Pago, Segunda_Limpieza no se toca)
            # para que no diga "HUESPED" estando ya dentro de la tabla
            # Cortesía — cosmético, no cambia qué filas cuentan en PUE/PPD.
            mascara_huesped_cortesia = es_huesped_cortesia & ~ya_asignada
            ya_asignada |= mascara_huesped_cortesia
            df_huesped_cortesia = df_calculado[mascara_huesped_cortesia].copy()
            if not df_huesped_cortesia.empty:
                df_huesped_cortesia["Forma de Pago"] = "CORTESIA"
            df_tabla = pd.concat([df_calculado[mascara], df_huesped_cortesia])
        else:
            df_tabla = df_calculado[mascara].copy()

        tablas.append((titulo, df_tabla))

    return tablas
