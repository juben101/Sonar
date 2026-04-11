"""
Chat Routes — AI chatbot with RAG over user mood history.

Provides psychotherapy-informed conversational support using the user's
emotional history, patterns, and preferences as contextual grounding.
"""

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
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

# ── Psychotherapy-informed system prompt ──
_CHAT_SYSTEM_PROMPT = """You are Sonar's emotional wellness companion — a warm, empathetic AI assistant embedded in a mood-based music platform.

YOUR ROLE:
- Provide supportive, psychotherapy-informed conversation
- Use validated techniques: active listening, cognitive reframing, motivational interviewing, mindfulness suggestions
- Reference the user's actual emotional data (provided below) to personalize responses
- Be warm but professional — you are NOT a licensed therapist, and should say so if asked about clinical diagnoses
- Suggest music as a therapeutic tool when appropriate (the user is on a music platform)

COMMUNICATION STYLE:
- Use empathetic, validating language ("That sounds really tough", "It makes sense you'd feel that way")
- Ask open-ended follow-up questions to encourage reflection
- Offer gentle cognitive reframes without dismissing feelings
- Keep responses concise (2-4 sentences typically, unless the user asks for more)
- Use the user's name if available
- Reference their emotional patterns when relevant ("I notice you've been feeling more anxious this week")

SAFETY:
- If the user expresses suicidal ideation, self-harm, or severe crisis, always:
  1. Validate their feelings
  2. Provide crisis resources (988 Suicide & Crisis Lifeline, Crisis Text Line: text HOME to 741741)
  3. Encourage them to reach out to a trusted person or professional
- Never provide clinical diagnoses or prescribe medication
- You can suggest seeking professional help when appropriate

IMPORTANT: You have access to the user's emotional history from Sonar. Use it to provide personalized, data-informed support."""


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
        return "\nUSER EMOTIONAL DATA: No mood analyses recorded yet. This appears to be a new user."

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

Use this data to personalize your responses. Reference specific patterns, trends, or entries when helpful."""

    return context


async def _call_chat_llm(
    system_prompt: str,
    messages: list[dict],
) -> str:
    """Call LLM with conversation history for chat."""
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
                        "temperature": 0.6,
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
        "I'm having trouble connecting right now. Please try again in a moment. "
        "If you're in crisis, please reach out to the 988 Suicide & Crisis Lifeline."
    )


@router.post("/message", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat_message(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """Send a message to the AI chatbot with full emotional context."""
    # Build RAG context from user's mood history
    user_context = await _build_user_context(current_user.id, db)

    # Build system prompt with user data
    full_system = _CHAT_SYSTEM_PROMPT + user_context
    if current_user.username:
        full_system += f"\n\nThe user's name is: {current_user.username}"

    # Build message history (last 20 messages max for context window)
    messages = []
    for msg in body.history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})

    # Add current message
    messages.append({"role": "user", "content": body.message})

    # Call LLM
    response_text = await _call_chat_llm(full_system, messages)

    return ChatResponse(response=response_text)
