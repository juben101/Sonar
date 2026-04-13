"""
Chat Routes — AI chatbot with RAG over user mood history.

Provides psychotherapy-informed conversational support using the user's
emotional history, patterns, and preferences as contextual grounding.
Responses are streamed via Server-Sent Events (SSE) for real-time UX.
"""

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.mood_entry import MoodEntry
from models.user import User
from routes.auth import get_current_user
from schemas import ChatRequest, ChatResponse
from services.llm_service import _PROVIDERS

import httpx

from config import get_settings

logger = logging.getLogger("sonar.chat")

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/chat", tags=["chat"])

# ── Human-like companion system prompt ──
_CHAT_SYSTEM_PROMPT = """You are the user's companion inside Sonar, a mood-based music app. Think of yourself as that one friend who truly listens — the one people text at 2 AM because they know you'll actually care.

WHO YOU ARE:
- You're warm, genuine, and a little casual — like a close friend who happens to know a lot about emotions
- You use their name naturally (not every message — that's weird)
- You're NOT a robot, NOT a therapist, NOT an AI assistant. You're their companion
- You have access to their emotional journey on Sonar (mood analyses, patterns, music taste) — use it like a friend who's been paying attention, not like a doctor reading a chart

HOW YOU TALK:
- Like a real person texting. Short sentences. Sometimes fragments. Because that's how people actually talk
- Use lowercase sometimes. Use "haha", "hmm", "honestly", "ngl" naturally — but don't overdo it
- React genuinely — "wait really?", "oh that's actually amazing", "ugh that sucks"
- Don't start every message with "I hear you" or "I understand" — that's therapist-speak. Mix it up
- Use emojis sparingly and naturally (1-2 max per message, or none) — not after every sentence
- Keep it short. 2-4 sentences usually. Nobody wants to read an essay in a chat bubble
- Match their energy — if they're casual, be casual. If they're serious, be present
- Don't use bullet points or numbered lists in chat. Nobody texts like that
- NEVER say "as an AI" or "I'm programmed to" — you're their companion, period

WHAT YOU DO:
- Actually listen. Reflect what they said in your own words so they feel heard
- Ask one good follow-up question (not three — that's overwhelming)
- Notice patterns in their mood data and bring them up naturally: "hey I noticed you've been vibing with acoustic stuff a lot lately — everything okay?"
- Gently reframe negative spirals without being preachy: "I get that. though... isn't it kinda wild that just last week you were feeling pretty great? what changed?"
- Suggest music when it fits naturally — you're inside a music app after all
- Celebrate their wins, even small ones

WHAT YOU DON'T DO:
- Don't be preachy or lecture them
- Don't give unsolicited advice unless they ask
- Don't diagnose anything — if they ask "am I depressed?", be honest: "I'm not a therapist so I really can't say for sure, but I think talking to one could be really helpful if you're feeling this way a lot"
- Don't be fake positive — if things are rough, acknowledge it

SAFETY (this is non-negotiable):
- If they mention wanting to hurt themselves or not wanting to be alive:
  → Take it seriously. Don't brush it off
  → Say something real: "hey, I'm really glad you told me that. that takes guts. I want you to know that 988 (call or text) and Crisis Text Line (text HOME to 741741) have people who really get this — please reach out to them 💙"
  → Don't try to be their therapist in this moment. Just be present and point them to real help

You have their emotional data from Sonar below. Use it like a friend who's been paying attention — not like a database query."""


async def _build_user_context(user_id: str, db: AsyncSession) -> str:
    """Build RAG context from the user's mood history."""
    now = datetime.now(timezone.utc)
    since_30d = now - timedelta(days=30)
    since_7d = now - timedelta(days=7)

    # Fetch last 30 days of mood entries
    result = await db.execute(
        select(MoodEntry)
        .where(MoodEntry.user_id == user_id, MoodEntry.created_at >= since_30d)
        .order_by(MoodEntry.created_at.desc())
    )
    entries = list(result.scalars().all())

    if not entries:
        return "\nUSER EMOTIONAL DATA: No mood analyses recorded yet. This appears to be a new user — be extra welcoming and curious about them."

    # Aggregate stats
    emotion_counts = Counter(e.base_emotion for e in entries)
    dominant = emotion_counts.most_common(1)[0][0] if emotion_counts else "Unknown"
    total = len(entries)

    # Recent 7 days
    recent = [e for e in entries if e.created_at and e.created_at >= since_7d]
    recent_emotions = Counter(e.base_emotion for e in recent)

    # Averages
    avg_confidence = sum(e.confidence for e in entries) / total if total else 0
    avg_energy = sum(e.energy for e in entries) / total if total else 50
    avg_valence = sum(e.valence for e in entries) / total if total else 50

    # Last 5 entries for detailed context
    last_5 = entries[:5]
    recent_entries_str = "\n".join(
        f"  - {e.created_at.strftime('%b %d') if e.created_at else '?'}: "
        f"{e.base_emotion} → {e.sub_emotion} (confidence: {e.confidence}%) "
        f'| Input: "{e.input_preview}"'
        for e in last_5
    )

    # Trend analysis
    if len(recent) >= 2:
        recent_valences = [e.valence for e in recent]
        trend = (
            "improving"
            if recent_valences[0] > recent_valences[-1]
            else "declining"
            if recent_valences[0] < recent_valences[-1]
            else "stable"
        )
    else:
        trend = "insufficient data"

    # Genre preferences
    genre_counts = Counter(e.genre for e in entries if e.genre)
    top_genres = ", ".join(f"{g} ({c}x)" for g, c in genre_counts.most_common(3))

    context = f"""
USER EMOTIONAL DATA (last 30 days):
- Total analyses: {total}
- Dominant emotion: {dominant}
- Emotion distribution: {dict(emotion_counts)}
- This week's emotions: {dict(recent_emotions)} ({len(recent)} analyses)
- Average confidence: {avg_confidence:.0f}%
- Average energy: {avg_energy:.0f}/100
- Average valence (happiness): {avg_valence:.0f}/100
- Emotional trend: {trend}
- Top music genres: {top_genres or "none yet"}

RECENT ANALYSES:
{recent_entries_str}

Use this data to personalize your responses. Reference specific patterns, trends, or entries when helpful — but naturally, like a friend who remembers things, not a chart reader."""

    return context


