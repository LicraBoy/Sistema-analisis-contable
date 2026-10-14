"""fiesta: auditoria (usuario_id, reservacion, antes/despues, ip) y permiso fiesta_auditoria

Revision ID: fa1b7c3d9e52
Revises: f9c4d1e7a2b8
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa1b7c3d9e52'
down_revision: Union[str, None] = 'f9c4d1e7a2b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('fiesta_bitacora') as batch:
        batch.add_column(sa.Column('usuario_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('reservacion_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('cliente', sa.String(length=80), nullable=True))
        batch.add_column(sa.Column('mesa', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('antes', sa.Text(), nullable=True))
        batch.add_column(sa.Column('despues', sa.Text(), nullable=True))
        batch.add_column(sa.Column('ip', sa.String(length=45), nullable=True))
        batch.create_index('ix_fiesta_bitacora_usuario_id', ['usuario_id'])
        batch.create_index('ix_fiesta_bitacora_reservacion_id', ['reservacion_id'])

    # Permiso nuevo para los roles que ya existen: la ven Administrador, Contralor y Supervisor de Fiesta;
    # el resto (p. ej. Cajera de Fiesta) queda sin acceso.
    conn = op.get_bind()
    roles = conn.execute(sa.text("select id, clave from roles")).fetchall()
    for rol_id, clave in roles:
        ya = conn.execute(
            sa.text("select 1 from permisos_rol where rol_id = :r and modulo = 'fiesta_auditoria'"), {"r": rol_id}
        ).first()
        if ya:
            continue
        nivel = 2 if clave in ('administrador', 'contralor', 'supervisor_fiesta') else 0
        conn.execute(
            sa.text("insert into permisos_rol (rol_id, modulo, nivel) values (:r, 'fiesta_auditoria', :n)"),
            {"r": rol_id, "n": nivel},
        )


def downgrade() -> None:
    op.get_bind().execute(sa.text("delete from permisos_rol where modulo = 'fiesta_auditoria'"))
    with op.batch_alter_table('fiesta_bitacora') as batch:
        batch.drop_index('ix_fiesta_bitacora_reservacion_id')
        batch.drop_index('ix_fiesta_bitacora_usuario_id')
        for col in ('ip', 'despues', 'antes', 'mesa', 'cliente', 'reservacion_id', 'usuario_id'):
            batch.drop_column(col)
