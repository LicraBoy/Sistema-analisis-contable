import pandas as pd
import re

def normalizar(valor):
    if pd.isna(valor):
        return ""
    return str(valor).strip().upper()

def normalizar_monto(valor):
    if pd.isna(valor):
        return ""
    try:
        # Convert to float and format to 2 decimal places to ensure "2400", "2400.0", "2400.00" all become "2400.00"
        return f"{float(valor):.2f}"
    except ValueError:
        return str(valor).strip().upper()

def parse_float(valor) -> float | None:
    """Intenta convertir un valor (str, int, float, None) a float; None si no se puede."""
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip()
    if not texto:
        return None
    try:
        return float(texto)
    except ValueError:
        return None


# Pares (columna en moneda original -> columna equivalente en MXN) usados tanto
# para normalizar tipos (strings -> float) como para recalcular al editar el
# tipo de cambio de una fila en USD.
PARES_ORIGINAL_MXN = [
    ("Total", "Total MXN"),
    ("Subtotal", "Subtotal MXN"),
    ("Total descuento", "Total descuento MXN"),
    ("Neto", "Neto MXN"),
    ("Traslado IVA", "Traslado IVA MXN"),
    ("Traslado IEPS", "Traslado IEPS MXN"),
    ("Traslados ISR", "Traslado ISR MXN"),
    ("Retención IVA", "Retención IVA MXN"),
    ("Retención IEPS", "Retención IEPS MXN"),
    ("Retención ISR", "Retención ISR MXN"),
]


def normalizar_montos_fila(fila: dict) -> None:
    """
    Convierte a float real (en vez de string) los montos de una fila de
    Amarre: DEBE(MONTO TOTAL DE LA FACTURA) y ambos lados de cada par en
    PARES_ORIGINAL_MXN. Los valores no parseables se dejan sin tocar.
    """
    campos = ["DEBE(MONTO TOTAL DE LA FACTURA)"]
    for original, mxn in PARES_ORIGINAL_MXN:
        campos.append(original)
        campos.append(mxn)

    for campo in campos:
        if campo not in fila:
            continue
        valor = parse_float(fila[campo])
        if valor is not None:
            fila[campo] = valor


def aplicar_override_tipo_cambio(fila: dict, nuevo_tipo_cambio: float) -> None:
    """
    Sobrescribe el tipo de cambio de una fila y recalcula sus columnas MXN
    como valor_original * nuevo_tipo_cambio.
    """
    fila["Tipo cambio"] = nuevo_tipo_cambio
    for original, mxn in PARES_ORIGINAL_MXN:
        valor_original = parse_float(fila.get(original))
        if valor_original is not None:
            fila[mxn] = valor_original * nuevo_tipo_cambio


def normalizar_fecha(valor):
    valor_str = str(valor).strip()
    if valor_str.lower() in ["", "nan", "nat", "none"]:
        return ""
        
    # Intentar YYYY-MM-DD
    match = re.search(r"(\d{4})-(\d{2})-(\d{2})", valor_str)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
        
    # Intentar DD/MM/YYYY o D/M/YYYY
    match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", valor_str)
    if match:
        dia = match.group(1).zfill(2)
        mes = match.group(2).zfill(2)
        anio = match.group(3)
        return f"{anio}-{mes}-{dia}"
        
    return valor_str

