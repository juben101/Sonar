"""
LLM-based Emotion Analysis Service with provider fallback.

Fallback hierarchy: NVIDIA NIM → Groq → Together AI
Uses structured JSON output for reliable emotion classification.
"""

import json
import logging

import httpx

from config import get_settings

logger = logging.getLogger("sonar.llm")

# ── Emotion taxonomy ──

EMOTION_TAXONOMY = {
    "Sadness": [
        "Melancholic",
        "Heartbroken",
        "Lonely",
        "Grief-stricken",
        "Disappointed",
        "Hopeless",
    ],
    "Joy": ["Euphoric", "Grateful", "Content", "Excited", "Proud", "Playful"],
    "Anger": ["Frustrated", "Irritated", "Resentful", "Bitter", "Furious"],
    "Fear": ["Anxious", "Overwhelmed", "Insecure", "Panicked", "Uneasy"],
    "Calm": ["Peaceful", "Reflective", "Nostalgic", "Dreamy", "Hopeful", "Serene"],
}

EMOTION_EMOJIS = {
    # Base
    "Sadness": "😢",
    "Joy": "😊",
    "Anger": "😤",
    "Fear": "😰",
    "Calm": "🍃",
    # Sub — Sadness
    "Melancholic": "🌧",
    "Heartbroken": "💔",
    "Lonely": "🌑",
    "Grief-stricken": "🕯",
    "Disappointed": "😞",
    "Hopeless": "🌫",
    # Sub — Joy
    "Euphoric": "✨",
    "Grateful": "🙏",
    "Content": "☀️",
    "Excited": "🎉",
    "Proud": "🏆",
    "Playful": "🎈",
    # Sub — Anger
    "Frustrated": "😣",
    "Irritated": "😒",
    "Resentful": "😠",
    "Bitter": "🍋",
    "Furious": "🔥",
    # Sub — Fear
    "Anxious": "😰",
    "Overwhelmed": "🌊",
    "Insecure": "🪞",
    "Panicked": "⚡",
    "Uneasy": "🌀",
    # Sub — Calm
    "Peaceful": "🕊",
    "Reflective": "🌙",
    "Nostalgic": "🕰",
    "Dreamy": "☁️",
    "Hopeful": "🌅",
    "Serene": "🧘",
}

DIMENSION_COLORS = {
    "sadness": "#7c8cff",
    "joy": "#ffcc00",
    "anger": "#ff4444",
    "fear": "#ff6b00",
    "calm": "#00d4aa",
    "energy": "#ff3c64",
}

# ── LLM Provider configs ──

_PROVIDERS = [
    {
        "name": "NVIDIA NIM",
        "key_field": "NVIDIA_NIM_API_KEY",
        "url": "https://integrate.api.nvidia.com/v1/chat/completions",
        "model": "meta/llama-3.1-70b-instruct",
        "auth_prefix": "Bearer",
    },
    {
        "name": "Groq",
        "key_field": "GROQ_API_KEY",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "model": "llama-3.3-70b-versatile",
        "auth_prefix": "Bearer",
    },
    {
        "name": "Together AI",
        "key_field": "TOGETHER_API_KEY",
        "url": "https://api.together.xyz/v1/chat/completions",
        "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "auth_prefix": "Bearer",
    },
]

# ── Taxonomy string for prompt ──

_TAXONOMY_STR = "\n".join(
    f"  {base}: {', '.join(subs)}" for base, subs in EMOTION_TAXONOMY.items()
)

# ── System prompt ──

_SYSTEM_PROMPT = f"""You are Sonar's emotion analysis engine. Given user text, you MUST classify the emotion and respond ONLY with valid JSON — no markdown, no extra text.

EMOTION TAXONOMY (5 base → 28 sub-emotions):
{_TAXONOMY_STR}

You MUST respond with this EXACT JSON structure:
{{
  "base_emotion": "<one of: Sadness, Joy, Anger, Fear, Calm>",
  "sub_emotion": "<one of the sub-emotions under the chosen base>",
  "sentiment": "<Positive, Negative, or Mixed>",
  "confidence": <integer 60-98>,
  "explanation": "<2-3 sentences: WHY you classified this emotion. Be empathetic, insightful, reference specific words/phrases from the input. Speak directly to the user with 'you/your'.>",
  "genre": "<recommend ONE music genre that fits this emotion, e.g. 'indie folk', 'lo-fi hip hop', 'ambient', 'pop punk', 'classical', 'r&b', 'jazz', etc.>",
  "genre_reason": "<1 sentence: why this genre matches the emotion>",
  "dimensions": {{
    "sadness": <0-100>,
    "joy": <0-100>,
    "anger": <0-100>,
    "fear": <0-100>,
    "calm": <0-100>,
    "energy": <0-100>
  }}
}}

RULES:
- confidence must reflect how clearly the emotion comes through (ambiguous text = lower)
- dimensions must sum to roughly 200-350 (they represent relative intensity, not probabilities)
- explanation must reference the user's actual words
- be empathetic and insightful, not clinical"""


