"""Tests for chat endpoint and song preference CRUD routes.

Uses respx to mock LLM API calls and reuses auth helpers from test_mood.
"""

import pytest
import respx
from httpx import Response


# ── Helpers ──


async def signup_and_get_headers(client, username="chattester"):
    """Helper to create a user and return auth headers."""
    resp = await client.post(
        "/auth/signup",
        json={"username": username, "password": "StrongPass123!"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


MOCK_CHAT_RESPONSE = {
    "choices": [
        {
            "message": {
                "content": "I hear you. It sounds like you're going through a tough time. Would you like to talk more about what's been on your mind?"
            }
        }
    ]
}


def mock_chat_llm_provider():
    """Mock the LLM provider for chat responses."""
    respx.post("https://integrate.api.nvidia.com/v1/chat/completions").mock(
        return_value=Response(200, json=MOCK_CHAT_RESPONSE)
    )
    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=Response(200, json=MOCK_CHAT_RESPONSE)
    )
    respx.post("https://api.together.xyz/v1/chat/completions").mock(
        return_value=Response(200, json=MOCK_CHAT_RESPONSE)
    )


# ══════════ CHAT ENDPOINT TESTS ══════════


@pytest.mark.asyncio
@respx.mock
async def test_chat_message_success(client):
    """Chat endpoint returns a response from the AI."""
    headers = await signup_and_get_headers(client)
    mock_chat_llm_provider()

    resp = await client.post(
        "/v1/chat/message",
        json={
            "message": "I've been feeling really anxious lately",
            "history": [],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert len(data["response"]) > 0


@pytest.mark.asyncio
@respx.mock
async def test_chat_message_with_history(client):
    """Chat endpoint accepts and processes conversation history."""
    headers = await signup_and_get_headers(client)
    mock_chat_llm_provider()

    resp = await client.post(
        "/v1/chat/message",
        json={
            "message": "Can you tell me more?",
            "history": [
                {"role": "user", "content": "I feel sad today"},
                {
                    "role": "assistant",
                    "content": "I'm sorry to hear that. What's going on?",
                },
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert "response" in resp.json()


@pytest.mark.asyncio
async def test_chat_unauthorized(client):
    """Chat endpoint requires authentication."""
    resp = await client.post(
        "/v1/chat/message",
        json={"message": "Hello", "history": []},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    """Chat endpoint rejects empty messages."""
    headers = await signup_and_get_headers(client)
    resp = await client.post(
        "/v1/chat/message",
        json={"message": "", "history": []},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_chat_invalid_history_role(client):
    """Chat endpoint rejects invalid role in history."""
    headers = await signup_and_get_headers(client, "chatvalidator")
    resp = await client.post(
        "/v1/chat/message",
        json={
            "message": "Hello",
            "history": [{"role": "system", "content": "hack"}],
        },
        headers=headers,
    )
    assert resp.status_code == 422


# ══════════ SONG PREFERENCE TESTS ══════════


@pytest.mark.asyncio
async def test_set_preference_like(client):
    """Users can like a song."""
    headers = await signup_and_get_headers(client, "preftester")
    resp = await client.put(
        "/v1/mood/songs/preference",
        json={
            "song_key": "artist::title_test",
            "preference": "like",
            "song_title": "Test Song",
            "song_artist": "Test Artist",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["preference"] == "like"
    assert resp.json()["song_key"] == "artist::title_test"


@pytest.mark.asyncio
async def test_set_preference_dislike(client):
    """Users can dislike a song."""
    headers = await signup_and_get_headers(client, "preftester2")
    resp = await client.put(
        "/v1/mood/songs/preference",
        json={
            "song_key": "artist::title_test",
            "preference": "dislike",
            "song_title": "Test Song",
            "song_artist": "Test Artist",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["preference"] == "dislike"


@pytest.mark.asyncio
async def test_get_preferences_batch(client):
    """Users can retrieve preferences in batch."""
    headers = await signup_and_get_headers(client, "batchpref")

    # Set a preference first
    await client.put(
        "/v1/mood/songs/preference",
        json={
            "song_key": "artist::song1",
            "preference": "like",
            "song_title": "Song 1",
            "song_artist": "Artist 1",
        },
        headers=headers,
    )

    # Batch get
    resp = await client.post(
        "/v1/mood/songs/preferences",
        json={"song_keys": ["artist::song1", "artist::song2"]},
        headers=headers,
    )
    assert resp.status_code == 200
    prefs = resp.json()["preferences"]
    assert prefs["artist::song1"] == "like"
    assert "artist::song2" not in prefs


@pytest.mark.asyncio
async def test_remove_preference(client):
    """Users can remove a preference."""
    headers = await signup_and_get_headers(client, "removepref")

    # Set then remove
    await client.put(
        "/v1/mood/songs/preference",
        json={
            "song_key": "artist::song_remove",
            "preference": "like",
            "song_title": "Remove Song",
            "song_artist": "Remove Artist",
        },
        headers=headers,
    )

    resp = await client.delete(
        "/v1/mood/songs/preference/artist%3A%3Asong_remove",
        headers=headers,
    )
    assert resp.status_code == 200

    # Verify it's gone
    resp2 = await client.post(
        "/v1/mood/songs/preferences",
        json={"song_keys": ["artist::song_remove"]},
        headers=headers,
    )
    assert resp2.json()["preferences"] == {}


@pytest.mark.asyncio
async def test_preference_unauthorized(client):
    """Preference endpoints require authentication."""
    resp = await client.put(
        "/v1/mood/songs/preference",
        json={
            "song_key": "test::key",
            "preference": "like",
            "song_title": "Test",
            "song_artist": "Test",
        },
    )
    assert resp.status_code == 401
