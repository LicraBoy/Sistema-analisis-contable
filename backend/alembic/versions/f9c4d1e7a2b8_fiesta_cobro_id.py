"""fiesta: cobro_id para agrupar pagos de un mismo cobro con varias formas de pago

Revision ID: f9c4d1e7a2b8
Revises: f8b3d0a5c7e9
Create Date: 2026-10-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f9c4d1e7a2b8'
down_revision: Union[str, None] = 'f8b3d0a5c7e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('fiesta_pago') as batch:
        batch.add_column(sa.Column('cobro_id', sa.String(length=36), nullable=True))
        batch.create_index('ix_fiesta_pago_cobro_id', ['cobro_id'])


def downgrade() -> None:
    with op.batch_alter_table('fiesta_pago') as batch:
        batch.drop_index('ix_fiesta_pago_cobro_id')
        batch.drop_column('cobro_id')
