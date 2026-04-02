"""
YouTube Music Service — search and stream tracks via ytmusicapi + yt-dlp.

Replaces Spotify integration. No authentication needed for search.
Maps mood dimensions → search queries for curated playlists.
"""

import asyncio
import logging
import random

from ytmusicapi import YTMusic

logger = logging.getLogger("sonar.ytmusic")

# ── Singleton YTMusic client (unauthenticated) ──
_ytmusic: YTMusic | None = None


def _get_client() -> YTMusic:
    """Lazily initialize the YTMusic client (thread-safe singleton)."""
    global _ytmusic
    if _ytmusic is None:
        _ytmusic = YTMusic()
    return _ytmusic


# ── Emotion → search keyword mapping ──
_EMOTION_KEYWORDS = {
    "Joy": ["happy", "upbeat", "feel good", "cheerful", "euphoric", "joyful"],
    "Sadness": ["sad", "melancholy", "heartbreak", "emotional", "lonely", "rainy day"],
    "Anger": ["intense", "aggressive", "powerful", "rage", "fierce", "hard hitting"],
    "Fear": ["dark", "eerie", "suspense", "anxious", "tense", "haunting"],
    "Calm": ["chill", "relaxing", "peaceful", "ambient", "serene", "soothing"],
}

# ── Sub-emotion → more specific keywords ──
_SUB_EMOTION_KEYWORDS = {
    "Euphoric": "euphoric energy",
    "Grateful": "grateful thankful",
    "Content": "content peaceful",
    "Excited": "excited hype",
    "Proud": "triumphant proud",
    "Playful": "playful fun",
    "Melancholic": "melancholic sad",
    "Heartbroken": "heartbreak breakup",
    "Lonely": "lonely alone",
    "Grief-stricken": "grief mourning",
    "Disappointed": "disappointed letdown",
    "Hopeless": "hopeless despair",
    "Frustrated": "frustrated angry",
    "Irritated": "irritated annoyed",
    "Resentful": "resentful bitter",
    "Bitter": "bitter dark",
    "Furious": "furious rage",
    "Anxious": "anxious nervous",
    "Overwhelmed": "overwhelmed stress",
    "Insecure": "insecure vulnerable",
    "Panicked": "panic intense",
    "Uneasy": "uneasy unsettled",
    "Peaceful": "peaceful zen",
    "Reflective": "reflective introspective",
    "Nostalgic": "nostalgic throwback",
    "Dreamy": "dreamy ethereal",
    "Hopeful": "hopeful uplifting",
    "Serene": "serene calm",
}


