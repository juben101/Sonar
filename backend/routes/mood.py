"""Mood analysis API routes."""

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies.auth import get_current_user
from limiter import limiter
from schemas import (
    MoodAnalyzeRequest,
    MoodAnalyzeResponse,
    PlaylistRequest,
    PlaylistResponse,
    TranscribeResponse,
)
from services.mood_service import (
    analyze_mood,
    fetch_weather,
    generate_playlist,
    transcribe,
)

router = APIRouter(prefix="/mood", tags=["mood"])


@router.post("/transcribe", response_model=TranscribeResponse)
@limiter.limit("10/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> TranscribeResponse:
    """Transcribe uploaded audio to text via Deepgram/AssemblyAI."""
    audio_bytes = await audio.read()
    content_type = audio.content_type or "audio/webm"
    text = await transcribe(audio_bytes, content_type)
    return TranscribeResponse(text=text)


@router.post("/analyze", response_model=MoodAnalyzeResponse)
@limiter.limit("10/minute")
async def analyze_text(
    request: Request,
    body: MoodAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> MoodAnalyzeResponse:
    """Analyze text input and return emotion analysis via LLM."""
    # Fetch weather if coordinates provided
    weather_context = None
    if body.lat is not None and body.lon is not None:
        weather_context = await fetch_weather(body.lat, body.lon)

    result = await analyze_mood(body.text, weather_context)
    return MoodAnalyzeResponse(**result)


@router.post("/playlist", response_model=PlaylistResponse)
@limiter.limit("15/minute")
async def get_playlist(
    request: Request,
    body: PlaylistRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PlaylistResponse:
    """Generate a Spotify playlist based on mood and user preferences."""
    playlist = await generate_playlist(
        body.dimensions,
        body.preference,
        languages=body.languages,
        artists=body.artists,
        intensity=body.intensity,
        track_count=body.track_count,
        genre=body.genre,
        base_emotion=body.base_emotion,
    )
    return PlaylistResponse(**playlist)
