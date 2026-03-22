"""Mood analysis API routes."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies.auth import get_current_user
from limiter import limiter
from schemas import (
    MoodAnalyzeRequest,
    MoodAnalyzeResponse,
    PlaylistRequest,
    PlaylistResponse,
)
from services.mood_service import analyze_mood, generate_playlist

router = APIRouter(prefix="/mood", tags=["mood"])


@router.post("/analyze", response_model=MoodAnalyzeResponse)
@limiter.limit("10/minute")
async def analyze_text(
    request: Request,
    body: MoodAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MoodAnalyzeResponse:
    """Analyze text input and return mood dimensions."""
    result = analyze_mood(body.text)
    return MoodAnalyzeResponse(**result)


@router.post("/playlist", response_model=PlaylistResponse)
@limiter.limit("15/minute")
async def get_playlist(
    request: Request,
    body: PlaylistRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PlaylistResponse:
    """Generate a playlist based on mood dimensions and user preference."""
    playlist = generate_playlist(
        body.dimensions,
        body.preference,
        languages=body.languages,
        artists=body.artists,
        intensity=body.intensity,
        track_count=body.track_count,
    )
    return PlaylistResponse(**playlist)
