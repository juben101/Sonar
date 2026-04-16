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
) -> list[dict]:
    """
    Build a list of (query, count) tuples for diverse search results.

    Distributes track_count across ALL languages and ALL artists evenly.
    """
    keywords = _EMOTION_KEYWORDS.get(base_emotion, ["mood"])
    random.shuffle(keywords)

    langs = languages or ["English"]
    raw_queries: list[dict] = []

    # ── Per-language queries ──
    for lang in langs:
        lang_tag = "" if lang.lower() == "english" else f" {lang}"

        # 1-2 keyword+genre queries per language
        for kw in keywords[:2]:
            raw_queries.append(
                {
                    "query": f"{genre} {kw}{lang_tag} songs",
                    "language": lang,
                    "artist": None,
                }
            )

        # Sub-emotion query per language
        if sub_emotion and sub_emotion in _SUB_EMOTION_KEYWORDS:
            raw_queries.append(
                {
                    "query": f"{genre} {_SUB_EMOTION_KEYWORDS[sub_emotion]}{lang_tag}",
                    "language": lang,
                    "artist": None,
                }
            )

    # ── Per-artist queries (ALL artists) ──
    if artists:
        for artist in artists:
            raw_queries.append(
                {
                    "query": f"{artist} {genre}",
                    "language": None,
                    "artist": artist,
                }
            )

    # Fallback
    if not raw_queries:
        raw_queries = [
            {
                "query": f"{genre} {base_emotion} mood songs",
                "language": None,
                "artist": None,
            }
        ]

    # ── Distribute track_count evenly across queries ──
    per_query = max(1, track_count // len(raw_queries))
    remainder = track_count % len(raw_queries)

    result = []
    for i, q in enumerate(raw_queries):
        count = per_query + (1 if i < remainder else 0)
        if count > 0:
            result.append({**q, "count": count})

    return result


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def _matches_any_artist(track_artist: str, artists: list[str] | None) -> bool:
    if not artists:
        return False
    ta = _normalize(track_artist)
    return any(_normalize(a) in ta for a in artists if a)


def _matches_language_hint(track: dict, languages: list[str] | None) -> bool:
    if not languages:
        return False
    hint = _normalize(track.get("_language_hint", ""))
    return hint in {_normalize(lang) for lang in languages}


def _select_tracks(
    candidates: list[dict],
    track_count: int,
    languages: list[str] | None,
    artists: list[str] | None,
    match_mode: str,
) -> list[dict]:
    """
    Hybrid selection strategy.
    - smart: guarantee baseline representation for selected artists/languages, then fill by quality/diversity
    - strict: strongly filter to tracks matching selected artist/language hints first
    """
    selected: list[dict] = []
    selected_ids: set[str] = set()

    random.shuffle(candidates)

    def add_track(track: dict) -> None:
        vid = track.get("video_id")
        if not vid or vid in selected_ids or len(selected) >= track_count:
            return
        selected.append(track)
        selected_ids.add(vid)

    if artists:
        for artist in artists:
            for track in candidates:
                if _matches_any_artist(track.get("_artist_raw", ""), [artist]):
                    add_track(track)
                    break

    if languages:
        for lang in languages:
            for track in candidates:
                if _normalize(track.get("_language_hint", "")) == _normalize(lang):
                    add_track(track)
                    break

    if match_mode == "strict":
        constrained_pool = [
            t
            for t in candidates
            if _matches_any_artist(t.get("_artist_raw", ""), artists)
            or _matches_language_hint(t, languages)
        ]
        for track in constrained_pool:
            add_track(track)
        if len(selected) < track_count:
            for track in candidates:
                add_track(track)
    else:
        for track in candidates:
            add_track(track)

    return selected[:track_count]


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
    match_mode: str = "smart",
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

    for query_meta in queries:
        query = query_meta["query"]
        count = query_meta["count"]
        try:
            # Run search in thread pool (ytmusicapi is synchronous)
            results = await asyncio.to_thread(
                yt.search, query, filter="songs", limit=count + 5
            )

            added_for_query = 0
            for item in results:
                if added_for_query >= count:
                    break
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
                        "_artist_raw": artist_names,
                        "_language_hint": query_meta.get("language") or "",
                    }
                )
                added_for_query += 1

        except Exception as e:
            logger.warning(f"YTMusic search failed for '{query}': {e}")
            continue

    all_tracks = _select_tracks(
        candidates=all_tracks,
        track_count=track_count,
        languages=languages,
        artists=artists,
        match_mode=match_mode,
    )

    # Remove internal helper fields before response
    for track in all_tracks:
        track.pop("_artist_raw", None)
        track.pop("_language_hint", None)

    # Re-number IDs after shuffle
    for i, track in enumerate(all_tracks):
        track["id"] = i + 1

    logger.info(
        f"YTMusic: got {len(all_tracks)} tracks for "
        f"genre={genre}, emotion={base_emotion}"
    )
    return all_tracks


