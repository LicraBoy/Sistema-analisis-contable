"""
Ingreso schemas — CFDI ingreso output and upload response.
"""

from datetime import datetime

from pydantic import BaseModel


class IngresoOut(BaseModel):
    """Single CFDI ingreso record."""

    id: int
    uuid: str
    regimen_fiscal_receptor: str
    regimen_fiscal_emisor: str
    rfc_emisor: str | None
    nombre_emisor: str | None
    datos_extra: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    """Response after uploading an Excel file."""

    archivo_id: int
    nombre_archivo: str
    total_registros: int
    mensaje: str


class IngresoUpdate(BaseModel):
    """
    Edición manual de un registro de Ingresos — para corregir datos mal
    capturados en el origen (ej. un cruce de montos entre 2 CFDI, o
    cualquier otra columna mal capturada). Permite tocar rfc_emisor/
    nombre_emisor y cualquier clave dentro de datos_extra (merge sobre lo
    existente). El UUID (columna propia del modelo, no de datos_extra) NO
    se puede editar por aquí a propósito — es la clave que conecta este
    Ingreso con su Pago en todo el sistema (Amarre, conciliaciones), y
    editarlo mal podría romper ese cruce o chocar con otro registro.
    """

    rfc_emisor: str | None = None
    nombre_emisor: str | None = None
    datos_extra: dict[str, float | str] | None = None
