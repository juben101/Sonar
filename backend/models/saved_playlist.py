"""SavedPlaylist model — stores user-saved generated playlists across devices."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class SavedPlaylist(Base):
    __tablename__ = "saved_playlists"

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

    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    mood: Mapped[str] = mapped_column(String(100), default="")
    mood_emoji: Mapped[str] = mapped_column(String(16), default="")
    base_emotion: Mapped[str] = mapped_column(String(50), default="")
    tracks_count: Mapped[int] = mapped_column(Integer, default=0)
    duration: Mapped[str] = mapped_column(String(50), default="")
    gradient: Mapped[str] = mapped_column(String(255), default="")
    accent: Mapped[str] = mapped_column(String(32), default="")
    preference: Mapped[str] = mapped_column(String(20), default="match")
    track_list: Mapped[list] = mapped_column(JSON, default=list)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    user = relationship("User", backref="saved_playlists")
