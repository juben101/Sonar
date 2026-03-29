"""
Mood Service — orchestrates transcription, weather, LLM analysis, and Spotify.

This is the high-level service called by routes. It delegates to:
  - transcription_service.transcribe_audio() for speech → text
  - weather_service.get_weather() for location → weather context
  - llm_service.analyze_emotion() for text → emotion
  - spotify_service.get_recommendations() for emotion → playlist
"""

import logging

from services.llm_service import analyze_emotion
from services.spotify_service import get_recommendations
from services.transcription_service import transcribe_audio
from services.weather_service import get_weather

logger = logging.getLogger("sonar.mood")


async def transcribe(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    """Transcribe audio to text."""
    return await transcribe_audio(audio_bytes, content_type)


async def fetch_weather(lat: float, lon: float) -> dict | None:
    """Fetch weather for coordinates."""
    return await get_weather(lat, lon)


async def analyze_mood(
    text: str, weather_context: dict | None = None
) -> dict:
    """Analyze text and return structured emotion analysis."""
    result = await analyze_emotion(text, weather_context)

    # Attach weather info to response if available
    if weather_context:
        result["weather"] = {
            "city": weather_context.get("city", ""),
            "condition": weather_context.get("condition", ""),
            "description": weather_context.get("description", ""),
            "temp_c": weather_context.get("temp_c", 0),
        }

    return result


async def generate_playlist(
    dimensions: list[dict],
    preference: str = "match",
    languages: list[str] | None = None,
    artists: list[str] | None = None,
    intensity: int = 50,
    track_count: int = 15,
    genre: str = "pop",
    base_emotion: str = "Calm",
) -> dict:
    """Generate a Spotify playlist based on mood analysis results."""
    tracks = await get_recommendations(
        genre=genre,
        languages=languages,
        artists=artists,
        intensity=intensity,
        track_count=track_count,
        preference=preference,
        base_emotion=base_emotion,
    )

    # Determine playlist name from emotion + genre
    title = f"{base_emotion} · {genre.title()}"

    return {"title": title, "tracks": tracks}
