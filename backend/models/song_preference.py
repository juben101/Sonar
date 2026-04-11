"""SongPreference model — stores user like/dislike for songs."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class SongPreference(Base):
    __tablename__ = "song_preferences"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Unique song identifier (youtube_url or title::artist)
    song_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # "like" or "dislike"
    preference: Mapped[str] = mapped_column(String(10), nullable=False)
    # Metadata for display
    song_title: Mapped[str] = mapped_column(String(255), default="")
    song_artist: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    user = relationship("User", backref="song_preferences")

    __table_args__ = (UniqueConstraint("user_id", "song_key", name="uq_user_song"),)
