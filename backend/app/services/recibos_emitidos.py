"""
Recibos Emitidos — Fase 1 de "Inteligencia de Negocio" dentro de Catálogo de
Productos (Restaurante): sube el reporte de cuentas cerradas con sus
totales financieros. Ver `models/recibo_emitido.py` para la advertencia
sobre el nombre de archivo compartido (sin relación) con el módulo de
Facturación.

El archivo trae encabezado real (20 columnas) pero, igual que Comandas
Emitidas, no es una tabla plana: cada cuenta real ("fila principal", con
`Cuenta` llena) puede venir seguida de una o más filas de "desglose por
tipo de producto" (`Tipo`=ALIMENTOS/BEBIDAS/etc. con solo `Subtotal Tipo
Producto` lleno, `Cuenta` y el resto vacíos) — confirmado contra archivo
real. `Cuenta` (o, equivalentemente, `Fecha`) llena es el criterio para
distinguir una fila principal; las de desglose se descartan por completo en
esta Fase 1 (no se necesita el desglose por tipo de producto todavía).

A diferencia de Comandas Emitidas, el turno NO se calcula aquí: se toma tal
cual de la columna `Turno` del archivo, ya clasificado por el POS
(`normalizar_turno_pos`).
"""

import zipfile
from datetime import date, datetime, time
from io import BytesIO

import pandas as pd

from app.services.cfdi_analysis import parse_float
from app.services.excel_headers import mapear_encabezados
from app.services.turnos import normalizar_turno_pos

COLUMNAS_ESPERADAS = [
    "POS", "Cuenta", "Factura", "Pagada", "Fecha", "Hora", "Turno", "Tipo",
    "Room Name", "#Cub.", "Subtotal", "Descuento", "Tax", "Room Serv.",
    "Servicio", "Propina", "TOTAL", "Subtotal Tipo Producto", "Segmento", "Clientes",
]

_COLUMNAS_MONETARIAS = [
    "Subtotal", "Descuento", "Tax", "Room Serv.", "Servicio", "Propina", "TOTAL", "Subtotal Tipo Producto",
]

_CAMPO_POR_COLUMNA = {
    "POS": "pos",
    "Cuenta": "cuenta",
    "Factura": "factura",
    "Pagada": "pagada",
    "Tipo": "tipo",
    "Room Name": "room_name",
    "Subtotal": "subtotal",
    "Descuento": "descuento",
    "Tax": "tax",
    "Room Serv.": "room_serv",
    "Servicio": "servicio",
    "Propina": "propina",
    "TOTAL": "total",
    "Subtotal Tipo Producto": "subtotal_tipo_producto",
    "Segmento": "segmento",
    "Clientes": "clientes",
}


async def leer_excel_recibos(file_content: bytes) -> pd.DataFrame:
    """Lee el Excel crudo (sin asumir encabezado en una fila fija), con fallback a xlrd para .xls."""
    try:
        df = pd.read_excel(BytesIO(file_content), header=None)
    except zipfile.BadZipFile:
        df = pd.read_excel(BytesIO(file_content), header=None, engine="xlrd")
    return df


def _texto_celda(valor) -> str | None:
    if pd.isna(valor):
        return None
    texto = str(valor).strip()
    return texto or None


def _parse_fecha(valor) -> date | None:
    if pd.isna(valor):
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    texto = str(valor).strip()
    for formato in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    return None


def _parse_hora(valor) -> time | None:
    if pd.isna(valor):
        return None
    if isinstance(valor, datetime):
        return valor.time()
    if isinstance(valor, time):
        return valor
    texto = str(valor).strip()
    for formato in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(texto, formato).time()
        except ValueError:
            continue
    return None


def _parse_num_cubiertos(valor) -> int | None:
    numero = parse_float(valor)
    return int(numero) if numero is not None else None


def _parse_monto(valor) -> float:
    """
    Como parse_float pero trata una celda vacía de Excel (NaN, un float)
    como 0.0 explícitamente — `parse_float(nan) or 0.0` NO basta, porque
    `nan` es "truthy" en Python (cualquier float distinto de 0.0 lo es,
    incluido NaN), así que el `or` nunca se activaba y dejaba `nan` crudo
    en columnas monetarias vacías (confirmado con archivo real: las filas
    de desglose por tipo de producto dejan `Subtotal Tipo Producto` vacío
    en la fila principal). Mismo tipo de problema que `_parse_monto` ya
    resuelve en `services/productos_vendidos.py`.
    """
    if pd.isna(valor):
        return 0.0
    resultado = parse_float(valor)
    return resultado if resultado is not None else 0.0


def parsear_recibos_emitidos(df: pd.DataFrame) -> list[dict]:
    """
    Recorre el DataFrame crudo, ubica las 20 columnas por nombre de
    encabezado, y regresa una fila por cuenta cerrada (`Cuenta` llena) —
    las filas de desglose por tipo de producto (`Cuenta` vacía) se
    descartan. `turno` se normaliza tal cual viene de la columna `Turno`
    del archivo (no se recalcula desde `Hora`).
    """
    if df.empty:
        raise ValueError("El archivo de Recibos Emitidos está vacío.")

    columnas = mapear_encabezados(df.iloc[0], COLUMNAS_ESPERADAS)
    faltantes = [nombre for nombre in COLUMNAS_ESPERADAS if nombre not in columnas]
    if faltantes:
        raise ValueError(
            "El archivo de Recibos Emitidos no tiene las columnas esperadas: " + ", ".join(faltantes)
        )

    registros: list[dict] = []
    for idx in range(1, len(df)):
        fila = df.iloc[idx]
        cuenta = _texto_celda(fila[columnas["Cuenta"]])
        if not cuenta:
            continue  # fila de desglose por tipo de producto, no una cuenta real

        fecha = _parse_fecha(fila[columnas["Fecha"]])
        if fecha is None:
            continue
        hora = _parse_hora(fila[columnas["Hora"]])
        if hora is None:
            continue

        registro = {
            "fecha": fecha,
            "hora": hora,
            "turno": normalizar_turno_pos(_texto_celda(fila[columnas["Turno"]])),
            "cuenta": cuenta,
            "num_cubiertos": _parse_num_cubiertos(fila[columnas["#Cub."]]),
            "fila_excel": idx + 1,
        }
        for nombre_columna, campo in _CAMPO_POR_COLUMNA.items():
            if nombre_columna == "Cuenta":
                continue
            valor = fila[columnas[nombre_columna]]
            if nombre_columna in _COLUMNAS_MONETARIAS:
                registro[campo] = _parse_monto(valor)
            else:
                registro[campo] = _texto_celda(valor)

        registros.append(registro)

    return registros
