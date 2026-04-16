"""add user profile fields

Revision ID: 4a7b8c9d0e11
Revises: 2c4f3d9e0b10
Create Date: 2026-04-16 11:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4a7b8c9d0e11"
down_revision: Union[str, None] = "2c4f3d9e0b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("username_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "username_changed_at")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "email")
