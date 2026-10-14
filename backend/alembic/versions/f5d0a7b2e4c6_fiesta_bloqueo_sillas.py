"""fiesta: bloqueo de sillas

Revision ID: f5d0a7b2e4c6
Revises: f4c9e6a1d3b5
Create Date: 2026-10-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5d0a7b2e4c6'
down_revision: Union[str, None] = 'f4c9e6a1d3b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fiesta_silla', sa.Column('bloqueada', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('fiesta_silla', sa.Column('bloqueo_motivo', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('fiesta_silla', 'bloqueo_motivo')
    op.drop_column('fiesta_silla', 'bloqueada')
