"""fiesta: poliza contable por dia

Revision ID: f6e1b8c3d5a7
Revises: f5d0a7b2e4c6
Create Date: 2026-10-13 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6e1b8c3d5a7'
down_revision: Union[str, None] = 'f5d0a7b2e4c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fiesta_poliza_dia',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('evento_id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('importe', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['evento_id'], ['fiesta_evento.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('evento_id', 'fecha', name='uq_fiesta_poliza_evento_fecha'),
    )
    op.create_index(op.f('ix_fiesta_poliza_dia_evento_id'), 'fiesta_poliza_dia', ['evento_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_fiesta_poliza_dia_evento_id'), table_name='fiesta_poliza_dia')
    op.drop_table('fiesta_poliza_dia')
