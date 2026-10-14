"""fiesta: PIN de supervisor

Revision ID: f4c9e6a1d3b5
Revises: f3b8d5e0c2a4
Create Date: 2026-10-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4c9e6a1d3b5'
down_revision: Union[str, None] = 'f3b8d5e0c2a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fiesta_evento', sa.Column('pin_supervisor_hash', sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column('fiesta_evento', 'pin_supervisor_hash')
