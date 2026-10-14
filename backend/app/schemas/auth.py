"""
Auth schemas — inicio de sesión, cambio de contraseña y autorización de supervisor.
"""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Payload for POST /auth/login."""

    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class CambiarPasswordRequest(BaseModel):
    actual: str = Field(min_length=1, max_length=256)
    nueva: str = Field(min_length=1, max_length=256)


class PerfilRequest(BaseModel):
    nombre: str = Field(min_length=2, max_length=150)


class AutorizarRequest(BaseModel):
    """Contraseña del supervisor que autoriza. Sin `email` se usa el usuario actual (si es supervisor)."""

    password: str = Field(min_length=1, max_length=256)
    email: str | None = Field(default=None, max_length=255)
    capacidad: str = "fiesta_supervisor"