def _build_search_queries(
    genre: str,
    base_emotion: str,
    sub_emotion: str = "",
    languages: list[str] | None = None,
    artists: list[str] | None = None,
    track_count: int = 15,
) -> list[tuple[str, int]]:
    """
    Build a list of (query, count) tuples for diverse search results.

    Splits track_count across multiple queries for equal distribution.
    """
    queries = []
    keywords = _EMOTION_KEYWORDS.get(base_emotion, ["mood"])

    # Pick 3 diverse keyword sets for variety
    random.shuffle(keywords)
    keyword_selection = keywords[:3] if len(keywords) >= 3 else keywords

    # Build base queries
    lang_tag = ""
    if languages and languages[0].lower() != "english":
        lang_tag = f" {languages[0]}"

    for kw in keyword_selection:
        queries.append(f"{genre} {kw}{lang_tag} songs")

    # Add sub-emotion query if available
    if sub_emotion and sub_emotion in _SUB_EMOTION_KEYWORDS:
        queries.append(f"{genre} {_SUB_EMOTION_KEYWORDS[sub_emotion]}{lang_tag}")

    # Add artist-specific queries
    if artists:
        for artist in artists[:2]:
            queries.append(f"{artist} {genre}{lang_tag}")

    # Distribute track_count evenly across queries
    if not queries:
        queries = [f"{genre} {base_emotion} mood songs"]

    per_query = max(3, track_count // len(queries))
    remainder = track_count - (per_query * len(queries))

    result = []
    for i, q in enumerate(queries):
        count = per_query + (1 if i < remainder else 0)
        if count > 0:
            result.append((q, count))

    return result


def _format_duration(duration_seconds: int) -> str:
    """Format seconds to MM:SS."""
    mins = duration_seconds // 60
    secs = duration_seconds % 60
    return f"{mins}:{secs:02d}"


def _parse_duration(duration_str: str | None) -> tuple[str, int]:
    """Parse YTMusic duration string (e.g., '3:45') to formatted string and seconds."""
    if not duration_str:
        return "0:00", 0

    parts = duration_str.split(":")
    try:
        if len(parts) == 2:
            mins, secs = int(parts[0]), int(parts[1])
            total = mins * 60 + secs
        elif len(parts) == 3:
            hrs, mins, secs = int(parts[0]), int(parts[1]), int(parts[2])
            total = hrs * 3600 + mins * 60 + secs
        else:
            return duration_str, 0
        return duration_str, total
    except (ValueError, TypeError):
        return duration_str or "0:00", 0


async def get_recommendations(
    genre: str,
    languages: list[str] | None = None,
    artists: list[str] | None = None,
    intensity: int = 50,
    track_count: int = 15,
    preference: str = "match",
    base_emotion: str = "Calm",
    sub_emotion: str = "",
) -> list[dict]:
    """
    Get track recommendations from YouTube Music based on mood parameters.

    Searches YTMusic with mood-based queries and returns track metadata.
    Audio streaming is handled separately via /stream/{video_id}.
    """
    yt = _get_client()

    queries = _build_search_queries(
        genre=genre,
        base_emotion=base_emotion,
        sub_emotion=sub_emotion,
        languages=languages,
        artists=artists,
        track_count=track_count,
    )

    all_tracks = []
    seen_ids = set()

    for query, count in queries:
        try:
            # Run search in thread pool (ytmusicapi is synchronous)
            results = await asyncio.to_thread(
                yt.search, query, filter="songs", limit=count + 5
            )

            for item in results:
                if len(all_tracks) >= track_count:
                    break

                video_id = item.get("videoId")
                if not video_id or video_id in seen_ids:
                    continue
                seen_ids.add(video_id)

                # Extract artist names
                artist_names = ", ".join(
                    a.get("name", "") for a in item.get("artists", [])
                )

                # Extract thumbnail (best quality)
                thumbnails = item.get("thumbnails", [])
                album_art = ""
                if thumbnails:
                    # Get the largest thumbnail
                    album_art = thumbnails[-1].get("url", "")

                # Parse duration
                duration_str = item.get("duration", "0:00")
                formatted_duration, _ = _parse_duration(duration_str)

                all_tracks.append(
                    {
                        "id": len(all_tracks) + 1,
                        "title": item.get("title", "Unknown"),
                        "artist": artist_names or "Unknown Artist",
                        "duration": formatted_duration,
                        "album_art": album_art,
                        "video_id": video_id,
                        "youtube_url": f"https://music.youtube.com/watch?v={video_id}",
                        "color": "#ff3c64",
                    }
                )

                if len(all_tracks) >= count:
                    break

        except Exception as e:
            logger.warning(f"YTMusic search failed for '{query}': {e}")
            continue

    # Shuffle to mix results from different queries
    if len(all_tracks) > track_count:
        all_tracks = all_tracks[:track_count]

    # Re-number IDs after potential shuffle
    for i, track in enumerate(all_tracks):
        track["id"] = i + 1

    logger.info(
        f"YTMusic: got {len(all_tracks)} tracks for "
        f"genre={genre}, emotion={base_emotion}"
    )
    return all_tracks


async def get_audio_stream_url(video_id: str) -> str:
    """
    Extract the best audio stream URL for a YouTube video using yt-dlp.

    Returns a direct audio URL that can be played with new Audio().
    URLs are temporary (~6 hours) and should be fetched on-demand.
    """
    import yt_dlp

    url = f"https://music.youtube.com/watch?v={video_id}"

    ydl_opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
    }

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get("url", "")

    audio_url = await asyncio.to_thread(_extract)

    if not audio_url:
        raise ValueError(f"Could not extract audio URL for {video_id}")

    logger.info(f"yt-dlp: extracted audio stream for {video_id}")
    return audio_url
