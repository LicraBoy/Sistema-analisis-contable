"""
Ingresos router — upload Excel de Ingresos Recibidos.
"""

import math
from io import BytesIO

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.future import select

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.cfdi_ingreso import CfdiIngreso
from app.schemas.ingreso import UploadResponse, IngresoOut, IngresoUpdate
from app.services.excel_processor import leer_excel_ingresos, exportar_resultados_excel
from app.services.cfdi_analysis import analizar_ingresos_recibidos, normalizar, normalizar_monto, normalizar_fecha

router = APIRouter()

@router.get("")
async def list_ingresos(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    buscar: str = Query(None, description="Buscar por folio, UUID, RFC o nombre del emisor"),
    current_user: dict = Depends(get_current_user),
):
    stmt = select(CfdiIngreso)
    res = await db.execute(stmt)
    ingresos = res.scalars().all()

    buscar_lower = buscar.strip().lower() if buscar else None
    items = []
    for ing in ingresos:
        if buscar_lower:
            folio = str(ing.datos_extra.get("folio", "")) if ing.datos_extra else ""
            campos = [ing.uuid, ing.rfc_emisor or "", ing.nombre_emisor or "", folio]
            if not any(buscar_lower in str(c).lower() for c in campos):
                continue
        items.append({
            "id": ing.id,
            "uuid": ing.uuid,
            "rfc_emisor": ing.rfc_emisor,
            "nombre_emisor": ing.nombre_emisor,
            "folio": ing.datos_extra.get("folio") if ing.datos_extra else None,
            "monto": ing.datos_extra.get("monto") if ing.datos_extra else None,
            "fecha": ing.datos_extra.get("fecha") if ing.datos_extra else None,
        })

    total = len(items)
    start = (page - 1) * page_size
    paginated = items[start:start + page_size]
    return {
        "data": paginated,
        "meta": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": math.ceil(total / page_size) if total else 1,
        },
    }

