"""seguridad: roles, permisos por modulo, sesiones y auditoria

Revision ID: f8b3d0a5c7e9
Revises: f7a2c9d4e6b8
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8b3d0a5c7e9'
down_revision: Union[str, None] = 'f7a2c9d4e6b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('clave', sa.String(length=40), nullable=False),
        sa.Column('nombre', sa.String(length=80), nullable=False),
        sa.Column('descripcion', sa.String(length=255), nullable=True),
        sa.Column('es_sistema', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_roles_clave'), 'roles', ['clave'], unique=True)

    op.create_table(
        'permisos_rol',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rol_id', sa.Integer(), nullable=False),
        sa.Column('modulo', sa.String(length=40), nullable=False),
        sa.Column('nivel', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['rol_id'], ['roles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rol_id', 'modulo', name='uq_permiso_rol_modulo'),
    )
    op.create_index(op.f('ix_permisos_rol_rol_id'), 'permisos_rol', ['rol_id'], unique=False)

    with op.batch_alter_table('usuarios') as batch:
        batch.add_column(sa.Column('rol_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column('failed_attempts', sa.Integer(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))
        batch.create_foreign_key('fk_usuarios_rol_id', 'roles', ['rol_id'], ['id'])
        batch.create_index('ix_usuarios_rol_id', ['rol_id'])
        batch.drop_column('rol')

    op.create_table(
        'sesiones',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('familia', sa.String(length=40), nullable=False),
        sa.Column('creada_en', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ultimo_uso', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expira_en', sa.DateTime(timezone=True), nullable=False),
        sa.Column('vence_absoluto', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revocada_en', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sesiones_usuario_id'), 'sesiones', ['usuario_id'], unique=False)
    op.create_index(op.f('ix_sesiones_token_hash'), 'sesiones', ['token_hash'], unique=True)
    op.create_index(op.f('ix_sesiones_familia'), 'sesiones', ['familia'], unique=False)

    op.create_table(
        'auditoria',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('usuario_id', sa.Integer(), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('evento', sa.String(length=40), nullable=False),
        sa.Column('modulo', sa.String(length=40), nullable=True),
        sa.Column('detalle', sa.Text(), nullable=True),
        sa.Column('exito', sa.Boolean(), nullable=False),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_auditoria_ts'), 'auditoria', ['ts'], unique=False)
    op.create_index(op.f('ix_auditoria_usuario_id'), 'auditoria', ['usuario_id'], unique=False)
    op.create_index(op.f('ix_auditoria_evento'), 'auditoria', ['evento'], unique=False)


def downgrade() -> None:
    op.drop_table('auditoria')
    op.drop_table('sesiones')
    with op.batch_alter_table('usuarios') as batch:
        batch.add_column(sa.Column('rol', sa.String(length=8), nullable=False, server_default='viewer'))
        batch.drop_index('ix_usuarios_rol_id')
        batch.drop_constraint('fk_usuarios_rol_id', type_='foreignkey')
        for col in ('token_version', 'password_changed_at', 'last_login_at', 'locked_until', 'failed_attempts', 'must_change_password', 'rol_id'):
            batch.drop_column(col)
    op.drop_table('permisos_rol')
    op.drop_table('roles')
