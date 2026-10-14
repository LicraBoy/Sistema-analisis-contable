from fastapi import APIRouter, Depends, File, UploadFile, HTTPException

from app.core.security import get_current_user
from app.services.conciliacion_retenciones import leer_archivo_retenciones

router = APIRouter()


async def _parse_archivo_retencion(file: UploadFile) -> dict:
    """
    Lee el archivo de retenciones subido y devuelve las filas parseadas, para
    que el frontend las reenvíe junto con la solicitud de exportación de
    Pagos (POST /pagos/export) — mismo patrón que /pagos/cancelados/parse y
    /pagos/egresos/parse. La conciliación en sí (contra la columna de
    retención correspondiente en Amarre) se hace dentro de ese endpoint, no
    aquí.
    """
    if not file.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    content = await file.read()
    try:
        filas = await leer_archivo_retenciones(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo Excel: {str(e)}")

    return {"filas": filas, "total": len(filas)}


@router.post("/iva-10/parse")
async def parse_retencion_iva_10(
    file: UploadFile = File(..., description="Archivo del auxiliar contable de retenciones IVA RET 10% (Fecha/Número/Concepto/Débito/Crédito)"),
    current_user: dict = Depends(get_current_user),
):
    return await _parse_archivo_retencion(file)


@router.post("/iva-4/parse")
async def parse_retencion_iva_4(
    file: UploadFile = File(..., description="Archivo del auxiliar contable de retenciones IVA RET 4% (Fecha/Número/Concepto/Débito/Crédito)"),
    current_user: dict = Depends(get_current_user),
):
    return await _parse_archivo_retencion(file)


@router.post("/isr-10/parse")
async def parse_retencion_isr_10(
    file: UploadFile = File(..., description="Archivo del auxiliar contable de retenciones ISR RET 10% (Fecha/Número/Concepto/Débito/Crédito)"),
    current_user: dict = Depends(get_current_user),
):
    return await _parse_archivo_retencion(file)


@router.post("/isr-125/parse")
async def parse_retencion_isr_125(
    file: UploadFile = File(..., description="Archivo del auxiliar contable de retenciones ISR RET 1.25% (Fecha/Número/Concepto/Débito/Crédito)"),
    current_user: dict = Depends(get_current_user),
):
    return await _parse_archivo_retencion(file)


@router.post("/iva-acreditable/parse")
async def parse_iva_acreditable(
    file: UploadFile = File(..., description="Archivo de IVA acreditable (Fecha/Concepto/Débito) — mismo formato que los de retenciones"),
    current_user: dict = Depends(get_current_user),
):
    return await _parse_archivo_retencion(file)
