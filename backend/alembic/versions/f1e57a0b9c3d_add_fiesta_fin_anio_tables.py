"""add fiesta fin de anio tables

Revision ID: f1e57a0b9c3d
Revises: 257004518e61
Create Date: 2026-10-10 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1e57a0b9c3d'
down_revision: Union[str, None] = '257004518e61'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('fiesta_evento',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('nombre', sa.String(length=120), nullable=False),
    sa.Column('anio', sa.Integer(), nullable=False),
    sa.Column('fecha_evento', sa.Date(), nullable=True),
    sa.Column('corte_preventa', sa.Date(), nullable=True),
    sa.Column('iva_factor', sa.Float(), nullable=False),
    sa.Column('propina_pct', sa.Float(), nullable=False),
    sa.Column('total_contabilidad_al_dia', sa.Float(), nullable=True),
    sa.Column('activo', sa.Boolean(), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('anio')
    )

    op.create_table('fiesta_precio',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('evento_id', sa.Integer(), nullable=False),
    sa.Column('tipo', sa.String(length=10), nullable=False),
    sa.Column('precio_preventa', sa.Float(), nullable=False),
    sa.Column('precio_normal', sa.Float(), nullable=False),
    sa.ForeignKeyConstraint(['evento_id'], ['fiesta_evento.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('evento_id', 'tipo', name='uq_fiesta_precio_evento_tipo')
    )
    op.create_index(op.f('ix_fiesta_precio_evento_id'), 'fiesta_precio', ['evento_id'], unique=False)

    op.create_table('fiesta_mesa',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('evento_id', sa.Integer(), nullable=False),
    sa.Column('numero', sa.Integer(), nullable=False),
    sa.Column('zona', sa.String(length=40), nullable=True),
    sa.Column('x', sa.Float(), nullable=False),
    sa.Column('y', sa.Float(), nullable=False),
    sa.Column('capacidad', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['evento_id'], ['fiesta_evento.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('evento_id', 'numero', name='uq_fiesta_mesa_evento_numero')
    )
    op.create_index(op.f('ix_fiesta_mesa_evento_id'), 'fiesta_mesa', ['evento_id'], unique=False)

    op.create_table('fiesta_silla',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('mesa_id', sa.Integer(), nullable=False),
    sa.Column('numero', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['mesa_id'], ['fiesta_mesa.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('mesa_id', 'numero', name='uq_fiesta_silla_mesa_numero')
    )
    op.create_index(op.f('ix_fiesta_silla_mesa_id'), 'fiesta_silla', ['mesa_id'], unique=False)

    op.create_table('fiesta_reservacion',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('evento_id', sa.Integer(), nullable=False),
    sa.Column('cliente', sa.String(length=255), nullable=False),
    sa.Column('telefono_o_cuarto', sa.String(length=80), nullable=True),
    sa.Column('notas', sa.Text(), nullable=True),
    sa.Column('fecha_venta', sa.Date(), nullable=False),
    sa.Column('capturado_por', sa.String(length=80), nullable=True),
    sa.Column('estatus', sa.String(length=10), nullable=False),
    sa.Column('motivo_cancelacion', sa.String(length=255), nullable=True),
    sa.Column('cancelado_en', sa.DateTime(timezone=True), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['evento_id'], ['fiesta_evento.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fiesta_reservacion_evento_id'), 'fiesta_reservacion', ['evento_id'], unique=False)

    op.create_table('fiesta_reservacion_silla',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('reservacion_id', sa.Integer(), nullable=False),
    sa.Column('silla_id', sa.Integer(), nullable=False),
    sa.Column('tipo', sa.String(length=10), nullable=False),
    sa.Column('precio_aplicado', sa.Float(), nullable=False),
    sa.Column('preventa', sa.Boolean(), nullable=False),
    sa.Column('activa', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['reservacion_id'], ['fiesta_reservacion.id'], ),
    sa.ForeignKeyConstraint(['silla_id'], ['fiesta_silla.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fiesta_reservacion_silla_reservacion_id'), 'fiesta_reservacion_silla', ['reservacion_id'], unique=False)
    op.create_index(op.f('ix_fiesta_reservacion_silla_silla_id'), 'fiesta_reservacion_silla', ['silla_id'], unique=False)
    # Una silla solo puede estar en una reservación activa a la vez (anti doble venta).
    op.create_index('uq_fiesta_silla_activa', 'fiesta_reservacion_silla', ['silla_id'], unique=True,
                    sqlite_where=sa.text('activa = 1'), postgresql_where=sa.text('activa'))

    op.create_table('fiesta_pago',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('reservacion_id', sa.Integer(), nullable=False),
    sa.Column('referencia', sa.String(length=80), nullable=True),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('importe', sa.Float(), nullable=False),
    sa.Column('forma_pago', sa.String(length=30), nullable=True),
    sa.Column('capturado_por', sa.String(length=80), nullable=True),
    sa.Column('cancelado', sa.Boolean(), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['reservacion_id'], ['fiesta_reservacion.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fiesta_pago_reservacion_id'), 'fiesta_pago', ['reservacion_id'], unique=False)
    op.create_index(op.f('ix_fiesta_pago_fecha'), 'fiesta_pago', ['fecha'], unique=False)

    op.create_table('fiesta_historico',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('anio', sa.Integer(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('reservados', sa.Integer(), nullable=False),
    sa.Column('pagados', sa.Integer(), nullable=False),
    sa.Column('anticipos', sa.Integer(), nullable=False),
    sa.Column('sin_anticipo', sa.Integer(), nullable=False),
    sa.Column('cortesias', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('anio', 'fecha', name='uq_fiesta_historico_anio_fecha')
    )
    op.create_index(op.f('ix_fiesta_historico_anio'), 'fiesta_historico', ['anio'], unique=False)

    op.create_table('fiesta_bitacora',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('evento_id', sa.Integer(), nullable=True),
    sa.Column('accion', sa.String(length=40), nullable=False),
    sa.Column('entidad', sa.String(length=40), nullable=False),
    sa.Column('entidad_id', sa.Integer(), nullable=True),
    sa.Column('usuario', sa.String(length=80), nullable=True),
    sa.Column('detalle', sa.Text(), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['evento_id'], ['fiesta_evento.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fiesta_bitacora_evento_id'), 'fiesta_bitacora', ['evento_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_fiesta_bitacora_evento_id'), table_name='fiesta_bitacora')
    op.drop_table('fiesta_bitacora')
    op.drop_index(op.f('ix_fiesta_historico_anio'), table_name='fiesta_historico')
    op.drop_table('fiesta_historico')
    op.drop_index(op.f('ix_fiesta_pago_fecha'), table_name='fiesta_pago')
    op.drop_index(op.f('ix_fiesta_pago_reservacion_id'), table_name='fiesta_pago')
    op.drop_table('fiesta_pago')
    op.drop_index('uq_fiesta_silla_activa', table_name='fiesta_reservacion_silla')
    op.drop_index(op.f('ix_fiesta_reservacion_silla_silla_id'), table_name='fiesta_reservacion_silla')
    op.drop_index(op.f('ix_fiesta_reservacion_silla_reservacion_id'), table_name='fiesta_reservacion_silla')
    op.drop_table('fiesta_reservacion_silla')
    op.drop_index(op.f('ix_fiesta_reservacion_evento_id'), table_name='fiesta_reservacion')
    op.drop_table('fiesta_reservacion')
    op.drop_index(op.f('ix_fiesta_silla_mesa_id'), table_name='fiesta_silla')
    op.drop_table('fiesta_silla')
    op.drop_index(op.f('ix_fiesta_mesa_evento_id'), table_name='fiesta_mesa')
    op.drop_table('fiesta_mesa')
    op.drop_index(op.f('ix_fiesta_precio_evento_id'), table_name='fiesta_precio')
    op.drop_table('fiesta_precio')
    op.drop_table('fiesta_evento')
