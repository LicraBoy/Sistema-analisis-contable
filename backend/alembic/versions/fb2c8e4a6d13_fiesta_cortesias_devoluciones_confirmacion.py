"""fiesta: motivo de cortesias, devoluciones y pie del mensaje de confirmacion

Revision ID: fb2c8e4a6d13
Revises: fa1b7c3d9e52
Create Date: 2026-10-14 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fb2c8e4a6d13'
down_revision: Union[str, None] = 'fa1b7c3d9e52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('fiesta_evento') as batch:
        batch.add_column(sa.Column('mensaje_confirmacion', sa.Text(), nullable=True))
    with op.batch_alter_table('fiesta_reservacion') as batch:
        batch.add_column(sa.Column('cortesia_motivo', sa.String(length=255), nullable=True))
        batch.add_column(sa.Column('cortesia_autorizada_por', sa.String(length=80), nullable=True))
    op.create_table(
        'fiesta_devolucion',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('reservacion_id', sa.Integer(), nullable=False),
        sa.Column('importe', sa.Float(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('forma_pago', sa.String(length=30), nullable=True),
        sa.Column('referencia', sa.String(length=80), nullable=True),
        sa.Column('motivo', sa.String(length=255), nullable=False),
        sa.Column('capturado_por', sa.String(length=80), nullable=True),
        sa.Column('autorizado_por', sa.String(length=80), nullable=True),
        sa.Column('cancelada', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['reservacion_id'], ['fiesta_reservacion.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fiesta_devolucion_reservacion_id', 'fiesta_devolucion', ['reservacion_id'])
    op.create_index('ix_fiesta_devolucion_fecha', 'fiesta_devolucion', ['fecha'])


def downgrade() -> None:
    op.drop_index('ix_fiesta_devolucion_fecha', table_name='fiesta_devolucion')
    op.drop_index('ix_fiesta_devolucion_reservacion_id', table_name='fiesta_devolucion')
    op.drop_table('fiesta_devolucion')
    with op.batch_alter_table('fiesta_reservacion') as batch:
        batch.drop_column('cortesia_autorizada_por')
        batch.drop_column('cortesia_motivo')
    with op.batch_alter_table('fiesta_evento') as batch:
        batch.drop_column('mensaje_confirmacion')