def analizar_ingresos_recibidos(df_ingresos: pd.DataFrame) -> dict:
    """
    Analizar el DataFrame de ingresos recibidos (CFDI).
    Extrae Folio concatenando columnas D+E y UUID.
    """
    # Normalizar nombres de columnas
    df_ingresos.columns = df_ingresos.columns.astype(str).str.strip()
    
    if len(df_ingresos.columns) < 5:
        raise ValueError("El archivo de ingresos debe tener al menos 5 columnas (columna E para Folio)")
    
    col_B_ingresos = df_ingresos.columns[1] if len(df_ingresos.columns) > 1 else None
    col_D_ingresos = df_ingresos.columns[3]
    col_E_ingresos = df_ingresos.columns[4]
    
    # Intentar obtener la columna I (índice 8) para el Monto
    col_I_ingresos = df_ingresos.columns[8] if len(df_ingresos.columns) > 8 else None
    
    columna_uuid = None
    columna_rfc_emisor = None
    columna_nombre_emisor = None
    for columna in df_ingresos.columns:
        col_norm = normalizar(columna)
        if col_norm == "UUID":
            columna_uuid = columna
        elif col_norm == "RFC EMISOR":
            columna_rfc_emisor = columna
        elif col_norm == "EMISOR":
            columna_nombre_emisor = columna

    if not columna_uuid:
        raise ValueError("No se encontró la columna UUID en Ingresos")

    # Convertir a dict para SQLAlchemy
    records = []
    seen_uuids = set()
    duplicados = 0

    df_ingresos[columna_uuid] = df_ingresos[columna_uuid].fillna("").astype(str).str.strip()

    for _, row in df_ingresos.iterrows():
        # Concatenar D+E para armar la factura completa (ej. "CB" + "48271" = "CB48271")
        parte_d = normalizar(row[col_D_ingresos])
        parte_e = normalizar(row[col_E_ingresos])
        folio = (parte_d + parte_e).strip()
        
        monto = normalizar_monto(row[col_I_ingresos]) if col_I_ingresos else ""
        fecha = normalizar_fecha(row[col_B_ingresos]) if col_B_ingresos else ""
        
        uuid_val = row[columna_uuid]
        
        if uuid_val != "" and uuid_val.upper() not in ["NAN", "NONE"]:
            uuid_lower = uuid_val.lower()
            if uuid_lower in seen_uuids:
                duplicados += 1
                continue
            
            seen_uuids.add(uuid_lower)
            
            # Guardar en datos_extra
            datos_extra = {str(k): str(v) for k, v in row.items() if str(k) not in [columna_uuid] and pd.notna(v)}
            datos_extra["folio"] = folio
            datos_extra["monto"] = monto
            datos_extra["fecha"] = fecha
            
            records.append({
                "uuid": uuid_lower,
                "regimen_fiscal_receptor": "",
                "regimen_fiscal_emisor": "",
                "rfc_emisor": normalizar(row[columna_rfc_emisor]) if columna_rfc_emisor and pd.notna(row[columna_rfc_emisor]) else None,
                "nombre_emisor": str(row[columna_nombre_emisor]).strip() if columna_nombre_emisor and pd.notna(row[columna_nombre_emisor]) else None,
                "datos_extra": datos_extra
            })

    return {
        "total_procesados": len(records),
        "duplicados": duplicados,
        "errores": 0,
        "data": records
    }


