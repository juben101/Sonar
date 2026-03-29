"""MoodEntry model — stores each mood analysis for history tracking."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class MoodEntry(Base):
    __tablename__ = "mood_entries"

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
    base_emotion: Mapped[str] = mapped_column(String(50), nullable=False)
    sub_emotion: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    sentiment: Mapped[str] = mapped_column(String(20), nullable=False)
    genre: Mapped[str] = mapped_column(String(50), default="")
    input_preview: Mapped[str] = mapped_column(
        String(100), default=""
    )  # first 100 chars
    weather_condition: Mapped[str] = mapped_column(String(50), default="")
    mood_emoji: Mapped[str] = mapped_column(String(10), default="")
    energy: Mapped[float] = mapped_column(Float, default=50.0)
    valence: Mapped[float] = mapped_column(Float, default=50.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # Relationship
    user = relationship("User", backref="mood_entries")
