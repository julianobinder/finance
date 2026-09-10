"""add payee merge alias

Revision ID: ff8f44fe98ae
Revises: 0001
Create Date: 2026-07-15 00:09:37.983428
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ff8f44fe98ae'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('payee', sa.Column('merged_into_payee_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'payee_merged_into_payee_id_fkey', 'payee', 'payee',
        ['merged_into_payee_id'], ['payee_id'],
    )


def downgrade() -> None:
    op.drop_constraint('payee_merged_into_payee_id_fkey', 'payee', type_='foreignkey')
    op.drop_column('payee', 'merged_into_payee_id')