def procesar_logica_pagos(df_pagos: pd.DataFrame, ingresos_db_dict: dict) -> pd.DataFrame:
    """
    Ejecuta el pipeline de pagos: filtro, primera búsqueda y segunda búsqueda.
    ingresos_db_dict es un mapeo {folio(str): uuid(str)} sacado de la BD.
    """
    if df_pagos.empty:
        return df_pagos

    col_A = df_pagos.columns[0]
    col_C = df_pagos.columns[2]
    col_D = df_pagos.columns[3]
    col_F = df_pagos.columns[5]
    col_I = df_pagos.columns[8]   # Columna I = Monto
    col_L = df_pagos.columns[11]

    df_original = df_pagos.copy()

    # Normalizar columnas para búsqueda
    df_original[col_C] = df_original[col_C].apply(normalizar)
    df_original[col_F] = df_original[col_F].apply(normalizar)
    df_original[col_I] = df_original[col_I].apply(normalizar)
    df_original[col_L] = df_original[col_L].apply(normalizar)

    # 1. Primera búsqueda (diccionario interno)
    # Usamos columna C (referencia/cruce) como clave; el Paso B busca por F
    mask_busqueda = (
        (df_original[col_C] != "") &
        (df_original[col_L] != "") &
        (~df_original[col_L].isin(["NAN", "NONE", "NO SE PAGO"]))
    )
    tabla_busqueda = df_original[mask_busqueda][[col_C, col_I, col_D, col_L]].copy()

    # Crear clave con C (normalizado)
    tabla_busqueda['_clave'] = tabla_busqueda[col_C].apply(normalizar)
    tabla_busqueda = tabla_busqueda.drop_duplicates(subset=['_clave'], keep="first")
    diccionario_uuid = dict(zip(tabla_busqueda['_clave'], tabla_busqueda[col_L]))

    # 2. Filtrar PAGO
    df_filtrado = df_original[df_original[col_A].apply(normalizar) == "PAGO"].copy()
    if df_filtrado.empty:
        return df_filtrado

    # Restaurar la fecha original sin normalizar, ya que normalizar la vuelve string upper
    # La fecha se procesa en el router (pagos.py), así que mantenemos los valores como vienen
    df_filtrado[col_D] = df_pagos[col_D].loc[df_filtrado.index]

    # Convertir ingresos_db_dict keys a uppercase para el match
    diccionario_folio_uuid = {str(k).strip().upper(): str(v).strip().upper() for k, v in ingresos_db_dict.items() if k and v}

    # 3. Marcar Duplicados ANTES de realizar la búsqueda
    # Duplicado real = misma factura + mismo UUID + mismo monto + misma fecha exacta.
    # Si solo coincide el UUID pero monto o fecha son distintos, es un pago legítimo
    # distinto (parcialidad/abono) y se deja para revisión manual en Conciliación.
    df_filtrado['is_duplicated'] = False

    uuids_originales = df_filtrado[col_L].astype(str).str.strip().str.upper()
    facturas_originales = df_filtrado[col_F].apply(normalizar)
    montos_originales = df_filtrado[col_I].apply(normalizar_monto)
    fechas_originales = df_filtrado[col_D].apply(normalizar_fecha)
    claves_duplicados = uuids_originales + "|" + facturas_originales + "|" + montos_originales + "|" + fechas_originales

    mask_validos = (uuids_originales != "") & (~uuids_originales.isin(["NAN", "NONE", "NO SE PAGO"]))
    
    if mask_validos.any():
        duplicated_mask = claves_duplicados[mask_validos].duplicated(keep=False)
        df_filtrado.loc[mask_validos, 'is_duplicated'] = duplicated_mask

    # 4. Búsquedas (Rellenar UUIDs vacíos o corregir Falsos Duplicados)
    for indice in df_filtrado.index:
        valor_L = df_filtrado.at[indice, col_L]
        l_vacia = pd.isna(valor_L) or normalizar(valor_L) in ["", "NAN", "NONE"]
        is_dup = df_filtrado.at[indice, 'is_duplicated']

        # Solo buscamos si está vacío, o si está marcado como duplicado (para intentar corregirlo)
        if not l_vacia and not is_dup:
            continue

        valor_F = normalizar(df_filtrado.at[indice, col_F])
        valor_I = normalizar_monto(df_filtrado.at[indice, col_I])
        valor_D = normalizar_fecha(df_filtrado.at[indice, col_D])

        # ═══ 1ª BÚSQUEDA: Diccionario interno del mismo archivo de Pagos (C ↔ F) ═══
        uuid_encontrado = None
        clave_busqueda_interna = valor_F

        if clave_busqueda_interna in diccionario_uuid:
            uuid_encontrado = diccionario_uuid[clave_busqueda_interna]

        # ═══ 2ª BÚSQUEDA: Ingresos Recibidos (BD) — solo si la interna no encontró nada ═══
        if not uuid_encontrado:
            clave_busqueda = valor_F
            if clave_busqueda in diccionario_folio_uuid:
                uuid_encontrado = diccionario_folio_uuid[clave_busqueda]

        # Asignar resultado (si encontró uno nuevo, lo sobreescribe)
        if uuid_encontrado:
            df_filtrado.at[indice, col_L] = uuid_encontrado
        elif l_vacia:
            df_filtrado.at[indice, col_L] = "NO SE PAGO"

    # 5. RE-CALCULAR DUPLICADOS (Por si la búsqueda corrigió los falsos duplicados)
    df_filtrado['is_duplicated'] = False
    uuids_finales = df_filtrado[col_L].astype(str).str.strip().str.upper()
    facturas_finales = df_filtrado[col_F].apply(normalizar)
    montos_finales = df_filtrado[col_I].apply(normalizar_monto)
    fechas_finales = df_filtrado[col_D].apply(normalizar_fecha)
    claves_duplicados_final = uuids_finales + "|" + facturas_finales + "|" + montos_finales + "|" + fechas_finales

    mask_validos_final = (uuids_finales != "") & (~uuids_finales.isin(["NAN", "NONE", "NO SE PAGO"]))
    
    if mask_validos_final.any():
        duplicated_mask_final = claves_duplicados_final[mask_validos_final].duplicated(keep=False)
        df_filtrado.loc[mask_validos_final, 'is_duplicated'] = duplicated_mask_final

    # Para exportar, copiamos de vuelta las columnas que no eran A, C, F, L desde df_pagos 
    # para no perder el formato original si se normalizó algo que no se debía, pero en este caso df_filtrado
    # solo normalizó C, F, L que son IDs, y A que filtramos.
    
    return df_filtrado


def generar_reporte_discrepancias(df_resultado: pd.DataFrame) -> dict:
    if df_resultado.empty:
        return {"total_analizados": 0, "encontrados": 0, "no_pagados": 0}

    col_L = df_resultado.columns[11]
    
    uuids = df_resultado[col_L].astype(str).str.strip().str.upper()
    no_pagados = (uuids == "NO SE PAGO").sum()
    encontrados = (uuids != "NO SE PAGO") & (uuids != "") & (uuids != "NAN") & (uuids != "NONE")
    encontrados_count = encontrados.sum()
    
    return {
        "total_analizados": len(df_resultado),
        "encontrados": int(encontrados_count),
        "no_pagados": int(no_pagados),
    }
