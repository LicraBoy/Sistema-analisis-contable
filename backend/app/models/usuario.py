"""
Modelos de seguridad: usuarios, roles, permisos por módulo, sesiones (refresh tokens) y auditoría.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class Rol(Base):
    """Rol de usuario; sus permisos por módulo viven en `permisos_rol` (matriz editable)."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    clave: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(80), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Los roles de sistema (administrador) no se pueden borrar ni quitarles el acceso a administración.
    es_sistema: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    permisos: Mapped[list["PermisoRol"]] = relationship(back_populates="rol", cascade="all, delete-orphan")


class PermisoRol(Base):
    """Nivel de acceso de un rol a un módulo: 0 = sin acceso, 1 = solo ver, 2 = ver y editar."""

    __tablename__ = "permisos_rol"
    __table_args__ = (UniqueConstraint("rol_id", "modulo", name="uq_permiso_rol_modulo"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rol_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    modulo: Mapped[str] = mapped_column(String(40), nullable=False)
    nivel: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    rol: Mapped[Rol] = relationship(back_populates="permisos")


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    rol_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    # Primer acceso o contraseña restablecida por el administrador: debe cambiarla antes de usar el sistema.
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Sube al cambiar contraseña/rol o desactivar: invalida de inmediato los tokens de acceso ya emitidos.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)

    rol: Mapped[Rol | None] = relationship()

    def __repr__(self) -> str:
        return f"<Usuario {self.email}>"


class Sesion(Base):
    """Refresh token (solo se guarda su hash). `familia` agrupa la cadena de rotaciones de un inicio de sesión."""

    __tablename__ = "sesiones"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    familia: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    creada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)
    ultimo_uso: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Tope absoluto de la sesión (aunque se siga usando).
    vence_absoluto: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revocada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Auditoria(Base):
    """Bitácora de seguridad: accesos, intentos fallidos y cambios de usuarios, roles y permisos."""

    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora, index=True)
    usuario_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    evento: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    modulo: Mapped[str | None] = mapped_column(String(40), nullable=True)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
    exito: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