import time
from typing import Dict, Tuple

# Simple in-memory cache: {video_id: (url, expires_at)}
_stream_cache: Dict[str, Tuple[str, float]] = {}
CACHE_TTL = 60 * 60 * 5  # 5 hours (URLs expire in ~6h)


async def get_audio_stream_url_cached(video_id: str) -> str:
    """Get audio stream URL with caching to avoid repeated extractions."""
    now = time.time()
    
    # Check cache first
    if video_id in _stream_cache:
        url, expires = _stream_cache[video_id]
        if now < expires:
            logger.info(f"Using cached stream URL for {video_id}")
            return url  # instant return
        else:
            # Expired, remove from cache
            del _stream_cache[video_id]
    
    # Extract with hard timeout
    try:
        url = await asyncio.wait_for(
            get_audio_stream_url(video_id),
            timeout=25.0  # fail fast before CloudFront kills it
        )
    except asyncio.TimeoutError:
        raise ValueError("Audio extraction timed out. Please try again.")
    
    # Cache the result
    _stream_cache[video_id] = (url, now + CACHE_TTL)
    logger.info(f"Cached stream URL for {video_id}")
    return url


async def get_audio_stream_url(video_id: str) -> str:
    """
    Extract the best audio stream URL for a YouTube video using yt-dlp.

    Returns a direct audio URL that can be played with new Audio().
    URLs are temporary (~6 hours) and should be fetched on-demand.
    """
    import asyncio
    import yt_dlp
    
    url_candidates = [
        f"https://www.youtube.com/watch?v={video_id}",
        f"https://music.youtube.com/watch?v={video_id}",
    ]

    base_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 10,
        "retries": 1,
        "fragment_retries": 2,
        "no_check_certificate": True,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        },
    }

    import os
    
    # Check if cookie file exists for deployed server
    cookie_file = os.environ.get("YT_COOKIE_FILE", "/opt/sonar/backend/cookies.txt")
    has_cookie_file = os.path.exists(cookie_file)
    
    if has_cookie_file:
        logger.info(f"Using manual cookie file: {cookie_file}")
    
    option_sets = []
    
    # If cookie file exists, use it with prioritized player clients
    if has_cookie_file:
        option_sets.extend([
            {
                **base_opts,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["web"],
                        "po_token_ver": "2",
                    }
                },
                "cookiefile": cookie_file,
            },
            {
                **base_opts,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["android"],
                        "po_token_ver": "2",
                    }
                },
                "cookiefile": cookie_file,
            },
            {
                **base_opts,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["music"],
                    }
                },
                "cookiefile": cookie_file,
            },
        ])
    else:
        # Fallback to browser cookies (only works locally)
        logger.warning("No cookie file found, falling back to browser cookies (may not work on deployed server)")
        option_sets.extend([
            {
                **base_opts,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["android", "web", "ios", "mweb"],
                        "po_token_ver": "2",
                    }
                },
                "cookiesfrombrowser": ("chrome",),
            },
            {
                **base_opts,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["android", "web", "ios", "mweb"],
                        "po_token_ver": "2",
                    }
                },
                "cookiesfrombrowser": ("firefox",),
            },
        ])
    
    # OAuth2 is causing 400 errors, skip for now
    # TODO: Fix OAuth2 token refresh issue later
    
    # Add simple working option set as primary
    option_sets.insert(0, {
        **base_opts,
        "extractor_args": {
            "youtube": {
                "player_client": ["web"],
            }
        },
    })
    
    # Always add no-cookie fallbacks
    option_sets.extend([
        # Android only without cookies
        {
            **base_opts,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android"],
                }
            },
        },
        # TV client fallback (often less restricted)
        {
            **base_opts,
            "extractor_args": {
                "youtube": {
                    "player_client": ["tv"],
                }
            },
        },
    ])

    def _extract_single(url: str, opts: dict) -> str:
        """Single extraction attempt (thread-safe, no signals)."""
        try:
            logger.info(f"Attempting extraction for {video_id} with client: {opts.get('extractor_args', {}).get('youtube', {}).get('player_client', ['default'])}")
            
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                audio_url = info.get("url", "")
                if audio_url:
                    logger.info(f"Successfully extracted {video_id}")
                    return audio_url
                else:
                    logger.warning(f"No audio URL found for {video_id}")
                    return ""
        except Exception as err:
            logger.error(f"yt-dlp extraction failed for {video_id}: {str(err)}")
            return ""

    def _extract() -> str:
        last_error = None
        
        # Try primary methods first (most likely to succeed)
        if has_cookie_file and option_sets:
            for opts in option_sets[:2]:  # Try first 2 cookie-based options
                for url in url_candidates[:1]:  # Try only main YouTube URL
                    result = _extract_single(url, opts)
                    if result:
                        return result
        
        # Fallback to no-cookie methods
        no_cookie_opts = [opts for opts in option_sets if "cookiefile" not in opts]
        if no_cookie_opts:
            for opts in no_cookie_opts[:2]:  # Try first 2 no-cookie options
                for url in url_candidates[:1]:
                    result = _extract_single(url, opts)
                    if result:
                        return result

        # Quick fallback attempts (single attempt each)
        fallback_attempts = [
            # Minimal web client
            {
                "format": "bestaudio/best",
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "noplaylist": True,
                "socket_timeout": 5,
                "extractor_args": {"youtube": {"player_client": ["web"]}},
            },
            # Android mobile
            {
                "format": "bestaudio/best",
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "noplaylist": True,
                "socket_timeout": 5,
                "extractor_args": {"youtube": {"player_client": ["android"]}},
                "http_headers": {
                    "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36",
                },
            },
        ]
        
        for fallback_opts in fallback_attempts:
            result = _extract_single(url_candidates[0], fallback_opts)
            if result:
                return result
        
        # If all attempts failed, raise the last error with details
        error_msg = f"All extraction attempts failed for {video_id}. Last error: {last_error}"
        logger.error(error_msg)
        raise Exception(error_msg)

    audio_url = await asyncio.to_thread(_extract)

    if not audio_url:
        raise ValueError(f"Could not extract audio URL for {video_id}")

    logger.info(f"yt-dlp: extracted audio stream for {video_id}")
    return audio_url


async def prefetch_playlist_streams(tracks: list[dict]):
    """Fire-and-forget background task to pre-warm stream URLs."""
    async def _fetch(video_id: str):
        try:
            await get_audio_stream_url_cached(video_id)
            logger.info(f"Prefetched stream URL for {video_id}")
        except Exception as e:
            logger.warning(f"Failed to prefetch {video_id}: {str(e)[:100]}")
            pass  # silently fail, will retry on demand

    # Fire and forget - don't await
    asyncio.create_task(
        asyncio.gather(*[_fetch(t.get("video_id", "")) for t in tracks if t.get("video_id")])
    )
