"""productos_vendidos_detalle periodo mensual a fecha_desde/fecha_hasta por lote

Revision ID: 744d5d9a8307
Revises: 370301766de8
Create Date: 2026-09-18 14:50:05.158384

"""
import calendar
from datetime import date
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '744d5d9a8307'
down_revision: Union[str, None] = '370301766de8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable primero: hay que rellenarlas por dato existente antes de
    # poder exigir NOT NULL (esta tabla ya tenía 1,918 filas reales al
    # momento de escribir esta migración, repartidas en 3 meses — no es
    # una tabla vacía, así que esto no es un create_table con columnas
    # NOT NULL directas).
    op.add_column('productos_vendidos_detalle', sa.Column('fecha_desde', sa.Date(), nullable=True))
    op.add_column('productos_vendidos_detalle', sa.Column('fecha_hasta', sa.Date(), nullable=True))

    # Backfill en Python (no SQL de fecha dependiente de dialecto): cada
    # `periodo` existente ("YYYY-MM") se convierte al rango del mes
    # completo (primer día / último día), ya que ese era el criterio de
    # reemplazo original (una subida reemplazaba todo el mes) — no se
    # pierde información, solo cambia la etiqueta del lote.
    conn = op.get_bind()
    productos_vendidos_detalle = sa.table(
        'productos_vendidos_detalle',
        sa.column('periodo', sa.String),
        sa.column('fecha_desde', sa.Date),
        sa.column('fecha_hasta', sa.Date),
    )
    periodos = conn.execute(sa.text('SELECT DISTINCT periodo FROM productos_vendidos_detalle')).scalars().all()
    for periodo in periodos:
        anio, mes = int(periodo[:4]), int(periodo[5:7])
        fecha_desde = date(anio, mes, 1)
        fecha_hasta = date(anio, mes, calendar.monthrange(anio, mes)[1])
        conn.execute(
            productos_vendidos_detalle.update()
            .where(productos_vendidos_detalle.c.periodo == periodo)
            .values(fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
        )

    # SQLite no soporta ALTER COLUMN / DROP COLUMN directo — batch_alter_table
    # recrea la tabla por debajo (necesario aquí, a diferencia de las
    # migraciones anteriores de este módulo que solo agregaban tablas/índices
    # nuevos sin tocar columnas existentes).
    with op.batch_alter_table('productos_vendidos_detalle') as batch_op:
        batch_op.alter_column('fecha_desde', existing_type=sa.Date(), nullable=False)
        batch_op.alter_column('fecha_hasta', existing_type=sa.Date(), nullable=False)
        batch_op.drop_index('ix_productos_vendidos_periodo_seccion')
        batch_op.drop_index('ix_productos_vendidos_periodo_grupo')
        batch_op.drop_index('ix_productos_vendidos_periodo_categoria')
        batch_op.drop_index(op.f('ix_productos_vendidos_detalle_periodo'))
        batch_op.drop_column('periodo')
        batch_op.create_index(
            op.f('ix_productos_vendidos_detalle_fecha_desde'), ['fecha_desde'], unique=False
        )
        batch_op.create_index(
            op.f('ix_productos_vendidos_detalle_fecha_hasta'), ['fecha_hasta'], unique=False
        )
        batch_op.create_index(
            'ix_productos_vendidos_fecha_desde_grupo', ['fecha_desde', 'grupo'], unique=False
        )
        batch_op.create_index(
            'ix_productos_vendidos_fecha_desde_categoria', ['fecha_desde', 'categoria_tipo'], unique=False
        )
        batch_op.create_index(
            'ix_productos_vendidos_fecha_desde_seccion', ['fecha_desde', 'seccion_menu'], unique=False
        )


def downgrade() -> None:
    op.add_column('productos_vendidos_detalle', sa.Column('periodo', sa.String(length=7), nullable=True))

    conn = op.get_bind()
    productos_vendidos_detalle = sa.table(
        'productos_vendidos_detalle',
        sa.column('periodo', sa.String),
        sa.column('fecha_desde', sa.Date),
    )
    fechas = conn.execute(sa.text('SELECT DISTINCT fecha_desde FROM productos_vendidos_detalle')).scalars().all()
    for fecha_desde in fechas:
        anio_mes = fecha_desde[:7] if isinstance(fecha_desde, str) else fecha_desde.isoformat()[:7]
        conn.execute(
            productos_vendidos_detalle.update()
            .where(productos_vendidos_detalle.c.fecha_desde == fecha_desde)
            .values(periodo=anio_mes)
        )

    with op.batch_alter_table('productos_vendidos_detalle') as batch_op:
        batch_op.alter_column('periodo', existing_type=sa.String(length=7), nullable=False)
        batch_op.drop_index('ix_productos_vendidos_fecha_desde_seccion')
        batch_op.drop_index('ix_productos_vendidos_fecha_desde_categoria')
        batch_op.drop_index('ix_productos_vendidos_fecha_desde_grupo')
        batch_op.drop_index(op.f('ix_productos_vendidos_detalle_fecha_hasta'))
        batch_op.drop_index(op.f('ix_productos_vendidos_detalle_fecha_desde'))
        batch_op.drop_column('fecha_hasta')
        batch_op.drop_column('fecha_desde')
        batch_op.create_index(op.f('ix_productos_vendidos_detalle_periodo'), ['periodo'], unique=False)
        batch_op.create_index('ix_productos_vendidos_periodo_categoria', ['periodo', 'categoria_tipo'], unique=False)
        batch_op.create_index('ix_productos_vendidos_periodo_grupo', ['periodo', 'grupo'], unique=False)
        batch_op.create_index('ix_productos_vendidos_periodo_seccion', ['periodo', 'seccion_menu'], unique=False)
