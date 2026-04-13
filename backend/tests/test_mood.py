"""Tests for mood analysis, transcription, playlist, and history API routes.

Uses respx to mock external API calls (LLM providers, Deepgram, Weather)
and unittest.mock to mock ytmusicapi for playlist generation.
"""

import pytest
import respx
from httpx import Response
from unittest.mock import patch, MagicMock


# ── Helper: signup and return auth headers ──


async def signup_and_get_headers(client, username="moodtester"):
    """Helper to create a user and return auth headers."""
    resp = await client.post(
        "/auth/signup",
        json={"username": username, "password": "StrongPass123!"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Fixtures for common mock responses ──

# LLM returns dimensions as a DICT (keyed by dimension name), not a list
MOCK_LLM_RESPONSE = {
    "choices": [
        {
            "message": {
                "content": """{
                    "base_emotion": "Joy",
                    "sub_emotion": "Euphoric",
                    "confidence": 85,
                    "sentiment": "Positive",
                    "explanation": "Your words radiate happiness and energy.",
                    "genre": "pop",
                    "genre_reason": "Pop matches your upbeat energy.",
                    "dimensions": {
                        "sadness": 10,
                        "joy": 90,
                        "anger": 5,
                        "fear": 5,
                        "calm": 40,
                        "energy": 80
                    }
                }"""
            }
        }
    ]
}


def mock_all_llm_providers():
    """Mock all 3 LLM providers with the same successful response."""
    respx.post("https://integrate.api.nvidia.com/v1/chat/completions").mock(
        return_value=Response(200, json=MOCK_LLM_RESPONSE)
    )
    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=Response(200, json=MOCK_LLM_RESPONSE)
    )
    respx.post("https://api.together.xyz/v1/chat/completions").mock(
        return_value=Response(200, json=MOCK_LLM_RESPONSE)
    )


def mock_ytmusic_search():
    """Mock ytmusicapi.YTMusic.search() to return fake YouTube Music results."""
    mock_results = [
        {
            "videoId": f"dQw4w9WgXc{i}",
            "title": f"Test Song {i}",
            "artists": [{"name": f"Artist {i}"}],
            "thumbnails": [
                {"url": f"https://i.ytimg.com/vi/thumb{i}/default.jpg", "width": 60},
                {"url": f"https://i.ytimg.com/vi/thumb{i}/hqdefault.jpg", "width": 480},
            ],
            "duration": f"3:{20 + i:02d}",
            "resultType": "song",
        }
        for i in range(10)
    ]
    return patch(
        "services.ytmusic_service._get_client",
        return_value=MagicMock(search=MagicMock(return_value=mock_results)),
    )


MOCK_DEEPGRAM_RESPONSE = {
    "results": {
        "channels": [
            {
                "alternatives": [
                    {
                        "transcript": "I am feeling really happy and excited today",
                        "confidence": 0.95,
                        "words": [
                            {"word": "I", "start": 0.1, "end": 0.2, "confidence": 0.99},
                            {
                                "word": "am",
                                "start": 0.22,
                                "end": 0.35,
                                "confidence": 0.98,
                            },
                            {
                                "word": "feeling",
                                "start": 0.4,
                                "end": 0.75,
                                "confidence": 0.97,
                            },
                            {
                                "word": "really",
                                "start": 0.8,
                                "end": 1.1,
                                "confidence": 0.96,
                            },
                            {
                                "word": "happy",
                                "start": 1.15,
                                "end": 1.5,
                                "confidence": 0.99,
                            },
                            {
                                "word": "and",
                                "start": 1.55,
                                "end": 1.65,
                                "confidence": 0.98,
                            },
                            {
                                "word": "excited",
                                "start": 1.7,
                                "end": 2.1,
                                "confidence": 0.97,
                            },
                            {
                                "word": "today",
                                "start": 2.15,
                                "end": 2.5,
                                "confidence": 0.99,
                            },
                        ],
                    }
                ]
            }
        ]
    }
}

MOCK_WEATHER_RESPONSE = {
    "name": "TestCity",
    "weather": [{"main": "Clear", "description": "clear sky"}],
    "main": {"temp": 298.15},
}


# ══════════════════════════════════════
#  MOOD ANALYSIS TESTS
# ══════════════════════════════════════


@pytest.mark.asyncio
@respx.mock
async def test_analyze_mood_success(client):
    """Test mood analysis with mocked LLM provider."""
    mock_all_llm_providers()

    headers = await signup_and_get_headers(client)

    response = await client.post(
        "/v1/mood/analyze",
        json={"text": "I am feeling really happy and excited about today!"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["base_emotion"] == "Joy"
    assert data["sub_emotion"] == "Euphoric"
    assert data["confidence"] == 85
    assert data["sentiment"] == "Positive"
    assert "dimensions" in data
    assert len(data["dimensions"]) == 6


@pytest.mark.asyncio
@respx.mock
async def test_analyze_mood_with_weather(client):
    """Test mood analysis includes weather context when coords provided."""
    mock_all_llm_providers()
    # Mock Weather
    respx.get("https://api.openweathermap.org/data/2.5/weather").mock(
        return_value=Response(200, json=MOCK_WEATHER_RESPONSE)
    )

    headers = await signup_and_get_headers(client, "weatheruser")

    response = await client.post(
        "/v1/mood/analyze",
        json={
            "text": "The sunshine makes me so happy today!",
            "lat": 40.7128,
            "lon": -74.0060,
        },
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["base_emotion"] == "Joy"


@pytest.mark.asyncio
async def test_analyze_mood_unauthorized(client):
    """Test analyze without auth token returns 401."""
    response = await client.post(
        "/v1/mood/analyze",
        json={"text": "I feel good today, really wonderful!"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_analyze_mood_empty_text(client):
    """Test analyze with empty text returns 422."""
    headers = await signup_and_get_headers(client, "emptyuser")
    response = await client.post(
        "/v1/mood/analyze",
        json={"text": ""},
        headers=headers,
    )
    assert response.status_code == 422


# ══════════════════════════════════════
#  TRANSCRIPTION TESTS
# ══════════════════════════════════════


@pytest.mark.asyncio
@respx.mock
async def test_transcribe_success(client):
    """Test voice transcription via Deepgram mock."""
    respx.post("https://api.deepgram.com/v1/listen").mock(
        return_value=Response(200, json=MOCK_DEEPGRAM_RESPONSE)
    )

    headers = await signup_and_get_headers(client, "voiceuser")

    # Create a fake audio file
    audio_content = b"\x00" * 1000  # Fake audio bytes

    response = await client.post(
        "/v1/mood/transcribe",
        files={"audio": ("recording.webm", audio_content, "audio/webm")},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert "happy" in data["text"].lower()
    # Prosodic features should be extracted from word-level timing
    assert "prosodic" in data
    if data["prosodic"]:
        assert "speaking_rate_wpm" in data["prosodic"]
        assert "pace" in data["prosodic"]


@pytest.mark.asyncio
async def test_transcribe_unauthorized(client):
    """Test transcribe without auth returns 401."""
    audio_content = b"\x00" * 100
    response = await client.post(
        "/v1/mood/transcribe",
        files={"audio": ("recording.webm", audio_content, "audio/webm")},
    )
    assert response.status_code == 401


# ══════════════════════════════════════
#  PLAYLIST TESTS
# ══════════════════════════════════════


@pytest.mark.asyncio
async def test_playlist_generation(client):
    """Test playlist generation with mocked YouTube Music API."""
    with mock_ytmusic_search():
        headers = await signup_and_get_headers(client, "playlistuser")

        response = await client.post(
            "/v1/mood/playlist",
            json={
                "dimensions": [
                    {"name": "Energy", "value": 80, "color": "#ff3c64"},
                    {"name": "Joy", "value": 90, "color": "#ffcc00"},
                ],
                "preference": "match",
                "languages": ["English"],
                "artists": [],
                "intensity": 60,
                "track_count": 5,
                "genre": "pop",
                "base_emotion": "Joy",
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "tracks" in data
        assert len(data["tracks"]) > 0
        # Each track should have required fields
        track = data["tracks"][0]
        assert "title" in track
        assert "artist" in track
        assert "duration" in track
        assert "video_id" in track
        assert "youtube_url" in track


@pytest.mark.asyncio
async def test_playlist_unauthorized(client):
    """Test playlist generation without auth returns 401."""
    response = await client.post(
        "/v1/mood/playlist",
        json={
            "dimensions": [{"name": "Energy", "value": 50, "color": "#ff3c64"}],
            "preference": "match",
            "genre": "pop",
            "base_emotion": "Calm",
        },
    )
    assert response.status_code == 401


# ══════════════════════════════════════
#  MOOD HISTORY TESTS
# ══════════════════════════════════════


@pytest.mark.asyncio
@respx.mock
async def test_mood_history_empty(client):
    """Test history returns empty for a user with no analyses."""
    headers = await signup_and_get_headers(client, "historyempty")

    response = await client.get(
        "/v1/mood/history?days=30&limit=50",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["entries"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
@respx.mock
async def test_mood_history_after_analysis(client):
    """Test that analysis auto-saves to history."""
    mock_all_llm_providers()

    headers = await signup_and_get_headers(client, "historyuser")

    # Run an analysis (should auto-save)
    await client.post(
        "/v1/mood/analyze",
        json={"text": "I am feeling really happy and excited about today!"},
        headers=headers,
    )

    # Check history
    response = await client.get(
        "/v1/mood/history?days=30&limit=50",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["entries"]) == 1

    entry = data["entries"][0]
    assert entry["base_emotion"] == "Joy"
    assert entry["sub_emotion"] == "Euphoric"
    assert entry["confidence"] == 85
    assert entry["input_preview"] != ""


@pytest.mark.asyncio
@respx.mock
async def test_mood_stats_after_analysis(client):
    """Test stats endpoint returns aggregated data."""
    mock_all_llm_providers()

    headers = await signup_and_get_headers(client, "statsuser")

    # Run two analyses
    for text in [
        "I am feeling really happy and excited about today!",
        "Life is so wonderful and the sun is shining bright!",
    ]:
        await client.post(
            "/v1/mood/analyze",
            json={"text": text},
            headers=headers,
        )

    # Check stats
    response = await client.get(
        "/v1/mood/stats?days=30",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_analyses"] == 2
    assert data["avg_confidence"] == 85.0
    assert data["dominant_emotion"] == "Joy"
    assert len(data["emotion_distribution"]) > 0
    assert len(data["daily_moods"]) > 0


@pytest.mark.asyncio
async def test_mood_stats_empty(client):
    """Test stats returns zeros for fresh user."""
    headers = await signup_and_get_headers(client, "statsempty")

    response = await client.get(
        "/v1/mood/stats?days=30",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_analyses"] == 0
    assert data["avg_confidence"] == 0.0
    assert data["emotion_distribution"] == []


@pytest.mark.asyncio
async def test_mood_history_unauthorized(client):
    """Test history without auth returns 401."""
    response = await client.get("/v1/mood/history")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_mood_stats_unauthorized(client):
    """Test stats without auth returns 401."""
    response = await client.get("/v1/mood/stats")
    assert response.status_code == 401


# ══════════════════════════════════════
#  HISTORY ISOLATION TESTS
# ══════════════════════════════════════


@pytest.mark.asyncio
@respx.mock
async def test_history_isolation_between_users(client):
    """Test that each user only sees their own history, not others'."""
    mock_all_llm_providers()

    # User A analyzes
    headers_a = await signup_and_get_headers(client, "userA")
    await client.post(
        "/v1/mood/analyze",
        json={"text": "I am feeling really happy and excited about today!"},
        headers=headers_a,
    )

    # User B analyzes
    headers_b = await signup_and_get_headers(client, "userB")
    await client.post(
        "/v1/mood/analyze",
        json={"text": "Life is amazing, everything is beautiful and bright!"},
        headers=headers_b,
    )

    # User A should only see 1 entry
    resp_a = await client.get("/v1/mood/history", headers=headers_a)
    assert resp_a.json()["total"] == 1

    # User B should only see 1 entry
    resp_b = await client.get("/v1/mood/history", headers=headers_b)
    assert resp_b.json()["total"] == 1
