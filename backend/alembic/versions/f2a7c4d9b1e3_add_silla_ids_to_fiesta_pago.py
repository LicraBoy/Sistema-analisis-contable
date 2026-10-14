"""add silla_ids to fiesta_pago

Revision ID: f2a7c4d9b1e3
Revises: f1e57a0b9c3d
Create Date: 2026-10-13 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a7c4d9b1e3'
down_revision: Union[str, None] = 'f1e57a0b9c3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ids de silla (separados por coma) a las que se aplica el abono; NULL = toda la reservación.
    op.add_column('fiesta_pago', sa.Column('silla_ids', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('fiesta_pago', 'silla_ids')
