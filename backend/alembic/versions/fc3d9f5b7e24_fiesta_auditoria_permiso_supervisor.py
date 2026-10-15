"""fiesta: el permiso fiesta_auditoria llega en 0 al Supervisor de Fiesta en bases donde el rol ya tenia la fila

Revision ID: fc3d9f5b7e24
Revises: fb2c8e4a6d13
Create Date: 2026-10-14 16:30:00.000000

La migracion fa1b7c3d9e52 solo insertaba el permiso cuando faltaba la fila; si el arranque del servidor ya la habia
sembrado en 0 (los modulos nuevos arrancan sin acceso en roles existentes) el Supervisor y el Contralor se quedaban sin
ver la auditoria, contra lo acordado. Se corrige una sola vez; luego se edita en Administracion > Roles y permisos.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fc3d9f5b7e24'
down_revision: Union[str, None] = 'fb2c8e4a6d13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "update permisos_rol set nivel = 2 where modulo = 'fiesta_auditoria' and nivel = 0 "
            "and rol_id in (select id from roles where clave in ('supervisor_fiesta', 'contralor'))"
        )
    )


def downgrade() -> None:
    # No se revierte: el permiso pudo editarse a mano despues.
    pass
