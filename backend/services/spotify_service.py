"""
Spotify API Service — real track search with 30s previews.

Uses Client Credentials flow (no user login required).
Maps mood dimensions → Spotify audio features for `/recommendations`.
"""

import base64
import logging
import time

import httpx

from config import get_settings

logger = logging.getLogger("sonar.spotify")

# ── Token cache ──
_token_cache: dict = {"access_token": None, "expires_at": 0}

# ── Genre mapping from LLM genre strings to Spotify seed genres ──
_GENRE_MAP = {
    "indie folk": "indie",
    "indie pop": "indie-pop",
    "lo-fi hip hop": "hip-hop",
    "lo-fi": "hip-hop",
    "ambient": "ambient",
    "pop punk": "punk",
    "classical": "classical",
    "r&b": "r-n-b",
    "rnb": "r-n-b",
    "jazz": "jazz",
    "soul": "soul",
    "electronic": "electronic",
    "edm": "edm",
    "pop": "pop",
    "rock": "rock",
    "hip hop": "hip-hop",
    "hip-hop": "hip-hop",
    "metal": "metal",
    "country": "country",
    "blues": "blues",
    "reggae": "reggae",
    "folk": "folk",
    "alternative": "alt-rock",
    "acoustic": "acoustic",
    "chill": "chill",
    "dance": "dance",
    "piano": "piano",
    "latin": "latin",
    "k-pop": "k-pop",
    "indie": "indie",
    "punk": "punk",
    "grunge": "grunge",
    "trip hop": "trip-hop",
    "trip-hop": "trip-hop",
    "new age": "new-age",
    "soundtrack": "soundtracks",
    "gospel": "gospel",
    "funk": "funk",
    "disco": "disco",
}

# Spotify's available seed genres (subset for validation)
_VALID_SEEDS = {
    "acoustic",
    "alt-rock",
    "ambient",
    "blues",
    "chill",
    "classical",
    "country",
    "dance",
    "disco",
    "edm",
    "electronic",
    "folk",
    "funk",
    "gospel",
    "grunge",
    "hip-hop",
    "indie",
    "indie-pop",
    "jazz",
    "k-pop",
    "latin",
    "metal",
    "new-age",
    "piano",
    "pop",
    "punk",
    "r-n-b",
    "reggae",
    "rock",
    "soul",
    "soundtracks",
    "trip-hop",
}


async def _get_access_token() -> str:
    """Get or refresh Spotify access token using Client Credentials flow."""
    global _token_cache

    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    settings = get_settings()
    if not settings.SPOTIFY_CLIENT_ID or not settings.SPOTIFY_CLIENT_SECRET:
        raise ValueError("Spotify credentials not configured")

    credentials = base64.b64encode(
        f"{settings.SPOTIFY_CLIENT_ID}:{settings.SPOTIFY_CLIENT_SECRET}".encode()
    ).decode()

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://accounts.spotify.com/api/token",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
        )
        response.raise_for_status()

    data = response.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = time.time() + data.get("expires_in", 3600)

    logger.info("Spotify access token refreshed")
    return data["access_token"]


def _map_genre(genre_str: str) -> str:
    """Map a free-form genre string to a valid Spotify seed genre."""
    genre_lower = genre_str.lower().strip()

    # Direct match
    if genre_lower in _GENRE_MAP:
        return _GENRE_MAP[genre_lower]

    # Check if it's already a valid seed
    if genre_lower in _VALID_SEEDS:
        return genre_lower

    # Fuzzy: check if any key is contained in the input
    for key, val in _GENRE_MAP.items():
        if key in genre_lower:
            return val

    # Default fallback
    return "pop"