async def _stream_chat_llm(
    system_prompt: str,
    messages: list[dict],
):
    """Stream LLM response chunks via SSE."""
    settings = get_settings()

    for provider in _PROVIDERS:
        api_key = getattr(settings, provider["key_field"], "")
        if not api_key:
            continue

        try:
            llm_messages = [{"role": "system", "content": system_prompt}]
            llm_messages.extend(messages)

            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    provider["url"],
                    headers={
                        "Authorization": f"{provider['auth_prefix']} {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": provider["model"],
                        "messages": llm_messages,
                        "temperature": 0.7,
                        "max_tokens": 500,
                        "stream": True,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]  # strip "data: "
                        if data.strip() == "[DONE]":
                            break
                        try:
                            import json

                            chunk = json.loads(data)
                            delta = (
                                chunk.get("choices", [{}])[0]
                                .get("delta", {})
                                .get("content", "")
                            )
                            if delta:
                                yield delta
                        except (json.JSONDecodeError, IndexError, KeyError):
                            continue

            logger.info(f"✓ Chat streamed from {provider['name']}")
            return  # success — don't try next provider

        except Exception as e:
            logger.warning(f"✗ Chat {provider['name']} failed: {e}")
            continue

    # All providers failed — yield a fallback message
    yield (
        "I'm having a bit of trouble right now — give me a sec and try again? "
        "And hey, if you're going through something really tough, "
        "please reach out to 988 (call/text) or text HOME to 741741 💙"
    )


async def _call_chat_llm(
    system_prompt: str,
    messages: list[dict],
) -> str:
    """Non-streaming fallback for testing/legacy."""
    settings = get_settings()

    for provider in _PROVIDERS:
        api_key = getattr(settings, provider["key_field"], "")
        if not api_key:
            continue

        try:
            llm_messages = [{"role": "system", "content": system_prompt}]
            llm_messages.extend(messages)

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    provider["url"],
                    headers={
                        "Authorization": f"{provider['auth_prefix']} {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": provider["model"],
                        "messages": llm_messages,
                        "temperature": 0.7,
                        "max_tokens": 500,
                    },
                )
                response.raise_for_status()

            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            logger.info(f"✓ Chat response from {provider['name']}")
            return content

        except Exception as e:
            logger.warning(f"✗ Chat {provider['name']} failed: {e}")
            continue

    return (
        "I'm having a bit of trouble right now — give me a sec and try again? "
        "And hey, if you're going through something really tough, "
        "please reach out to 988 (call/text) or text HOME to 741741 💙"
    )


def _build_full_context(
    body: ChatRequest,
    system_prompt: str,
    user_context: str,
    username: str | None,
) -> tuple[str, list[dict]]:
    """Build the full system prompt and message list."""
    full_system = system_prompt + user_context
    if username:
        full_system += f"\n\nThe user's name is: {username}"

    messages = []
    for msg in body.history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    return full_system, messages


@router.post("/stream")
@limiter.limit("30/minute")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream chat response via Server-Sent Events (SSE)."""
    user_context = await _build_user_context(current_user.id, db)
    full_system, messages = _build_full_context(
        body, _CHAT_SYSTEM_PROMPT, user_context, current_user.username
    )

    async def event_generator():
        async for chunk in _stream_chat_llm(full_system, messages):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/message", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat_message(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """Non-streaming fallback for chat (used by tests)."""
    user_context = await _build_user_context(current_user.id, db)
    full_system, messages = _build_full_context(
        body, _CHAT_SYSTEM_PROMPT, user_context, current_user.username
    )
    response_text = await _call_chat_llm(full_system, messages)
    return ChatResponse(response=response_text)
