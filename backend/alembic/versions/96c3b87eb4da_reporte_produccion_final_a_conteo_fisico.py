"""reporte produccion final a conteo fisico

Revision ID: 96c3b87eb4da
Revises: 44229838656e
Create Date: 2026-10-07 09:36:26.521411

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '96c3b87eb4da'
down_revision: Union[str, None] = '44229838656e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # La existencia final deja de capturarse (se calcula en cadena); lo que antes
    # era "final" pasa a ser el conteo físico opcional.
    with op.batch_alter_table('reporte_produccion_capturas') as batch_op:
        batch_op.alter_column('final', new_column_name='conteo_fisico', existing_type=sa.Float(), existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('reporte_produccion_capturas') as batch_op:
        batch_op.alter_column('conteo_fisico', new_column_name='final', existing_type=sa.Float(), existing_nullable=True)
