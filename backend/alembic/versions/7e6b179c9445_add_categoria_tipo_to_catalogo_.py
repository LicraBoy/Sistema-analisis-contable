"""add categoria_tipo to catalogo_productos_carreta_mariscos

Revision ID: 7e6b179c9445
Revises: 8da72d1fdff7
Create Date: 2026-09-15 11:55:08.731092

"""
import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e6b179c9445'
down_revision: Union[str, None] = '8da72d1fdff7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Copia de clasificar_tipo_producto (services/catalogo_productos_carreta_mariscos.py)
# para el backfill de filas ya existentes — una migración no debe importar
# código de la app (podría cambiar/romperse en el futuro), así que se
# congela aquí la lógica tal como es hoy.
def _distancia_edicion(a: str, b: str, limite: int = 2) -> int:
    if a == b:
        return 0
    len_a, len_b = len(a), len(b)
    if abs(len_a - len_b) > limite:
        return abs(len_a - len_b)
    fila_anterior = list(range(len_b + 1))
    for i, ca in enumerate(a, start=1):
        fila_actual = [i]
        for j, cb in enumerate(b, start=1):
            costo = 0 if ca == cb else 1
            fila_actual.append(min(
                fila_anterior[j] + 1,
                fila_actual[j - 1] + 1,
                fila_anterior[j - 1] + costo,
            ))
        fila_anterior = fila_actual
    return fila_anterior[-1]


def _clasificar_tipo(tipo: str | None) -> str:
    if not tipo or not tipo.strip():
        return "Otros"
    sin_acentos = unicodedata.normalize("NFKD", tipo.strip()).encode("ascii", "ignore").decode("ascii")
    normalizado = sin_acentos.upper()

    if "ALIMENTO" in normalizado:
        return "Alimentos"
    if "BEBIDA" in normalizado:
        return "Bebidas"

    for palabra in normalizado.split():
        if _distancia_edicion(palabra, "ALIMENTOS", limite=1) <= 1 or _distancia_edicion(palabra, "ALIMENTO", limite=1) <= 1:
            return "Alimentos"
        if _distancia_edicion(palabra, "BEBIDAS", limite=1) <= 1 or _distancia_edicion(palabra, "BEBIDA", limite=1) <= 1:
            return "Bebidas"

    return "Otros"


def upgrade() -> None:
    # Se agrega nullable=True primero (SQLite no permite agregar una
    # columna NOT NULL sin default a una tabla con filas existentes),
    # se rellena por Python fila por fila con el mismo clasificador que
    # usa el parseo del Excel, y luego se pasa a NOT NULL vía
    # batch_alter_table (SQLite requiere recrear la tabla para alterar
    # nullability).
    op.add_column('catalogo_productos_carreta_mariscos', sa.Column('categoria_tipo', sa.String(length=20), nullable=True))

    bind = op.get_bind()
    filas = bind.execute(sa.text("SELECT id, tipo FROM catalogo_productos_carreta_mariscos")).fetchall()
    for fila_id, tipo in filas:
        bind.execute(
            sa.text("UPDATE catalogo_productos_carreta_mariscos SET categoria_tipo = :cat WHERE id = :id"),
            {"cat": _clasificar_tipo(tipo), "id": fila_id},
        )

    with op.batch_alter_table('catalogo_productos_carreta_mariscos') as batch_op:
        batch_op.alter_column('categoria_tipo', existing_type=sa.String(length=20), nullable=False)
        batch_op.create_index(
            op.f('ix_catalogo_productos_carreta_mariscos_categoria_tipo'), ['categoria_tipo'], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table('catalogo_productos_carreta_mariscos') as batch_op:
        batch_op.drop_index(op.f('ix_catalogo_productos_carreta_mariscos_categoria_tipo'))
        batch_op.drop_column('categoria_tipo')
