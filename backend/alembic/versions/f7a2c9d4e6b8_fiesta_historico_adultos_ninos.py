"""fiesta: adultos y ninos en el historico

Revision ID: f7a2c9d4e6b8
Revises: f6e1b8c3d5a7
Create Date: 2026-10-14 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a2c9d4e6b8'
down_revision: Union[str, None] = 'f6e1b8c3d5a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fiesta_historico', sa.Column('adultos', sa.Integer(), nullable=True))
    op.add_column('fiesta_historico', sa.Column('ninos', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('fiesta_historico', 'ninos')
    op.drop_column('fiesta_historico', 'adultos')
