"""fiesta: correo, preventa autorizada y reparto por silla

Revision ID: f3b8d5e0c2a4
Revises: f2a7c4d9b1e3
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3b8d5e0c2a4'
down_revision: Union[str, None] = 'f2a7c4d9b1e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fiesta_reservacion', sa.Column('correo', sa.String(length=255), nullable=True))
    op.add_column('fiesta_reservacion', sa.Column('preventa_autorizada', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('fiesta_reservacion', sa.Column('preventa_autorizada_por', sa.String(length=80), nullable=True))
    op.add_column('fiesta_reservacion', sa.Column('preventa_motivo', sa.String(length=255), nullable=True))
    op.add_column('fiesta_pago', sa.Column('reparto', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('fiesta_pago', 'reparto')
    op.drop_column('fiesta_reservacion', 'preventa_motivo')
    op.drop_column('fiesta_reservacion', 'preventa_autorizada_por')
    op.drop_column('fiesta_reservacion', 'preventa_autorizada')
    op.drop_column('fiesta_reservacion', 'correo')
