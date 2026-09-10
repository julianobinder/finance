"""add category merge alias

Revision ID: 754a2769136d
Revises: ff8f44fe98ae
Create Date: 2026-07-15 00:41:26.727136
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '754a2769136d'
down_revision = 'ff8f44fe98ae'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('category', sa.Column('merged_into_category_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'category_merged_into_category_id_fkey', 'category', 'category',
        ['merged_into_category_id'], ['category_id'],
    )


def downgrade() -> None:
    op.drop_constraint('category_merged_into_category_id_fkey', 'category', type_='foreignkey')
    op.drop_column('category', 'merged_into_category_id')
