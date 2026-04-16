"""Mood analysis API routes."""

from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies.auth import get_current_user
from limiter import limiter
from models.mood_entry import MoodEntry
from models.saved_playlist import SavedPlaylist
from models.song_preference import SongPreference
from models.user import User
from schemas import (
    MoodAnalyzeRequest,
    MoodAnalyzeResponse,
    MoodHistoryResponse,
    MoodStatsResponse,
    PlaylistRequest,
    PlaylistResponse,
    SavedPlaylistCreateRequest,
    SavedPlaylistResponse,
    SongPreferenceBatchResponse,
    SongPreferenceRequest,
    SongPreferenceResponse,
    TranscribeResponse,
)
from services.mood_service import (
    analyze_mood,
    fetch_weather,
    generate_playlist,
    transcribe,
)
from services.ytmusic_service import get_audio_stream_url_cached

router = APIRouter(prefix="/mood", tags=["mood"])


@router.post("/transcribe", response_model=TranscribeResponse)
@limiter.limit("10/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TranscribeResponse:
    """Transcribe uploaded audio to text + prosodic features via Deepgram/AssemblyAI."""
    audio_bytes = await audio.read()
    content_type = audio.content_type or "audio/webm"
    result = await transcribe(audio_bytes, content_type)
    return TranscribeResponse(text=result["text"], prosodic=result.get("prosodic", {}))


@router.post("/analyze", response_model=MoodAnalyzeResponse)
@limiter.limit("10/minute")
async def analyze_text(
    request: Request,
    body: MoodAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MoodAnalyzeResponse:
    """Analyze text input and return emotion analysis via LLM. Auto-saves to history."""
    # Fetch weather if coordinates provided
    weather_context = None
    if body.lat is not None and body.lon is not None:
        weather_context = await fetch_weather(body.lat, body.lon)

    result = await analyze_mood(body.text, weather_context, body.prosodic)

    # ── Auto-save to mood history ──
    # Extract energy and valence from dimensions if available
    energy = 50.0
    valence = 50.0
    for dim in result.get("dimensions", []):
        if dim.get("name", "").lower() == "energy":
            energy = float(dim.get("value", 50))
        elif dim.get("name", "").lower() in ("happiness", "valence"):
            valence = float(dim.get("value", 50))

    weather_cond = ""
    if result.get("weather") and result["weather"].get("condition"):
        weather_cond = result["weather"]["condition"]

    entry = MoodEntry(
        user_id=current_user.id,
        base_emotion=result.get("base_emotion", ""),
        sub_emotion=result.get("sub_emotion", ""),
        confidence=result.get("confidence", 0),
        sentiment=result.get("sentiment", ""),
        genre=result.get("genre", ""),
        input_preview=body.text[:100],
        weather_condition=weather_cond,
        mood_emoji=result.get("moodEmoji", ""),
        energy=energy,
        valence=valence,
    )
    db.add(entry)
    await db.commit()

    return MoodAnalyzeResponse(**result)


@router.get("/history", response_model=MoodHistoryResponse)
@limiter.limit("30/minute")
async def get_mood_history(
    request: Request,
    days: int = 30,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MoodHistoryResponse:
    """Get the user's mood analysis history (last N days)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(MoodEntry)
        .where(MoodEntry.user_id == current_user.id, MoodEntry.created_at >= since)
        .order_by(MoodEntry.created_at.desc())
        .limit(limit)
    )
    entries = result.scalars().all()

    # Count total
    count_result = await db.execute(
        select(func.count(MoodEntry.id)).where(
            MoodEntry.user_id == current_user.id, MoodEntry.created_at >= since
        )
    )
    total = count_result.scalar() or 0

    return MoodHistoryResponse(
        entries=[
            {
                **{c.name: getattr(e, c.name) for c in MoodEntry.__table__.columns},
                "created_at": e.created_at.isoformat() if e.created_at else "",
            }
            for e in entries
        ],
        total=total,
    )


@router.get("/stats", response_model=MoodStatsResponse)
@limiter.limit("30/minute")
async def get_mood_stats(
    request: Request,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MoodStatsResponse:
    """Get aggregated mood statistics for charts."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(MoodEntry)
        .where(MoodEntry.user_id == current_user.id, MoodEntry.created_at >= since)
        .order_by(MoodEntry.created_at.asc())
    )
    entries = list(result.scalars().all())

    if not entries:
        return MoodStatsResponse(
            emotion_distribution=[],
            avg_confidence=0.0,
            total_analyses=0,
            daily_moods=[],
            top_genre="",
            dominant_emotion="",
        )

    # Emotion distribution
    emotion_counts = Counter(e.base_emotion for e in entries)
    emotion_distribution = [
        {"emotion": emotion, "count": count}
        for emotion, count in emotion_counts.most_common()
    ]

    # Average confidence
    avg_confidence = sum(e.confidence for e in entries) / len(entries)

    # Daily moods (last entry per day)
    daily_map = {}
    for e in entries:
        day_key = e.created_at.strftime("%Y-%m-%d") if e.created_at else ""
        daily_map[day_key] = e  # last entry per day (entries are asc ordered)

    daily_moods = [
        {
            "date": day,
            "base_emotion": e.base_emotion,
            "confidence": e.confidence,
            "energy": e.energy,
            "valence": e.valence,
        }
        for day, e in sorted(daily_map.items())
    ]

    # Top genre
    genre_counts = Counter(e.genre for e in entries if e.genre)
    top_genre = genre_counts.most_common(1)[0][0] if genre_counts else ""

    # Dominant emotion
    dominant_emotion = emotion_counts.most_common(1)[0][0] if emotion_counts else ""

    # ── Streak (consecutive days with at least 1 analysis) ──
    today = datetime.now(timezone.utc).date()
    analysis_dates = sorted(
        set(e.created_at.date() for e in entries if e.created_at), reverse=True
    )
    streak = 0
    expected = today
    for d in analysis_dates:
        if d == expected:
            streak += 1
            expected -= timedelta(days=1)
        elif d == expected - timedelta(days=1):
            # Allow yesterday as start
            expected = d
            streak += 1
            expected -= timedelta(days=1)
        else:
            break

    # ── Week-over-Week Comparison ──
    now = datetime.now(timezone.utc)
    this_week_start = now - timedelta(days=7)
    last_week_start = now - timedelta(days=14)

    this_week = [e for e in entries if e.created_at and e.created_at >= this_week_start]
    last_week = [
        e
        for e in entries
        if e.created_at and last_week_start <= e.created_at < this_week_start
    ]

    def avg_or_zero(items, attr):
        vals = [getattr(e, attr, 0) for e in items]
        return sum(vals) / len(vals) if vals else 0.0

    week_comparison = {
        "this_week_analyses": len(this_week),
        "last_week_analyses": len(last_week),
        "confidence_delta": round(
            avg_or_zero(this_week, "confidence") - avg_or_zero(last_week, "confidence"),
            1,
        ),
        "energy_delta": round(
            avg_or_zero(this_week, "energy") - avg_or_zero(last_week, "energy"), 1
        ),
        "valence_delta": round(
            avg_or_zero(this_week, "valence") - avg_or_zero(last_week, "valence"), 1
        ),
    }

    # ── Calendar Heatmap Data (last 90 days) ──
    cal_start = now - timedelta(days=90)
    cal_entries = [e for e in entries if e.created_at and e.created_at >= cal_start]
    cal_map = {}
    for e in cal_entries:
        day_key = e.created_at.strftime("%Y-%m-%d")
        if day_key not in cal_map:
            cal_map[day_key] = {"count": 0, "emotions": []}
        cal_map[day_key]["count"] += 1
        cal_map[day_key]["emotions"].append(e.base_emotion)

    calendar_data = []
    for day_key, info in sorted(cal_map.items()):
        dominant = (
            Counter(info["emotions"]).most_common(1)[0][0] if info["emotions"] else ""
        )
        calendar_data.append(
            {
                "date": day_key,
                "count": info["count"],
                "dominant_emotion": dominant,
            }
        )

    return MoodStatsResponse(
        emotion_distribution=emotion_distribution,
        avg_confidence=round(avg_confidence, 1),
        total_analyses=len(entries),
        daily_moods=daily_moods,
        top_genre=top_genre,
        dominant_emotion=dominant_emotion,
        streak=streak,
        week_comparison=week_comparison,
        calendar_data=calendar_data,
    )


@router.post("/playlist", response_model=PlaylistResponse)
@limiter.limit("15/minute")
async def get_playlist(
    request: Request,
    body: PlaylistRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaylistResponse:
    """Generate a YouTube Music playlist based on mood and user preferences."""
    playlist = await generate_playlist(
        body.dimensions,
        body.preference,
        languages=body.languages,
        artists=body.artists,
        match_mode=body.match_mode,
        intensity=body.intensity,
        track_count=body.track_count,
        genre=body.genre,
        base_emotion=body.base_emotion,
    )
    return PlaylistResponse(**playlist)


@router.get("/stream/{video_id}")
@limiter.limit("30/minute")
async def get_stream(
    request: Request,
    video_id: str,
    current_user: User = Depends(get_current_user),
):
    """Extract audio stream URL for a YouTube Music track (on-demand)."""
    try:
        # Use cached function with built-in timeout
        audio_url = await get_audio_stream_url_cached(video_id)
        return {"audio_url": audio_url}
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=f"Could not extract audio: {e}")


@router.get("/playlists", response_model=list[SavedPlaylistResponse])
@limiter.limit("30/minute")
async def get_saved_playlists(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SavedPlaylistResponse]:
    """Get saved playlists for current user."""
    result = await db.execute(
        select(SavedPlaylist)
        .where(SavedPlaylist.user_id == current_user.id)
        .order_by(SavedPlaylist.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        SavedPlaylistResponse(
            id=row.id,
            title=row.title,
            mood=row.mood,
            mood_emoji=row.mood_emoji,
            base_emotion=row.base_emotion,
            tracks=int(row.tracks_count or 0),
            trackList=row.track_list or [],
            duration=row.duration,
            gradient=row.gradient,
            accent=row.accent,
            preference=row.preference,
            settings=row.settings or {},
            analysis=row.analysis or {},
            created_at=row.created_at.isoformat() if row.created_at else "",
        )
        for row in rows
    ]


@router.post("/playlists", response_model=SavedPlaylistResponse)
@limiter.limit("30/minute")
async def save_playlist(
    request: Request,
    body: SavedPlaylistCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedPlaylistResponse:
    """Save generated playlist for current user (cross-device sync)."""
    row = SavedPlaylist(
        user_id=current_user.id,
        title=body.title,
        mood=body.mood,
        mood_emoji=body.mood_emoji,
        base_emotion=body.base_emotion,
        tracks_count=body.tracks,
        track_list=body.track_list,
        duration=body.duration,
        gradient=body.gradient,
        accent=body.accent,
        preference=body.preference,
        settings=body.settings,
        analysis=body.analysis,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return SavedPlaylistResponse(
        id=row.id,
        title=row.title,
        mood=row.mood,
        mood_emoji=row.mood_emoji,
        base_emotion=row.base_emotion,
        tracks=int(row.tracks_count or 0),
        trackList=row.track_list or [],
        duration=row.duration,
        gradient=row.gradient,
        accent=row.accent,
        preference=row.preference,
        settings=row.settings or {},
        analysis=row.analysis or {},
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


@router.delete("/playlists/{playlist_id}")
@limiter.limit("30/minute")
async def delete_saved_playlist(
    request: Request,
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a saved playlist owned by current user."""
    result = await db.execute(
        select(SavedPlaylist).where(
            SavedPlaylist.id == playlist_id,
            SavedPlaylist.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return {"status": "ok"}


# ══════════════════════════════════════
#  Song Preference Endpoints
# ══════════════════════════════════════


@router.put("/songs/preference", response_model=SongPreferenceResponse)
@limiter.limit("60/minute")
async def set_song_preference(
    request: Request,
    body: SongPreferenceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SongPreferenceResponse:
    """Set or update a like/dislike preference for a song (upsert)."""
    # Check if preference already exists
    result = await db.execute(
        select(SongPreference).where(
            SongPreference.user_id == current_user.id,
            SongPreference.song_key == body.song_key,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.preference = body.preference
        existing.song_title = body.song_title or existing.song_title
        existing.song_artist = body.song_artist or existing.song_artist
    else:
        pref = SongPreference(
            user_id=current_user.id,
            song_key=body.song_key,
            preference=body.preference,
            song_title=body.song_title,
            song_artist=body.song_artist,
        )
        db.add(pref)

    await db.commit()

    return SongPreferenceResponse(
        song_key=body.song_key,
        preference=body.preference,
        song_title=body.song_title,
        song_artist=body.song_artist,
    )


@router.delete("/songs/preference/{song_key}")
@limiter.limit("60/minute")
async def remove_song_preference(
    request: Request,
    song_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a like/dislike preference for a song."""
    result = await db.execute(
        select(SongPreference).where(
            SongPreference.user_id == current_user.id,
            SongPreference.song_key == song_key,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
    return {"status": "ok"}


@router.post("/songs/preferences", response_model=SongPreferenceBatchResponse)
@limiter.limit("30/minute")
async def get_song_preferences(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SongPreferenceBatchResponse:
    """Get preferences for a batch of song keys. Body: {"song_keys": [...]}"""
    raw_song_keys = body.get("song_keys", [])
    if not isinstance(raw_song_keys, list):
        return SongPreferenceBatchResponse(preferences={})

    # Defensive normalization to prevent DB errors from malformed payloads.
    song_keys = [
        str(k).strip()[:255]
        for k in raw_song_keys
        if isinstance(k, str) and str(k).strip()
    ]
    if not song_keys:
        return SongPreferenceBatchResponse(preferences={})

    result = await db.execute(
        select(SongPreference).where(
            SongPreference.user_id == current_user.id,
            SongPreference.song_key.in_(song_keys),
        )
    )
    prefs = result.scalars().all()

    return SongPreferenceBatchResponse(
        preferences={p.song_key: p.preference for p in prefs}
    )
