"""add status to salary payment

Revision ID: aa42be3042a1
Revises: 5339143f076d
Create Date: 2026-09-05 01:01:15.893606

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'aa42be3042a1'
down_revision = '5339143f076d'
branch_labels = None
depends_on = None
def upgrade():
    # 1. Add the column allowing NULLs temporarily
    with op.batch_alter_table('salary_payment', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(length=50), nullable=True))

    # 2. Update all existing rows to have the default value 'approved'
    op.execute("UPDATE salary_payment SET status = 'approved'")

    # 3. Alter the column to enforce NOT NULL now that existing rows are populated
    with op.batch_alter_table('salary_payment', schema=None) as batch_op:
        batch_op.alter_column('status', nullable=False)


def downgrade():
    with op.batch_alter_table('salary_payment', schema=None) as batch_op:
        batch_op.drop_column('status')
    # ### end Alembic commands ###