async def get_recommendations(
    genre: str,
    languages: list[str] | None = None,
    artists: list[str] | None = None,
    intensity: int = 50,
    track_count: int = 15,
    preference: str = "match",
    base_emotion: str = "Calm",
) -> list[dict]:
    """
    Get track recommendations from Spotify based on mood parameters.

    Maps:
      - genre → seed_genres
      - intensity → target_energy, target_danceability
      - base_emotion → target_valence, target_acousticness
      - preference (match/uplift) → adjusts valence
    """
    token = await _get_access_token()
    seed_genre = _map_genre(genre)

    # Map intensity (0-100) to Spotify audio features (0.0-1.0)
    energy = intensity / 100
    danceability = 0.3 + (intensity / 100) * 0.5  # 0.3 to 0.8

    # Map base emotion to valence (happiness measure)
    emotion_valence = {
        "Joy": 0.8,
        "Calm": 0.55,
        "Sadness": 0.2,
        "Anger": 0.3,
        "Fear": 0.25,
    }
    valence = emotion_valence.get(base_emotion, 0.5)

    # Uplift mode: push valence higher
    if preference == "uplift":
        valence = min(valence + 0.3, 0.95)
        energy = min(energy + 0.15, 0.95)

    # Build query params
    params = {
        "seed_genres": seed_genre,
        "limit": min(track_count, 50),
        "target_energy": round(energy, 2),
        "target_valence": round(valence, 2),
        "target_danceability": round(danceability, 2),
    }

    # If artists specified, search for their Spotify IDs and use as seeds
    seed_artists = []
    if artists:
        for artist_name in artists[:2]:  # Max 2 artist seeds
            artist_id = await _search_artist(token, artist_name)
            if artist_id:
                seed_artists.append(artist_id)

    if seed_artists:
        params["seed_artists"] = ",".join(seed_artists)
        # Spotify allows max 5 seeds total
        if len(seed_artists) >= 2:
            # Remove genre seed if we have 2+ artists
            pass
        else:
            params["seed_genres"] = seed_genre

    # Language-based market selection
    market = _get_market_from_languages(languages or ["English"])
    params["market"] = market

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://api.spotify.com/v1/recommendations",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
        response.raise_for_status()

    data = response.json()
    tracks = []

    for i, track in enumerate(data.get("tracks", [])):
        # Get album art (smallest available)
        album_art = ""
        images = track.get("album", {}).get("images", [])
        if images:
            # Pick medium size (300px) or smallest
            album_art = images[-1]["url"] if len(images) > 0 else ""
            for img in images:
                if img.get("width", 0) <= 300:
                    album_art = img["url"]
                    break

        # Format duration
        duration_ms = track.get("duration_ms", 0)
        mins = duration_ms // 60000
        secs = (duration_ms % 60000) // 1000
        duration_str = f"{mins}:{secs:02d}"

        artist_names = ", ".join(a["name"] for a in track.get("artists", []))

        tracks.append(
            {
                "id": i + 1,
                "title": track.get("name", "Unknown"),
                "artist": artist_names,
                "duration": duration_str,
                "album_art": album_art,
                "preview_url": track.get("preview_url", ""),
                "spotify_url": track.get("external_urls", {}).get("spotify", ""),
                "color": "#ff3c64",  # Default accent color
            }
        )

    logger.info(
        f"Spotify: got {len(tracks)} tracks for genre={seed_genre}, market={market}"
    )
    return tracks


async def _search_artist(token: str, name: str) -> str | None:
    """Search Spotify for an artist and return their ID."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": name, "type": "artist", "limit": 1},
        )
        if response.status_code != 200:
            return None

    data = response.json()
    items = data.get("artists", {}).get("items", [])
    if items:
        return items[0]["id"]
    return None


def _get_market_from_languages(languages: list[str]) -> str:
    """Map language preferences to Spotify market codes."""
    lang_market = {
        "English": "US",
        "Hindi": "IN",
        "Spanish": "ES",
        "Korean": "KR",
        "Japanese": "JP",
        "French": "FR",
        "Tamil": "IN",
        "Telugu": "IN",
        "Punjabi": "IN",
        "Arabic": "SA",
        "Portuguese": "BR",
        "German": "DE",
        "Italian": "IT",
        "Mandarin": "TW",
    }
    if languages:
        return lang_market.get(languages[0], "US")
    return "US"
