"""
Mood Service — orchestrates transcription, weather, LLM analysis, and YouTube Music.

This is the high-level service called by routes. It delegates to:
  - transcription_service.transcribe_audio() for speech → text + prosodic features
  - weather_service.get_weather() for location → weather context
  - llm_service.analyze_emotion() for text → emotion
  - ytmusic_service.get_recommendations() for emotion → playlist
"""

import logging

from services.llm_service import analyze_emotion
from services.ytmusic_service import get_recommendations, get_audio_stream_url
from services.transcription_service import transcribe_audio
from services.weather_service import get_weather

logger = logging.getLogger("sonar.mood")


async def transcribe(audio_bytes: bytes, content_type: str = "audio/webm") -> dict:
    """Transcribe audio to text + prosodic features."""
    return await transcribe_audio(audio_bytes, content_type)


async def fetch_weather(lat: float, lon: float) -> dict | None:
    """Fetch weather for coordinates."""
    return await get_weather(lat, lon)


async def analyze_mood(
    text: str,
    weather_context: dict | None = None,
    prosodic_context: dict | None = None,
) -> dict:
    """Analyze text and return structured emotion analysis."""
    result = await analyze_emotion(text, weather_context, prosodic_context)

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
    match_mode: str = "smart",
    intensity: int = 50,
    track_count: int = 15,
    genre: str = "pop",
    base_emotion: str = "Calm",
    sub_emotion: str = "",
) -> dict:
    """Generate a YouTube Music playlist based on mood analysis results."""
    tracks = await get_recommendations(
        genre=genre,
        languages=languages,
        artists=artists,
        match_mode=match_mode,
        intensity=intensity,
        track_count=track_count,
        preference=preference,
        base_emotion=base_emotion,
        sub_emotion=sub_emotion,
    )

    # Determine playlist name from emotion + genre
    title = f"{base_emotion} · {genre.title()}"

    # Generate playlist summary explaining why these songs were chosen
    playlist_reason = _build_playlist_reason(
        genre=genre,
        base_emotion=base_emotion,
        preference=preference,
        languages=languages,
        artists=artists,
        match_mode=match_mode,
        intensity=intensity,
        track_count=len(tracks),
    )

    return {"title": title, "tracks": tracks, "playlist_reason": playlist_reason}


def _build_playlist_reason(
    genre: str,
    base_emotion: str,
    preference: str,
    languages: list[str] | None,
    artists: list[str] | None,
    match_mode: str,
    intensity: int,
    track_count: int,
) -> str:
    """Build a human-readable explanation of why this playlist was curated."""
    parts = []

    # Emotion + preference context
    if preference == "match":
        parts.append(
            f"This playlist of {track_count} tracks was curated to match your "
            f"{base_emotion.lower()} emotional state"
        )
    else:
        parts.append(
            f"This playlist of {track_count} tracks was curated to gently uplift "
            f"your mood from {base_emotion.lower()}"
        )

    # Genre
    parts[0] += f" through {genre} music."

    # Intensity
    if intensity < 33:
        parts.append(
            "We kept the intensity soft — gentle melodies and quieter arrangements "
            "that won't overwhelm."
        )
    elif intensity > 66:
        parts.append(
            "We dialed up the intensity — expect powerful vocals, driving rhythms, "
            "and energetic arrangements."
        )

    # Languages
    if languages and len(languages) > 1:
        lang_str = ", ".join(languages[:-1]) + f" and {languages[-1]}"
        parts.append(
            f"Songs are distributed across {lang_str} for a diverse listening experience."
        )
    elif languages and languages[0] != "English":
        parts.append(f"Focused on {languages[0]} music to match your preference.")

    # Artists
    if artists and len(artists) > 0:
        if len(artists) <= 3:
            artist_str = ", ".join(artists)
        else:
            artist_str = ", ".join(artists[:3]) + f" and {len(artists) - 3} more"
        verb = (
            "strictly matched"
            if match_mode == "strict"
            else "prioritized tracks from or similar to"
        )
        parts.append(f"We {verb} {artist_str}.")

    if languages:
        if match_mode == "strict":
            parts.append(
                "Strict matching was enabled, so we favored exact language/artist alignment over diversity."
            )
        else:
            parts.append(
                "Smart matching was enabled to balance your selections with better discovery and track quality."
            )

    return " ".join(parts)


async def stream_audio(video_id: str) -> str:
    """Get audio stream URL for a YouTube Music track."""
    return await get_audio_stream_url(video_id)
