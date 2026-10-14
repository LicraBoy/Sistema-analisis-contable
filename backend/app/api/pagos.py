from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form, Query
from fastapi.responses import StreamingResponse
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from io import BytesIO
import pandas as pd

from app.core.descargas import cabecera_descarga
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.cfdi_ingreso import CfdiIngreso
from app.models.historial_cambio_pago import HistorialCambioPago
from app.models.historial_eliminacion_pago import HistorialEliminacionPago
from app.models.pago import Pago, EstadoPago
from app.services.excel_processor import (
    leer_excel_pagos,
    leer_uuids_cancelados,
    leer_egresos,
    leer_egresos_todas_filas,
    generar_reporte_pagos_excel,
    generar_reporte_auditoria_excel,
    generar_texto_diot_desde_excel,
    COLUMNA_GRUPO_IVA_ACREDITABLE,
)
from app.services.cfdi_analysis import (
    procesar_logica_pagos,
    generar_reporte_discrepancias,
    normalizar,
    normalizar_monto,
    normalizar_fecha,
    normalizar_montos_fila,
    aplicar_override_tipo_cambio,
    parse_float,
)
from app.services.conciliacion_retenciones import conciliar_retencion, conciliar_iva_acreditable
from app.schemas.archivo import ProcesamientoStatus
from app.schemas.pago import PagoListResponse, PagoOut, PagoUpdate, ExportPagosRequest, UsdPreviewRequest

router = APIRouter()


