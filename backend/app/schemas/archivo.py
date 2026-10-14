"""
Archivo schemas — processed file output and status.
"""

from datetime import datetime

from pydantic import BaseModel

from app.models.archivo_procesado import EstadoProcesamiento, TipoArchivo


class ArchivoOut(BaseModel):
    """Processed file record."""

    id: int
    nombre_archivo: str
    tipo: TipoArchivo
    estado_procesamiento: EstadoProcesamiento
    total_registros: int
    uuid_encontrados: int
    uuid_no_encontrados: int
    mensaje_error: str | None
    usuario_id: int | None
    fecha_subida: datetime
    fecha_completado: datetime | None

    model_config = {"from_attributes": True}


class ProcesamientoStatus(BaseModel):
    """Status of a background processing task."""

    archivo_id: int
    estado: EstadoProcesamiento
    total_registros: int
    uuid_encontrados: int
    uuid_no_encontrados: int
    mensaje_error: str | None
    progreso_porcentaje: float = 0.0