@router.get("/buscar-coincidencia")
async def buscar_coincidencia(
    folio: str = Query(None, description="Factura del pago a buscar (opcional)"),
    monto: str = Query(None, description="Monto del pago (sin normalizar)"),
    fecha: str = Query(None, description="Fecha principal del pago (YYYY-MM-DD)"),
    fecha_alt: str = Query(None, description="Fecha alterna del pago (cualquier formato, se normaliza)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    stmt = select(CfdiIngreso)
    res = await db.execute(stmt)
    ingresos = res.scalars().all()

    folio_norm = normalizar(folio) if folio else None
    monto_norm = normalizar_monto(monto) if monto else None
    fecha_alt_norm = normalizar_fecha(fecha_alt) if fecha_alt else None

    candidatos = []
    for ing in ingresos:
        ing_folio = normalizar(ing.datos_extra.get("folio", "")) if ing.datos_extra else ""
        ing_monto = ing.datos_extra.get("monto") if ing.datos_extra else None
        ing_fecha = ing.datos_extra.get("fecha") if ing.datos_extra else None

        if folio_norm:
            # Modo normal: buscar por factura, monto decide la coincidencia exacta.
            # La fecha del Ingreso es la de expedición del CFDI, no la del pago —
            # casi nunca coinciden exacto, así que no se exige para el match.
            if ing_folio != folio_norm:
                continue
            coincide = bool(monto_norm) and ing_monto == monto_norm
        else:
            # Modo "No Pagado": sin factura confiable, buscar por monto exacto +
            # que la fecha del Ingreso coincida con cualquiera de las 2 fechas del pago.
            if not monto_norm or ing_monto != monto_norm:
                continue
            coincide = bool(
                (fecha and ing_fecha == fecha) or (fecha_alt_norm and ing_fecha == fecha_alt_norm)
            )
            if not coincide:
                continue

        candidatos.append({
            "uuid": ing.uuid,
            "folio": ing.datos_extra.get("folio") if ing.datos_extra else None,
            "monto": ing_monto,
            "fecha": ing_fecha,
            "rfc_emisor": ing.rfc_emisor,
            "nombre_emisor": ing.nombre_emisor,
            "coincide_exacto": coincide,
        })

    # Coincidencias exactas primero
    candidatos.sort(key=lambda c: not c["coincide_exacto"])
    return {"candidatos": candidatos}

@router.get("/export")
async def export_ingresos(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    stmt = select(CfdiIngreso)
    res = await db.execute(stmt)
    ingresos = res.scalars().all()

    lista_exportar = []
    for ing in ingresos:
        lista_exportar.append({
            "Folio": ing.datos_extra.get("folio") if ing.datos_extra else None,
            "Monto": ing.datos_extra.get("monto") if ing.datos_extra else None,
            "Fecha": ing.datos_extra.get("fecha") if ing.datos_extra else None,
            "RFC Emisor": ing.rfc_emisor,
            "Emisor": ing.nombre_emisor,
            "UUID": ing.uuid,
        })

    excel_bytes = await exportar_resultados_excel(lista_exportar, "Ingresos")

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Ingresos_Recibidos.xlsx"}
    )

@router.post("/upload", response_model=UploadResponse)
async def upload_ingresos(
    file: UploadFile = File(..., description="Archivo Excel de Ingresos Recibidos"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadResponse:
    if not file.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    content = await file.read()
    try:
        df = await leer_excel_ingresos(content)
        resultado = analizar_ingresos_recibidos(df)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Insertar en BD en lotes (para no exceder el límite de parámetros por sentencia
    # de SQLite con archivos grandes). Si un UUID ya existe, se ignora esa fila —
    # nunca se reemplazan datos que ya están guardados.
    records = resultado.get("data", [])
    CHUNK_SIZE = 500
    try:
        for i in range(0, len(records), CHUNK_SIZE):
            lote = records[i:i + CHUNK_SIZE]
            stmt = insert(CfdiIngreso).values(lote)
            stmt = stmt.on_conflict_do_nothing(index_elements=['uuid'])
            await db.execute(stmt)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al guardar los ingresos en la base de datos: {str(e)}")

    return UploadResponse(
        archivo_id=0, # No usamos archivo_procesado para ingresos por simplicidad ahora
        nombre_archivo=file.filename,
        total_registros=resultado.get("total_procesados", 0),
        mensaje=f"Procesados {resultado.get('total_procesados', 0)} registros. Duplicados ignorados: {resultado.get('duplicados', 0)}.",
    )

@router.post("/reporte-601")
async def reporte_601(
    file: UploadFile = File(..., description="Archivo Excel de Ingresos Recibidos"),
    current_user: dict = Depends(get_current_user),
):
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    import pandas as pd
    import re
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    if not file.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    content = await file.read()
    try:
        # Leer SOLO la primera hoja del Excel
        df = pd.read_excel(BytesIO(content), sheet_name=0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer Excel: {str(e)}")

    df_clean = df.copy()
    
    # 1. Encontrar la columna "Régimen Fiscal Receptor"
    receptor_col = None
    receptor_pattern = re.compile(r'^r[eé]gimen\s+fiscal\s+receptor$', re.IGNORECASE)
    
    for c in df_clean.columns:
        c_str = str(c).strip()
        if receptor_pattern.match(c_str):
            receptor_col = c
            break

    if not receptor_col:
        raise HTTPException(status_code=400, detail="El archivo no contiene la columna 'Régimen Fiscal Receptor'.")
    
    # 2. Convertir a string y filtrar los que NO comiencen con "601"
    # Convertimos todo a string (NaN se vuelve 'nan')
    regimen_str = df_clean[receptor_col].astype(str).str.strip()
    
    # Es 601 si empieza con "601" (ej. "601" o "601 - General de Ley...")
    mask_es_601 = regimen_str.str.startswith("601")
    
    # Nos quedamos con todo lo que NO sea 601 (incluyendo vacíos/NaN)
    df_resultado = df_clean[~mask_es_601].copy()

    # 2b. Buscar columnas de Método de pago / Forma de pago descripción
    # (por nombre, igual que el régimen — no por posición fija de columna)
    metodo_pattern = re.compile(r'^m[eé]todo\s+de\s+pago$', re.IGNORECASE)
    forma_pattern = re.compile(r'^forma\s+de\s+pago\s+descripci[oó]n$', re.IGNORECASE)

    metodo_col = None
    forma_col = None
    for c in df_clean.columns:
        c_str = str(c).strip()
        if metodo_pattern.match(c_str):
            metodo_col = c
        elif forma_pattern.match(c_str):
            forma_col = c

    df_pue_sin_definir = None
    df_ppd_distinto = None
    if metodo_col and forma_col:
        metodo_str = df_clean[metodo_col].astype(str).str.strip().str.upper()
        forma_str = df_clean[forma_col].astype(str).str.strip().str.upper()

        df_pue_sin_definir = df_clean[(metodo_str == "PUE") & (forma_str == "POR DEFINIR")].copy()
        df_ppd_distinto = df_clean[(metodo_str == "PPD") & (forma_str != "POR DEFINIR")].copy()

    hay_hallazgos_metodo_forma = (
        (df_pue_sin_definir is not None and not df_pue_sin_definir.empty)
        or (df_ppd_distinto is not None and not df_ppd_distinto.empty)
    )

    if df_resultado.empty and not hay_hallazgos_metodo_forma:
        raise HTTPException(
            status_code=200,
            detail="No se encontraron discrepancias de régimen receptor ni de método/forma de pago. Todo correcto.",
        )

    # 3. Crear Excel con UNA sola hoja
    wb = openpyxl.Workbook()
    # Eliminar hojas extras que openpyxl pueda crear por defecto
    while len(wb.sheetnames) > 1:
        wb.remove(wb[wb.sheetnames[-1]])
    
    ws = wb.active
    ws.title = "Regimen_Diferente_601"
    
    cols_origin = list(df_clean.columns)
    
    # Cabecera con estilo
    header_fill = PatternFill(start_color="C92A2A", end_color="C92A2A", fill_type="solid")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    
    for col_num, col_name in enumerate(cols_origin, 1):
        cell = ws.cell(row=1, column=col_num, value=col_name)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 24
    
    thin_border = Border(
        left=Side(style='thin', color='E0E0E0'),
        right=Side(style='thin', color='E0E0E0'),
        top=Side(style='thin', color='E0E0E0'),
        bottom=Side(style='thin', color='E0E0E0')
    )
    
    row_fill_alt = PatternFill(start_color="FFF5F5", end_color="FFF5F5", fill_type="solid")
    
    # Encontrar el índice de la columna del régimen para resaltarla
    receptor_col_idx = cols_origin.index(receptor_col) + 1 if receptor_col in cols_origin else None
    highlight_fill = PatternFill(start_color="FFCCCC", end_color="FFCCCC", fill_type="solid")
    highlight_font = Font(name="Segoe UI", size=9, bold=True, color="C92A2A")
    
    for r_idx, (_, row) in enumerate(df_resultado.iterrows(), start=2):
        ws.row_dimensions[r_idx].height = 18
        for c_idx, col_name in enumerate(cols_origin, 1):
            val = row.get(col_name, "")
            if pd.isna(val):
                val = ""
            cell = ws.cell(row=r_idx, column=c_idx, value=val)
            cell.font = Font(name="Segoe UI", size=9)
            cell.border = thin_border
            
            # Zebra striping rojo suave
            if r_idx % 2 == 0:
                cell.fill = row_fill_alt
            
            # Resaltar la columna del régimen receptor
            if c_idx == receptor_col_idx:
                cell.fill = highlight_fill
                cell.font = highlight_font
                
            if isinstance(val, (int, float)):
                cell.alignment = Alignment(horizontal="right")
    
    # Ajustar anchos de columnas
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # 4. Segunda hoja: validación Método de pago / Forma de pago descripción
    if metodo_col and forma_col:
        ws2 = wb.create_sheet("Metodo_Forma_Pago")

        def _escribir_bloque(fila_inicio: int, titulo: str, df_bloque: "pd.DataFrame", col_resaltar) -> int:
            titulo_cell = ws2.cell(row=fila_inicio, column=1, value=titulo)
            titulo_cell.font = Font(name="Segoe UI", size=11, bold=True, color="C92A2A")

            fila_header = fila_inicio + 1
            for col_num, col_name in enumerate(cols_origin, 1):
                cell = ws2.cell(row=fila_header, column=col_num, value=col_name)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center", vertical="center")
            ws2.row_dimensions[fila_header].height = 24

            col_resaltar_idx = cols_origin.index(col_resaltar) + 1 if col_resaltar in cols_origin else None

            for offset, (_, row) in enumerate(df_bloque.iterrows()):
                r_idx = fila_header + 1 + offset
                ws2.row_dimensions[r_idx].height = 18
                for c_idx, col_name in enumerate(cols_origin, 1):
                    val = row.get(col_name, "")
                    if pd.isna(val):
                        val = ""
                    cell = ws2.cell(row=r_idx, column=c_idx, value=val)
                    cell.font = Font(name="Segoe UI", size=9)
                    cell.border = thin_border
                    if r_idx % 2 == 0:
                        cell.fill = row_fill_alt
                    if c_idx == col_resaltar_idx:
                        cell.fill = highlight_fill
                        cell.font = highlight_font
                    if isinstance(val, (int, float)):
                        cell.alignment = Alignment(horizontal="right")

            return fila_header + 1 + len(df_bloque) + 2  # +2 filas en blanco antes del siguiente bloque

        fila_siguiente = _escribir_bloque(1, "PUE - FORMA DE PAGO POR DEFINIR", df_pue_sin_definir, forma_col)
        _escribir_bloque(fila_siguiente, "PPD - FORMA DE PAGO DISTINTA A 'POR DEFINIR'", df_ppd_distinto, forma_col)

        for col in ws2.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws2.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = BytesIO()
    wb.save(output)
    excel_bytes = output.getvalue()

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Regimen_Diferente_601.xlsx"}
    )


@router.get("/{id}", response_model=IngresoOut)
async def get_ingreso(
    id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Devuelve un registro de Ingresos completo (todas las columnas de
    datos_extra) — GET /ingresos (la lista) solo trae folio/monto/fecha/RFC/
    emisor; esto lo necesita el modal de edición para mostrar cada columna.
    """
    stmt = select(CfdiIngreso).where(CfdiIngreso.id == id)
    res = await db.execute(stmt)
    ingreso = res.scalars().first()
    if not ingreso:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")
    return ingreso


@router.patch("/{id}", response_model=IngresoOut)
async def update_ingreso(
    id: int,
    ingreso_in: IngresoUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Editar manualmente un registro de Ingresos — para corregir datos mal
    capturados en el origen (ej. un cruce de montos entre 2 CFDI que nunca
    se corrigió en esta base, aunque sí en Pagos). Toca rfc_emisor/
    nombre_emisor y cualquier clave dentro de datos_extra (merge, no
    reemplazo) — el UUID (columna propia del modelo) no se puede editar por
    aquí a propósito, ver IngresoUpdate.
    """
    stmt = select(CfdiIngreso).where(CfdiIngreso.id == id)
    res = await db.execute(stmt)
    ingreso = res.scalars().first()
    if not ingreso:
        raise HTTPException(status_code=404, detail="Ingreso no encontrado")

    if ingreso_in.rfc_emisor is not None:
        ingreso.rfc_emisor = ingreso_in.rfc_emisor.strip()

    if ingreso_in.nombre_emisor is not None:
        ingreso.nombre_emisor = ingreso_in.nombre_emisor.strip()

    if ingreso_in.datos_extra is not None:
        datos_extra = dict(ingreso.datos_extra or {})
        datos_extra.update(ingreso_in.datos_extra)
        ingreso.datos_extra = datos_extra

    await db.commit()
    await db.refresh(ingreso)

    return ingreso

