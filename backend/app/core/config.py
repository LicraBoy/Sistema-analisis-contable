"""
Application settings loaded from environment variables.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration — values come from .env or environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./local_db.sqlite3"

    # ── Almacenamiento de archivos en disco (ej. adjuntos de Facturación) ─
    storage_dir: str = "./storage"

    # ── Redis / Celery ──────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # ── Entorno y autenticación ─────────────────────────
    # "produccion" endurece el arranque (clave secreta obligatoria) y oculta /docs.
    entorno: str = "desarrollo"
    # False solo en desarrollo/pruebas: conserva el acceso abierto de antes (usuario administrador fijo).
    auth_enabled: bool = True
    secret_key: str = "change-me-to-a-random-secret-key-in-production"
    access_token_expire_minutes: int = 15
    algorithm: str = "HS256"
    # Sesión: se cierra tras `sesion_inactividad_min` sin usarse y, pase lo que pase, a las `sesion_max_horas`.
    sesion_inactividad_min: int = 240
    sesion_max_horas: int = 16
    # Fuerza la bandera Secure de la cookie de sesión (si no, se activa sola cuando la petición llega por HTTPS).
    cookie_secure: bool = False
    # Bloqueo de cuenta: intentos fallidos seguidos y minutos de bloqueo (se duplica en cada nuevo bloqueo).
    login_max_intentos: int = 5
    login_bloqueo_min: int = 15
    # Tope de tamaño de una carga (MB).
    max_upload_mb: int = 50

    # ── CORS ────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()
