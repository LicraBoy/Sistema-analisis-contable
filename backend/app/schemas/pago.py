"""
Pago schemas — serialization, filtering, and list response.
"""

from datetime import date, datetime

from pydantic import BaseModel

from app.models.pago import EstadoPago


class PagoOut(BaseModel):
    """Single pago record returned by the API."""

    id: int
    tipo_movimiento: str
    fecha: date | None
    factura: str
    uuid: str | None
    estado: EstadoPago
    observaciones: str | None
    datos_extra: dict | None
    archivo_id: int | None
    created_at: datetime
    uuid_verificado: bool = True

    model_config = {"from_attributes": True}


class PagoFilter(BaseModel):
    """Query parameters for GET /pagos."""

    estado: EstadoPago | None = None
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    factura: str | None = None
    page: int = 1
    page_size: int = 50


class PagoListResponse(BaseModel):
    """Paginated list of pagos."""

    items: list[PagoOut]
    total: int
    page: int
    page_size: int


class PagoUpdate(BaseModel):
    """Fields that can be updated on a pago."""
    tipo_movimiento: str | None = None
    fecha: date | None = None
    factura: str | None = None
    uuid: str | None = None
    estado: EstadoPago | None = None
    motivo: str | None = None


class ExportPagosRequest(BaseModel):
    """Body de POST /pagos/export."""

    estado: EstadoPago | None = None
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    factura: str | None = None
    filename: str = "Pagos_Procesados.xlsx"
    tipo_cambio_overrides: dict[str, float] = {}
    uuids_cancelados: list[str] = []
    egresos: list[dict] = []
    egresos_filas_todas: list[dict] = []
    cancelados_detalle: list[dict] = []
    retencion_iva10_archivo: list[dict] = []
    retencion_iva4_archivo: list[dict] = []
    retencion_isr10_archivo: list[dict] = []
    retencion_isr125_archivo: list[dict] = []
    iva_acreditable_archivo: list[dict] = []


class UsdPreviewRequest(BaseModel):
    """Body de POST /pagos/export/usd-preview."""

    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    uuids_cancelados: list[str] = []
    egresos: list[dict] = []