@router.post("/upload")
async def upload_pagos(
    file: UploadFile = File(..., description="Archivo Excel de Pagos"),
    segunda_busqueda: bool = Form(True, description="Si es True, cruza contra BD de ingresos"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    content = await file.read()
    try:
        df = await leer_excel_pagos(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo Excel: {str(e)}")

    # 1. Obtener base de datos de ingresos para el cruce (Folio+Monto+Fecha -> UUID)
    ingresos_db_dict = {}
    if segunda_busqueda:
        stmt = select(CfdiIngreso)
        res = await db.execute(stmt)
        ingresos = res.scalars().all()

        for ing in ingresos:
            folio = ing.datos_extra.get("folio") if ing.datos_extra else None
            monto = ing.datos_extra.get("monto") if ing.datos_extra else ""
            fecha = ing.datos_extra.get("fecha") if ing.datos_extra else ""
            if folio:
                clave = normalizar(folio)
                ingresos_db_dict[clave] = ing.uuid

    # 2. Asegurar que la fecha sea parseada correctamente
    col_fecha = 3
    try:
        if not df.empty and len(df.columns) > col_fecha:
            df[col_fecha] = pd.to_datetime(df[col_fecha], errors='coerce', dayfirst=True)

        # 3. Procesar lógica de pagos (Primera y Segunda búsqueda)
        df_procesado = procesar_logica_pagos(df, ingresos_db_dict)
    except (IndexError, KeyError) as e:
        raise HTTPException(
            status_code=400,
            detail=(
                "El archivo de Pagos no tiene el formato de columnas esperado "
                "(se requieren al menos 12 columnas: tipo, fecha, factura, monto, UUID, etc.). "
                f"Verifica la estructura del archivo. Detalle técnico: {str(e)}"
            ),
        )
    
    # 4. Formatear la data resultante para exportarla como JSON y guardarla en la base de datos
    # Índices de columnas según especificación
    col_tipo = 0
    col_fecha_pago = 3
    col_factura = 5
    col_uuid = 11

    # ── Carga incremental: el archivo que se sube va CRECIENDO con el tiempo
    # (pagos viejos + nuevos agregados al final), no se reemplaza por
    # completo cada vez. Borrar todo y reinsertar (como se hacía antes)
    # perdía cualquier corrección manual hecha en el sistema (UUID corregido
    # en un "No Pagado", un duplicado resuelto) cada vez que se subía el
    # archivo actualizado. Ahora cada fila se identifica por una clave
    # NATURAL (Factura + Fecha + Monto) — deliberadamente SIN el UUID,
    # porque el UUID es justo lo que a veces se corrige a mano y no debe
    # decidir si una fila "ya existe". Si la clave ya está en la BD, esa
    # fila se deja intacta (no se toca ni se vuelve a insertar); solo se
    # guardan las filas genuinamente nuevas. ──
    res_existentes = await db.execute(select(Pago))
    pagos_existentes = res_existentes.scalars().all()

    def _clave_natural(factura: str, fecha_iso: str, monto: str) -> tuple[str, str, str]:
        return (normalizar(factura), fecha_iso, normalizar_monto(monto))

    claves_naturales_existentes: set[tuple[str, str, str]] = set()
    claves_completas_existentes: set[str] = set()
    for p in pagos_existentes:
        fecha_iso = p.fecha.isoformat() if p.fecha else ""
        monto_existente = (p.datos_extra or {}).get("8", "")
        claves_naturales_existentes.add(_clave_natural(p.factura, fecha_iso, monto_existente))
        uuid_existente = (p.uuid or "NO SE PAGO").strip().upper()
        claves_completas_existentes.add(
            f"{uuid_existente}|{normalizar(p.factura)}|{normalizar_monto(monto_existente)}|{fecha_iso}"
        )

    nuevos_insertados = 0
    ya_existian = 0

    for idx, row in df_procesado.iterrows():
        fecha_valor = row[col_fecha_pago]
        fecha_iso = fecha_valor.date().isoformat() if pd.notna(fecha_valor) else ""
        factura_val = str(row[col_factura]).strip()
        monto_val = row[8]  # Columna I = Monto (mismo índice fijo que procesar_logica_pagos)

        clave_natural = _clave_natural(factura_val, fecha_iso, monto_val)
        if clave_natural in claves_naturales_existentes:
            ya_existian += 1
            continue

        # Convertir fila completa en datos extra para no perder información
        datos_extra = {str(k): str(v) for k, v in row.items() if k not in [col_tipo, col_fecha_pago, col_factura, col_uuid] and pd.notna(v)}

        uuid_val = str(row[col_uuid]).strip()

        estado = EstadoPago.NO_PAGADO
        observaciones = ""
        is_dup = row.get('is_duplicated', False)

        clave_completa = (
            f"{(uuid_val or 'NO SE PAGO').strip().upper()}|{normalizar(factura_val)}|"
            f"{normalizar_monto(monto_val)}|{fecha_iso}"
        )

        if uuid_val == "NO SE PAGO":
            estado = EstadoPago.NO_PAGADO
            observaciones = "No se localizó el pago en Ingresos ni interna"
        elif is_dup or clave_completa in claves_completas_existentes:
            estado = EstadoPago.DUPLICADO
            observaciones = (
                "UUID repetido en este archivo" if is_dup
                else "UUID+Factura+Monto+Fecha ya registrados en un pago existente"
            )
        else:
            estado = EstadoPago.ENCONTRADO

        pago_db = Pago(
            tipo_movimiento=str(row[col_tipo]).strip(),
            fecha=fecha_valor.date() if pd.notna(fecha_valor) else None,
            factura=factura_val,
            uuid=uuid_val if uuid_val != "NO SE PAGO" else None,
            estado=estado,
            observaciones=observaciones,
            datos_extra=datos_extra,
        )
        db.add(pago_db)
        claves_naturales_existentes.add(clave_natural)
        claves_completas_existentes.add(clave_completa)
        nuevos_insertados += 1

    await db.commit()

    return {
        "message": f"{nuevos_insertados} pagos nuevos agregados, {ya_existian} ya existían y no se modificaron",
        "total": len(df_procesado),
        "nuevos": nuevos_insertados,
        "ya_existian": ya_existian,
    }


@router.post("/cancelados/parse")
async def parse_cancelados(
    file: UploadFile = File(..., description="Archivo Excel de UUID cancelados"),
    current_user: dict = Depends(get_current_user),
):
    """
    Lee un Excel de UUID cancelados y devuelve la lista encontrada, para que
    el frontend la reenvíe junto con la solicitud de exportación.
    """
    if not file.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    content = await file.read()
    try:
        cancelados = await leer_uuids_cancelados(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo Excel: {str(e)}")

    return {"cancelados": cancelados, "total": len(cancelados)}


@router.post("/egresos/parse")
async def parse_egresos(
    file: UploadFile = File(..., description="Archivo Excel de Egresos"),
    current_user: dict = Depends(get_current_user),
):
    """
    Lee un Excel de Egresos (notas de crédito) y devuelve los UUID
    relacionados con sus montos, para que el frontend los reenvíe junto con
    la solicitud de exportación.
    """
    if not file.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    content = await file.read()
    try:
        egresos = await leer_egresos(content)
        filas_todas = await leer_egresos_todas_filas(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo Excel: {str(e)}")

    return {"egresos": egresos, "total": len(egresos), "filas_todas": filas_todas}


_CAMPOS_EGRESO = ["Subtotal", "Total descuento", "Neto", "Retención IVA", "Retención ISR", "Traslado IVA", "Total"]


_FRONTERA_IVA = (0.10 + 0.041) / 2
_FRONTERA_ISR = (0.099 + 0.0126) / 2


def _clasificar_iva_isr_retenido(filas: list[dict]) -> None:
    """
    Clasifica (sin recalcular) la Retención IVA/ISR MXN ya calculada de cada
    fila en 2 buckets según la tasa efectiva aplicada. Usa el punto medio
    entre los umbrales reales (10.67%/4% para IVA, 10%/1.25% para ISR) como
    frontera, para que la suma de ambos buckets sea siempre exactamente
    igual a la retención original (sin "zona muerta" entre los dos umbrales).
    """
    for fila in filas:
        ret_iva = parse_float(fila.get("Retención IVA MXN")) or 0.0
        traslado_iva = parse_float(fila.get("Traslado IVA MXN"))
        pct_iva = (ret_iva / traslado_iva) * 0.16 if traslado_iva else 0.0
        if pct_iva >= _FRONTERA_IVA:
            fila["IVA RET 10%"], fila["IVA RET 4%"] = ret_iva, 0.0
        else:
            fila["IVA RET 10%"], fila["IVA RET 4%"] = 0.0, ret_iva

        ret_isr = parse_float(fila.get("Retención ISR MXN")) or 0.0
        neto_mxn = parse_float(fila.get("Neto MXN"))
        pct_isr = (ret_isr / neto_mxn) if neto_mxn else 0.0
        if pct_isr >= _FRONTERA_ISR:
            fila["ISR RET 10%"], fila["ISR RET 1.25 %"] = ret_isr, 0.0
        else:
            fila["ISR RET 10%"], fila["ISR RET 1.25 %"] = 0.0, ret_isr


def _calcular_desglose_iva(filas: list[dict]) -> None:
    """
    Reconstruye, a partir de Neto MXN y Traslado IVA MXN, qué parte de la
    base de cada factura estuvo gravada a 16% y cuál no generó IVA. EXCENTO
    es, por default, una columna de control que matemáticamente siempre da
    0 — salvo que la factura traiga "IVA Exento Manual" = verdadero en su
    datos_extra (marcado a mano por el usuario en el editor de Ingresos, ver
    IngresoEditModal.tsx — no hay forma de derivar "exento real" vs "tasa
    0%" automáticamente con los datos que se importan hoy). En ese caso,
    todo lo que no es TASA 16% se reclasifica de TASA 0% a EXCENTO. Esta es
    la única fuente de este cálculo — Amarre, Pre-DIOT y el .txt de la DIOT
    parten todos de aquí.
    """
    for fila in filas:
        neto_mxn = parse_float(fila.get("Neto MXN")) or 0.0
        traslado_iva = parse_float(fila.get("Traslado IVA MXN")) or 0.0
        tasa_16 = traslado_iva / 0.16
        exento_manual = str(fila.get("IVA Exento Manual", "")).strip().lower() in ("true", "1", "si", "sí")
        if exento_manual:
            tasa_0 = 0.0
            excento = neto_mxn - tasa_16
        else:
            tasa_0 = neto_mxn - tasa_16
            excento = neto_mxn - tasa_16 - tasa_0
        fila["TASA 16%"] = tasa_16
        fila["TASA 0%"] = tasa_0
        fila["EXCENTO"] = excento


async def _construir_filas_amarre(
    db: AsyncSession,
    estado: EstadoPago | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    factura: str | None = None,
    uuids_cancelados: set[str] | None = None,
    egresos: list[dict] | None = None,
) -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict], list[dict], list[dict], list[dict]]:
    """
    Construye lista_exportar (hoja Pagos), filas_amarre_principal y
    filas_amarre_banco (hoja Amarre), aplicando los mismos filtros que usa
    la exportación. Normaliza los montos de cada fila (str -> float real)
    para que las fórmulas de suma/comparativo del Excel funcionen. También
    devuelve filas_ingresos_todos: TODOS los CfdiIngreso de la BD (sin
    filtrar por si cruzan o no con Amarre), para la hoja "Ingresos Recibidos".
    """
    stmt = select(Pago)

    if estado:
        stmt = stmt.where(Pago.estado == estado)
    if fecha_desde:
        stmt = stmt.where(Pago.fecha >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(Pago.fecha <= fecha_hasta)
    if factura:
        stmt = stmt.where(Pago.factura.ilike(f"%{factura}%"))

    res = await db.execute(stmt)
    pagos = res.scalars().all()

    # Todos los pagos (sin filtrar), solo para saber qué UUID de Ingresos ya
    # "tienen pago" en cualquier mes — así no se marca por error como banco
    # un Ingreso cuyo pago cayó fuera del rango de fechas filtrado.
    res_todos_pagos = await db.execute(select(Pago.uuid).where(Pago.uuid != None))
    uuids_usados = {u.strip().lower() for (u,) in res_todos_pagos.all() if u}

    res_ingresos = await db.execute(select(CfdiIngreso))
    ingresos = res_ingresos.scalars().all()
    ingresos_por_uuid = {ing.uuid.strip().lower(): ing for ing in ingresos}

    filas_ingresos_todos = []
    for ing in ingresos:
        fila_ing = {
            "UUID": ing.uuid,
            "RFC emisor": ing.rfc_emisor or "",
            "Emisor": ing.nombre_emisor or "",
            "Régimen fiscal emisor": ing.regimen_fiscal_emisor or "",
            "Régimen fiscal receptor": ing.regimen_fiscal_receptor or "",
        }
        if ing.datos_extra:
            fila_ing.update(ing.datos_extra)
        normalizar_montos_fila(fila_ing)
        filas_ingresos_todos.append(fila_ing)

    lista_exportar = []
    filas_amarre_principal = []
    for p in pagos:
        extra = p.datos_extra or {}
        row_dict = {
            "Tipo Oper.": p.tipo_movimiento,
            "Fecha PAGO": str(p.fecha) if p.fecha else "",
            "Factura (F)": p.factura,
            "UUID (L)": p.uuid if p.uuid else ("NO SE PAGO" if p.estado == EstadoPago.NO_PAGADO else ""),
            "Tipo Doc.": extra.get("1", ""),
            "NUMERO DE CHEQUE": extra.get("2", ""),
            "FECHA FACTURA": extra.get("6", ""),
            "DEBE(MONTO TOTAL DE LA FACTURA)": extra.get("8", ""),
        }
        lista_exportar.append(row_dict)

        fila_amarre = dict(row_dict)
        uuid_lower = p.uuid.strip().lower() if p.uuid else None
        ingreso = ingresos_por_uuid.get(uuid_lower) if uuid_lower else None
        if ingreso and ingreso.datos_extra:
            fila_amarre.update(ingreso.datos_extra)
        normalizar_montos_fila(fila_amarre)
        filas_amarre_principal.append(fila_amarre)

    # Filas de banco: Ingresos sin pago (en cualquier mes) emitidos por un banco,
    # acotadas al mismo rango de fechas que se aplicó a Pagos (si hay filtro).
    filas_amarre_banco = []
    for ing in ingresos:
        uuid_lower = ing.uuid.strip().lower()
        if uuid_lower in uuids_usados:
            continue
        emisor = ing.nombre_emisor or (ing.datos_extra.get("Emisor") if ing.datos_extra else "") or ""
        emisor_upper = emisor.upper()
        if "BANCO" not in emisor_upper and "BANK" not in emisor_upper:
            continue

        fecha_expedicion_raw = ing.datos_extra.get("Fecha expedición", "") if ing.datos_extra else ""
        if fecha_desde or fecha_hasta:
            fecha_norm = normalizar_fecha(fecha_expedicion_raw)
            if fecha_desde and (not fecha_norm or fecha_norm < fecha_desde.isoformat()):
                continue
            if fecha_hasta and (not fecha_norm or fecha_norm > fecha_hasta.isoformat()):
                continue

        fila_banco = {"UUID": ing.uuid}
        if ing.datos_extra:
            fila_banco.update(ing.datos_extra)

        iva = fila_banco.get("Traslado IVA")
        try:
            if float(iva) == 0:
                continue
        except (TypeError, ValueError):
            continue

        normalizar_montos_fila(fila_banco)

        # Las filas de banco no tienen un Pago que las cruce, así que nunca
        # traen un DEBE real; se usa Total MXN como valor de comparación
        # para que la columna no quede vacía.
        if not fila_banco.get("DEBE(MONTO TOTAL DE LA FACTURA)"):
            fila_banco["DEBE(MONTO TOTAL DE LA FACTURA)"] = fila_banco.get("Total MXN", "")

        filas_amarre_banco.append(fila_banco)

    def _uuid_de(fila: dict) -> str:
        return str(fila.get("UUID (L)") or fila.get("UUID") or "").strip().lower()

    filas_canceladas: list[dict] = []
    if uuids_cancelados:
        filas_canceladas = [f for f in filas_amarre_principal if _uuid_de(f) in uuids_cancelados]
        filas_canceladas += [f for f in filas_amarre_banco if _uuid_de(f) in uuids_cancelados]
        filas_amarre_principal = [f for f in filas_amarre_principal if _uuid_de(f) not in uuids_cancelados]
        filas_amarre_banco = [f for f in filas_amarre_banco if _uuid_de(f) not in uuids_cancelados]

    filas_con_egresos: list[dict] = []
    if egresos:
        acumulado: dict[str, dict[str, float]] = {}
        for eg in egresos:
            uuid_eg = str(eg.get("uuid", "")).strip().lower()
            if not uuid_eg:
                continue
            acumulado.setdefault(uuid_eg, {campo: 0.0 for campo in _CAMPOS_EGRESO})
            for campo in _CAMPOS_EGRESO:
                try:
                    acumulado[uuid_eg][campo] += float(eg.get(campo) or 0)
                except (TypeError, ValueError):
                    pass

        for fila in filas_amarre_principal + filas_amarre_banco:
            uuid_val = _uuid_de(fila)
            montos_egreso = acumulado.get(uuid_val)
            if not montos_egreso:
                continue

            filas_con_egresos.append({
                "Emisor": fila.get("Emisor", ""),
                "Factura (F)": fila.get("Factura (F)", ""),
                "UUID": uuid_val,
                **{campo: fila.get(campo, 0) for campo in _CAMPOS_EGRESO},
            })

            for campo in ["Subtotal", "Total descuento", "Neto", "Retención IVA", "Retención ISR", "Traslado IVA"]:
                valor_egreso = montos_egreso[campo]
                if valor_egreso:
                    fila[campo] = (fila.get(campo) or 0) - valor_egreso
                    fila[f"{campo} MXN"] = (fila.get(f"{campo} MXN") or 0) - valor_egreso

            valor_total_egreso = montos_egreso["Total"]
            if valor_total_egreso:
                # NO se toca DEBE(MONTO TOTAL DE LA FACTURA): ese valor es el
                # monto que el banco/contador ya registró como efectivamente
                # pagado, que normalmente YA viene neto de la nota de crédito
                # (el usuario paga lo que le queda por pagar, no el total
                # original del CFDI). Restarle el egreso otra vez lo reducía
                # dos veces, abriendo una diferencia artificial contra Total
                # MXN que disparaba la recalculación PPD de abajo y fabricaba
                # un Traslado IVA que no existe en ningún documento real (caso
                # real: SIGMA FOODSERVICE COMERCIAL, IVA fantasma de
                # $4,772.42 sobre una factura con Traslado IVA = 0.00).
                fila["Total"] = (fila.get("Total") or 0) - valor_total_egreso
                fila["Total MXN"] = (fila.get("Total MXN") or 0) - valor_total_egreso

    # Pagos parciales (PPD): cuando la fila muestra una diferencia > $1 entre
    # DEBE y Total MXN (el CFDI es de pago en parcialidades y trae el monto
    # total de la factura, pero el Pago registrado es solo la parcialidad de
    # ese mes), se recalculan Total/Subtotal/Neto/Traslado IVA a partir del
    # DEBE (el monto real pagado), dejando Saldo de la factura y Total
    # descuento intactos. Se guarda un snapshot "antes" para la evidencia en
    # la hoja Diferencias.
    _CAMPOS_PPD_SNAPSHOT = [
        "DEBE(MONTO TOTAL DE LA FACTURA)", "Total", "Total MXN",
        "Subtotal", "Subtotal MXN", "Total descuento", "Total descuento MXN",
        "Neto", "Neto MXN", "Traslado IVA", "Traslado IVA MXN",
    ]

    # ── Detectar "cruce de cheque": 2 pagos PPD con el mismo NUMERO DE
    # CHEQUE cuyo DEBE está intercambiado entre sí (el DEBE de cada uno
    # coincide con el Total MXN del OTRO). No son pagos parciales — son 2
    # pagos completos mal emparejados en el archivo de origen. Aplicarles el
    # recálculo de PPD de todos modos fabrica un Traslado IVA que no existe
    # en ningún documento real (caso real: DISTRIBUIDORA ARCA CONTINENTAL,
    # 2 complementos del mismo cheque con los montos al revés). Se detectan
    # ANTES del recálculo para excluirlas de él y reportarlas aparte. ──
    candidatas_ppd = []
    for fila in filas_amarre_principal + filas_amarre_banco:
        metodo_pago = str(fila.get("Método de pago", "")).strip().upper()
        if metodo_pago != "PPD":
            continue
        debe = parse_float(fila.get("DEBE(MONTO TOTAL DE LA FACTURA)"))
        total_mxn = parse_float(fila.get("Total MXN"))
        if debe is None or total_mxn is None or abs(debe - total_mxn) <= 1:
            continue
        candidatas_ppd.append((fila, debe, total_mxn))

    filas_cruzadas_id = set()
    filas_posible_cruce: list[dict] = []
    grupos_por_cheque: dict[str, list[tuple[dict, float, float]]] = {}
    for candidata in candidatas_ppd:
        cheque = str(candidata[0].get("NUMERO DE CHEQUE", "")).strip()
        if not cheque:
            continue
        grupos_por_cheque.setdefault(cheque, []).append(candidata)

    for cheque, candidatas in grupos_por_cheque.items():
        if len(candidatas) != 2:
            continue
        (fila_a, debe_a, total_a), (fila_b, debe_b, total_b) = candidatas
        if abs(debe_b - total_a) <= 1 and abs(debe_a - total_b) <= 1:
            for fila, debe, total_mxn in (candidatas[0], candidatas[1]):
                filas_cruzadas_id.add(id(fila))
                filas_posible_cruce.append({
                    "Emisor": fila.get("Emisor", ""),
                    "Factura (F)": fila.get("Factura (F)", ""),
                    "Fecha expedición": fila.get("Fecha expedición", ""),
                    "UUID": _uuid_de(fila),
                    "NUMERO DE CHEQUE": cheque,
                    "DEBE(MONTO TOTAL DE LA FACTURA)": debe,
                    "Total MXN": total_mxn,
                })

    filas_ppd_ajustadas: list[dict] = []
    for fila, debe, total_mxn in candidatas_ppd:
        if id(fila) in filas_cruzadas_id:
            continue

        filas_ppd_ajustadas.append({
            "Emisor": fila.get("Emisor", ""),
            "Factura (F)": fila.get("Factura (F)", ""),
            "Fecha expedición": fila.get("Fecha expedición", ""),
            "UUID": _uuid_de(fila),
            **{campo: fila.get(campo, 0) for campo in _CAMPOS_PPD_SNAPSHOT},
        })

        subtotal = debe / 1.16
        traslado_iva = debe - subtotal

        fila["Total"] = debe
        fila["Total MXN"] = debe
        fila["Subtotal"] = subtotal
        fila["Subtotal MXN"] = subtotal
        fila["Neto"] = subtotal
        fila["Neto MXN"] = subtotal
        fila["Traslado IVA"] = traslado_iva
        fila["Traslado IVA MXN"] = traslado_iva

    return (
        lista_exportar,
        filas_amarre_principal,
        filas_amarre_banco,
        filas_canceladas,
        filas_con_egresos,
        filas_ppd_ajustadas,
        filas_posible_cruce,
        filas_ingresos_todos,
    )


# ── IMPORTANT: /export, /export/usd-preview y /diot/export MUST be defined BEFORE /{archivo_id}/status ──
# Otherwise FastAPI matches "export"/"diot" as an archivo_id parameter.

@router.post("/export/usd-preview")
async def export_pagos_usd_preview(
    body: UsdPreviewRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Devuelve las filas de la hoja Amarre cuya Moneda es USD, para que el
    usuario pueda revisar/editar su tipo de cambio antes de exportar.
    """
    uuids_cancelados = {u.strip().lower() for u in body.uuids_cancelados if u.strip()}
    _, filas_amarre_principal, _, _, _, _, _, _ = await _construir_filas_amarre(
        db,
        fecha_desde=body.fecha_desde,
        fecha_hasta=body.fecha_hasta,
        uuids_cancelados=uuids_cancelados,
        egresos=body.egresos,
    )

    filas_usd = []
    for fila in filas_amarre_principal:
        moneda = str(fila.get("Moneda", "")).strip().upper()
        if moneda != "USD":
            continue
        # El tipo de cambio "correcto" se deriva de lo realmente pagado
        # (DEBE, de Pagos) entre el monto en USD (Total, de Ingresos), en
        # vez de confiar en el campo "Tipo cambio" declarado en el CFDI.
        debe = fila.get("DEBE(MONTO TOTAL DE LA FACTURA)")
        total = fila.get("Total")
        if isinstance(debe, (int, float)) and isinstance(total, (int, float)) and total != 0:
            tipo_cambio_calculado = debe / total
        else:
            tipo_cambio_calculado = fila.get("Tipo cambio")

        filas_usd.append({
            "uuid": fila.get("UUID (L)") or fila.get("UUID") or "",
            "factura": fila.get("Factura (F)", ""),
            "emisor": fila.get("Emisor", ""),
            "fecha_expedicion": fila.get("Fecha expedición", ""),
            "tipo_cambio": tipo_cambio_calculado,
            "total": fila.get("Total"),
            "total_mxn": fila.get("Total MXN"),
        })

    return filas_usd


@router.post("/diot/export-from-excel")
async def export_diot_from_excel(
    archivo: UploadFile = File(..., description="Reporte_Pagos.xlsx exportado por el sistema, con Amarre/Pre-DIOT ya corregidos y guardados con Excel real"),
    current_user: dict = Depends(get_current_user),
):
    """
    'Paso 2' del flujo DIOT: a diferencia de /diot/export (que recalcula
    todo desde la base de datos cada vez), este endpoint recibe de vuelta
    el mismo Reporte_Pagos que el sistema ya generó, después de que
    contabilidad corrigió a mano alguna celda de Amarre y volvió a GUARDAR
    el archivo con Excel/LibreOffice real (para que las fórmulas SUMIF de
    Pre-DIOT recalculen). Arma el .txt a partir de esos valores ya
    corregidos, sin tocar la base de datos — ver
    generar_texto_diot_desde_excel en excel_processor.py.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()
    try:
        texto_diot = generar_texto_diot_desde_excel(contenido)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return StreamingResponse(
        BytesIO(texto_diot.encode("utf-8")),
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=DIOT.txt"},
    )


@router.post("/export")
async def export_pagos(
    body: ExportPagosRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Exportar pagos filtrados a un archivo Excel descargable.
    """
    uuids_cancelados = {u.strip().lower() for u in body.uuids_cancelados if u.strip()}
    (
        lista_exportar,
        filas_amarre_principal,
        filas_amarre_banco,
        filas_canceladas,
        filas_con_egresos,
        filas_ppd_ajustadas,
        filas_posible_cruce,
        filas_ingresos_todos,
    ) = await _construir_filas_amarre(
        db,
        estado=body.estado,
        fecha_desde=body.fecha_desde,
        fecha_hasta=body.fecha_hasta,
        factura=body.factura,
        uuids_cancelados=uuids_cancelados,
        egresos=body.egresos,
    )

    if body.tipo_cambio_overrides:
        overrides = {k.strip().lower(): v for k, v in body.tipo_cambio_overrides.items()}
        for fila in filas_amarre_principal + filas_amarre_banco:
            uuid_val = str(fila.get("UUID (L)") or fila.get("UUID") or "").strip().lower()
            if uuid_val in overrides:
                aplicar_override_tipo_cambio(fila, overrides[uuid_val])

    _clasificar_iva_isr_retenido(filas_amarre_principal + filas_amarre_banco)
    _calcular_desglose_iva(filas_amarre_principal + filas_amarre_banco)

    filas_cancelados_todos = body.cancelados_detalle
    filas_egresos_todos = body.egresos_filas_todas or body.egresos

    filas_amarre_completas = filas_amarre_principal + filas_amarre_banco
    _retenciones_a_conciliar = [
        ("IVA RET 10%", body.retencion_iva10_archivo),
        ("IVA RET 4%", body.retencion_iva4_archivo),
        ("ISR RET 10%", body.retencion_isr10_archivo),
        ("ISR RET 1.25 %", body.retencion_isr125_archivo),
    ]
    resultados_conciliacion_retenciones = [
        (
            columna_amarre,
            conciliar_retencion(filas_amarre_completas, archivo, body.fecha_desde, body.fecha_hasta, columna_amarre),
        )
        for columna_amarre, archivo in _retenciones_a_conciliar
        if archivo
    ]

    filas_diferencia_retenciones = [
        {
            "Retención": nombre_columna,
            "Monto (Amarre)": r["total_amarre"],
            "Monto (Auxiliar de Retenciones)": r["total_archivo"],
            "Diferencia": round(r["total_amarre"] - r["total_archivo"], 2),
        }
        for nombre_columna, r in resultados_conciliacion_retenciones
    ] or None

    filas_comparacion_iva_acreditable = None
    filas_detalle_iva_acreditable = None
    if body.iva_acreditable_archivo:
        resultado_iva_acreditable = conciliar_iva_acreditable(
            filas_amarre_completas, body.iva_acreditable_archivo, body.fecha_desde, body.fecha_hasta,
        )
        filas_comparacion_iva_acreditable = resultado_iva_acreditable["comparacion"]
        filas_detalle_iva_acreditable = resultado_iva_acreditable["detalle_archivo"]
        # Etiqueta cada fila de Amarre con el proveedor al que se sumó en la
        # comparación de IVA acreditable — la hoja IVA Acreditable la usa como
        # criterio de SUMIF, así corregir Traslado IVA MXN en Amarre se refleja
        # ahí sin regenerar.
        for fila_comparacion in filas_comparacion_iva_acreditable:
            for indice in fila_comparacion["filas_amarre_idx"]:
                filas_amarre_completas[indice][COLUMNA_GRUPO_IVA_ACREDITABLE] = fila_comparacion["emisor"]

    filename = body.filename
    if not filename.endswith(".xlsx"):
        filename += ".xlsx"

    excel_bytes = await generar_reporte_pagos_excel(
        lista_exportar,
        filas_amarre_principal,
        filas_amarre_banco,
        filas_canceladas,
        filas_con_egresos,
        filas_ppd_ajustadas,
        filas_posible_cruce,
        filas_ingresos_todos,
        filas_cancelados_todos,
        filas_egresos_todos,
        resultados_conciliacion_retenciones,
        filas_comparacion_iva_acreditable,
        filas_detalle_iva_acreditable,
        filas_diferencia_retenciones,
        body.fecha_desde,
        body.fecha_hasta,
    )

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=cabecera_descarga(filename)
    )


@router.get("/auditoria/export")
async def export_auditoria(
    fecha_desde: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    fecha_hasta: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Exporta el reporte de auditoría: cambios manuales de UUID (viejo/nuevo/
    motivo) y pagos eliminados (incluye los borrados por duplicados), en un
    solo Excel de 2 hojas.
    """
    # ── Cambios de UUID ──
    # Se filtra por fecha_pago (la fecha de la FACTURA/PAGO corregido), no por
    # fecha_cambio (el momento en que se hizo clic, que casi siempre es "hoy").
    # Un registro sin fecha_pago (dato viejo sin backfill, o pago sin fecha)
    # nunca se excluye — mejor mostrarlo que ocultarlo en silencio.
    stmt_hist = select(HistorialCambioPago).order_by(HistorialCambioPago.fecha_cambio.desc())
    if fecha_desde:
        stmt_hist = stmt_hist.where(or_(HistorialCambioPago.fecha_pago == None, HistorialCambioPago.fecha_pago >= fecha_desde))
    if fecha_hasta:
        stmt_hist = stmt_hist.where(or_(HistorialCambioPago.fecha_pago == None, HistorialCambioPago.fecha_pago <= fecha_hasta))
    res_hist = await db.execute(stmt_hist)
    cambios = res_hist.scalars().all()
    filas_cambios = [
        {
            "Fecha del pago": c.fecha_pago.isoformat() if c.fecha_pago else "",
            "Fecha del cambio": c.fecha_cambio.isoformat() if c.fecha_cambio else "",
            "Factura": c.factura_nuevo or c.factura_anterior or "",
            "UUID anterior": c.uuid_anterior or "",
            "UUID nuevo": c.uuid_nuevo or "",
            "Motivo": c.motivo,
        }
        for c in cambios
    ]

    # ── Eliminados (incluye los duplicados que se borraron) ──
    # Mismo criterio: se filtra por fecha_pago (la fecha del pago eliminado),
    # no por fecha_eliminacion (el momento del clic). Sin fecha_pago, no se excluye.
    stmt_elim = select(HistorialEliminacionPago).order_by(HistorialEliminacionPago.fecha_eliminacion.desc())
    if fecha_desde:
        stmt_elim = stmt_elim.where(or_(HistorialEliminacionPago.fecha_pago == None, HistorialEliminacionPago.fecha_pago >= fecha_desde))
    if fecha_hasta:
        stmt_elim = stmt_elim.where(or_(HistorialEliminacionPago.fecha_pago == None, HistorialEliminacionPago.fecha_pago <= fecha_hasta))
    res_elim = await db.execute(stmt_elim)
    eliminados = res_elim.scalars().all()
    filas_eliminados = [
        {
            "Fecha del pago": e.fecha_pago.isoformat() if e.fecha_pago else "",
            "Fecha de eliminación": e.fecha_eliminacion.isoformat() if e.fecha_eliminacion else "",
            "Tipo Oper.": e.tipo_movimiento or "",
            "Factura": e.factura or "",
            "UUID": e.uuid or "",
            "Estado": e.estado or "",
            "Monto": e.monto or "",
            "Motivo": e.motivo,
        }
        for e in eliminados
    ]

    excel_bytes = await generar_reporte_auditoria_excel(filas_cambios, filas_eliminados)

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Reporte_Auditoria.xlsx"}
    )


@router.get("", response_model=PagoListResponse)
async def list_pagos(
    estado: EstadoPago | None = Query(None, description="Filtrar por estado"),
    fecha_desde: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    fecha_hasta: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    factura: str | None = Query(None, description="Buscar por número de factura"),
    sin_amarre: bool = Query(False, description="Si es True, solo pagos sin match en Ingresos (los que saldrían sin localizar en el Amarre)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PagoListResponse:
    stmt = select(Pago)

    # Aplicar filtros
    if estado:
        stmt = stmt.where(Pago.estado == estado)
    if fecha_desde:
        stmt = stmt.where(Pago.fecha >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(Pago.fecha <= fecha_hasta)
    if factura:
        stmt = stmt.where(Pago.factura.ilike(f"%{factura}%"))

    if sin_amarre:
        # No se puede paginar en SQL: hay que filtrar contra el set de UUID de
        # Ingresos en Python (mismo patrón que ya usa export_pagos/uuid_verificado).
        res_todos = await db.execute(stmt)
        todos = res_todos.scalars().all()

        res_ing = await db.execute(select(func.lower(CfdiIngreso.uuid)))
        ingresos_uuids = {u for (u,) in res_ing.all()}

        pagos_filtrados = [p for p in todos if not p.uuid or p.uuid.strip().lower() not in ingresos_uuids]
        total = len(pagos_filtrados)
        start = (page - 1) * page_size
        pagos = pagos_filtrados[start:start + page_size]
    else:
        # Obtener el total antes de paginar
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0

        # Paginar
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        res = await db.execute(stmt)
        pagos = res.scalars().all()

    # Un pago "Encontrado" puede traer un UUID que ya venía en el Excel original
    # sin nunca haberse verificado contra Ingresos — se marca aquí para poder
    # distinguirlo en la UI sin tocar el estado guardado en la base de datos.
    uuids_pago = {p.uuid.strip().lower() for p in pagos if p.uuid}
    ingresos_existentes = set()
    if uuids_pago:
        res_ing = await db.execute(
            select(func.lower(CfdiIngreso.uuid)).where(func.lower(CfdiIngreso.uuid).in_(uuids_pago))
        )
        ingresos_existentes = {u for (u,) in res_ing.all()}

    items = []
    for p in pagos:
        uuid_verificado = True
        if p.estado == EstadoPago.ENCONTRADO and p.uuid:
            uuid_verificado = p.uuid.strip().lower() in ingresos_existentes
        items.append(PagoOut(
            id=p.id,
            tipo_movimiento=p.tipo_movimiento,
            fecha=p.fecha,
            factura=p.factura,
            uuid=p.uuid,
            estado=p.estado,
            observaciones=p.observaciones,
            datos_extra=p.datos_extra,
            archivo_id=p.archivo_id or 0,
            created_at=p.created_at.isoformat(),
            uuid_verificado=uuid_verificado,
        ))

    return PagoListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{archivo_id}/status", response_model=ProcesamientoStatus)
async def get_processing_status(
    archivo_id: int,
    current_user: dict = Depends(get_current_user),
) -> ProcesamientoStatus:
    """
    Consultar el estado del procesamiento de un archivo de pagos.

    TODO: Consultar la tabla archivos_procesados y devolver el estado real.
    """
    from app.models.archivo_procesado import EstadoProcesamiento

    return ProcesamientoStatus(
        archivo_id=archivo_id,
        estado=EstadoProcesamiento.PENDIENTE,
        total_registros=0,
        uuid_encontrados=0,
        uuid_no_encontrados=0,
        mensaje_error=None,
        progreso_porcentaje=0.0,
    )


@router.patch("/{id}", response_model=PagoOut)
async def update_pago(
    id: int,
    pago_in: PagoUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualizar un registro de pago, por ejemplo para asignarle manualmente un UUID.
    """
    stmt = select(Pago).where(Pago.id == id)
    res = await db.execute(stmt)
    pago = res.scalars().first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    uuid_anterior = pago.uuid
    factura_anterior = pago.factura

    if pago_in.tipo_movimiento is not None:
        pago.tipo_movimiento = pago_in.tipo_movimiento.strip()

    if pago_in.factura is not None:
        pago.factura = pago_in.factura.strip()

    if pago_in.fecha is not None:
        pago.fecha = pago_in.fecha

    if pago_in.uuid is not None:
        pago.uuid = pago_in.uuid.strip()
        # Automáticamente marcar como ENCONTRADO si se suministra un UUID válido
        if pago.uuid and pago.uuid != "NO SE PAGO":
            pago.estado = EstadoPago.ENCONTRADO
            pago.observaciones = "UUID actualizado manualmente"

        if pago.uuid != uuid_anterior:
            db.add(HistorialCambioPago(
                pago_id=pago.id,
                uuid_anterior=uuid_anterior,
                uuid_nuevo=pago.uuid,
                factura_anterior=factura_anterior,
                factura_nuevo=pago.factura,
                fecha_pago=pago.fecha,
                motivo=pago_in.motivo.strip() if pago_in.motivo else "UUID actualizado manualmente",
            ))

    if pago_in.estado is not None:
        pago.estado = pago_in.estado

    await db.commit()
    await db.refresh(pago)

    return pago


@router.delete("/{id}")
async def delete_pago(
    id: int,
    motivo: str = Query(..., min_length=1, description="Motivo de la eliminación, para el reporte de auditoría"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Eliminar un registro de pago (ej. si está duplicado y es incorrecto).
    Antes de borrarlo, guarda una foto de sus datos en
    HistorialEliminacionPago para el reporte de auditoría.
    """
    stmt = select(Pago).where(Pago.id == id)
    res = await db.execute(stmt)
    pago = res.scalars().first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    extra = pago.datos_extra or {}
    db.add(HistorialEliminacionPago(
        pago_id_original=pago.id,
        tipo_movimiento=pago.tipo_movimiento,
        factura=pago.factura,
        uuid=pago.uuid,
        fecha_pago=pago.fecha,
        estado=pago.estado.value,
        monto=str(extra.get("8", "")),
        motivo=motivo.strip(),
    ))

    await db.delete(pago)
    await db.commit()

    return {"message": "Pago eliminado correctamente"}
