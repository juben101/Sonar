"""add saved_playlists table

Revision ID: 2c4f3d9e0b10
Revises: 89f15ba6a167
Create Date: 2026-04-13 14:05:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2c4f3d9e0b10"
down_revision: Union[str, None] = "89f15ba6a167"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_playlists",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("mood", sa.String(length=100), nullable=False),
        sa.Column("mood_emoji", sa.String(length=16), nullable=False),
        sa.Column("base_emotion", sa.String(length=50), nullable=False),
        sa.Column("tracks_count", sa.Integer(), nullable=False),
        sa.Column("track_list", sa.JSON(), nullable=False),
        sa.Column("duration", sa.String(length=50), nullable=False),
        sa.Column("gradient", sa.String(length=255), nullable=False),
        sa.Column("accent", sa.String(length=32), nullable=False),
        sa.Column("preference", sa.String(length=20), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("analysis", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_saved_playlists_user_id"), "saved_playlists", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_saved_playlists_title"), "saved_playlists", ["title"], unique=False
    )
    op.create_index(
        op.f("ix_saved_playlists_created_at"),
        "saved_playlists",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_saved_playlists_created_at"), table_name="saved_playlists")
    op.drop_index(op.f("ix_saved_playlists_title"), table_name="saved_playlists")
    op.drop_index(op.f("ix_saved_playlists_user_id"), table_name="saved_playlists")
    op.drop_table("saved_playlists")
