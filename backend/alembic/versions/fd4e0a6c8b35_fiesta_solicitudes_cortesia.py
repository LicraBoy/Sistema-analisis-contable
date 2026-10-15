"""fiesta: solicitudes de cortesia (aviso al supervisor en lugar de pedir contrasena)

Revision ID: fd4e0a6c8b35
Revises: fc3d9f5b7e24
Create Date: 2026-10-14 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fd4e0a6c8b35'
down_revision: Union[str, None] = 'fc3d9f5b7e24'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fiesta_solicitud_cortesia',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('reservacion_id', sa.Integer(), nullable=False),
        sa.Column('silla_ids', sa.String(length=200), nullable=False),
        sa.Column('motivo', sa.String(length=255), nullable=False),
        sa.Column('estado', sa.String(length=10), nullable=False, server_default='pendiente'),
        sa.Column('solicitado_por', sa.String(length=80), nullable=True),
        sa.Column('resuelto_por', sa.String(length=80), nullable=True),
        sa.Column('resuelto_en', sa.DateTime(timezone=True), nullable=True),
        sa.Column('nota_resolucion', sa.String(length=255), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['reservacion_id'], ['fiesta_reservacion.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fiesta_solicitud_cortesia_reservacion_id', 'fiesta_solicitud_cortesia', ['reservacion_id'])
    op.create_index('ix_fiesta_solicitud_cortesia_estado', 'fiesta_solicitud_cortesia', ['estado'])


def downgrade() -> None:
    op.drop_index('ix_fiesta_solicitud_cortesia_estado', table_name='fiesta_solicitud_cortesia')
    op.drop_index('ix_fiesta_solicitud_cortesia_reservacion_id', table_name='fiesta_solicitud_cortesia')
    op.drop_table('fiesta_solicitud_cortesia')