async def _call_llm(
    provider: dict, text: str, weather_context: dict | None = None
) -> dict:
    """Call a single LLM provider and parse the JSON response."""
    settings = get_settings()
    api_key = getattr(settings, provider["key_field"], "")

    if not api_key:
        raise ValueError(f"{provider['name']}: no API key configured")

    # Build user message with optional weather context
    user_msg = f"Analyze the emotion in this text:\n\n{text}"
    if weather_context:
        user_msg += (
            f"\n\nWEATHER CONTEXT (factor this into your genre recommendation):\n"
            f"Location: {weather_context.get('city', 'Unknown')}\n"
            f"Conditions: {weather_context.get('description', 'unknown')}\n"
            f"Temperature: {weather_context.get('temp_c', 20)}°C\n"
            f"Weather mood hint: {weather_context.get('mood_hint', '')}\n"
            f"Weather genre hint: {weather_context.get('genre_hint', '')}"
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            provider["url"],
            headers={
                "Authorization": f"{provider['auth_prefix']} {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": provider["model"],
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.3,
                "max_tokens": 600,
            },
        )
        response.raise_for_status()

    data = response.json()
    content = data["choices"][0]["message"]["content"].strip()

    # Strip markdown code fences if present
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    return json.loads(content)


async def analyze_emotion(
    text: str, weather_context: dict | None = None
) -> dict:
    """
    Analyze text emotion using LLM with fallback hierarchy.

    Returns structured emotion analysis with base/sub emotion, sentiment,
    confidence, explanation, genre recommendation, and 6 dimensions.
    Optionally includes weather context for genre influence.
    """
    last_error = None

    for provider in _PROVIDERS:
        try:
            logger.info(f"Trying {provider['name']} for emotion analysis...")
            result = await _call_llm(provider, text, weather_context)

            # Validate required fields
            base = result.get("base_emotion", "Calm")
            sub = result.get("sub_emotion", "Reflective")

            # Ensure valid taxonomy
            if base not in EMOTION_TAXONOMY:
                base = "Calm"
                sub = "Reflective"
            elif sub not in EMOTION_TAXONOMY[base]:
                sub = EMOTION_TAXONOMY[base][0]

            emoji = EMOTION_EMOJIS.get(sub, EMOTION_EMOJIS.get(base, "🎵"))

            # Build dimensions list
            dims_raw = result.get("dimensions", {})
            dimensions = []
            for dim_name in ["sadness", "joy", "anger", "fear", "calm", "energy"]:
                val = max(5, min(100, int(dims_raw.get(dim_name, 20))))
                dimensions.append(
                    {
                        "name": dim_name.capitalize(),
                        "value": val,
                        "color": DIMENSION_COLORS.get(dim_name, "#888"),
                    }
                )

            # Sort by value descending
            dimensions.sort(key=lambda d: d["value"], reverse=True)

            logger.info(
                f"✓ {provider['name']}: {base} → {sub} (confidence: {result.get('confidence', 75)}%)"
            )

            return {
                "mood": sub,
                "moodEmoji": emoji,
                "base_emotion": base,
                "sub_emotion": sub,
                "nuance": sub,
                "sentiment": result.get("sentiment", "Mixed"),
                "confidence": max(60, min(98, int(result.get("confidence", 75)))),
                "explanation": result.get(
                    "explanation", "Your words reveal a complex emotional state."
                ),
                "genre": result.get("genre", "indie"),
                "genre_reason": result.get(
                    "genre_reason", "This genre matches the emotional tone detected."
                ),
                "dimensions": dimensions,
            }

        except Exception as e:
            last_error = e
            logger.warning(f"✗ {provider['name']} failed: {e}")
            continue

    # All providers failed — return a graceful fallback
    logger.error(f"All LLM providers failed. Last error: {last_error}")
    return {
        "mood": "Reflective",
        "moodEmoji": "🌙",
        "base_emotion": "Calm",
        "sub_emotion": "Reflective",
        "nuance": "Reflective",
        "sentiment": "Neutral",
        "confidence": 60,
        "explanation": (
            "We couldn't fully analyze your input right now, but your words "
            "suggest a thoughtful, contemplative state. Let us curate something "
            "that matches this reflective mood."
        ),
        "genre": "ambient",
        "genre_reason": "Ambient music suits a reflective, uncertain emotional state.",
        "dimensions": [
            {"name": "Calm", "value": 55, "color": "#00d4aa"},
            {"name": "Sadness", "value": 35, "color": "#7c8cff"},
            {"name": "Joy", "value": 25, "color": "#ffcc00"},
            {"name": "Fear", "value": 20, "color": "#ff6b00"},
            {"name": "Energy", "value": 20, "color": "#ff3c64"},
            {"name": "Anger", "value": 15, "color": "#ff4444"},
        ],
    }
