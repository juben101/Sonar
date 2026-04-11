"""
Voice Transcription Service — speech-to-text with provider fallback.

Fallback hierarchy: Deepgram → AssemblyAI
Accepts raw audio bytes and returns transcribed text + prosodic features.
"""

import logging

import httpx

from config import get_settings

logger = logging.getLogger("sonar.transcription")


async def transcribe_audio(
    audio_bytes: bytes, content_type: str = "audio/webm"
) -> dict:
    """
    Transcribe audio bytes to text using available providers.

    Tries Deepgram first (with prosodic features), falls back to AssemblyAI.
    Returns a dict with:
      - text: transcribed text
      - prosodic: dict of vocal features (speaking_rate, pause_count, etc.)
    """
    settings = get_settings()
    last_error = None

    # ── Try Deepgram (with utterances for prosodic analysis) ──
    if settings.DEEPGRAM_API_KEY:
        try:
            result = await _deepgram_transcribe(
                audio_bytes, settings.DEEPGRAM_API_KEY, content_type
            )
            if result["text"]:
                logger.info(
                    f"✓ Deepgram: transcribed {len(result['text'])} chars "
                    f"(pace: {result['prosodic'].get('speaking_rate_wpm', '?')} wpm)"
                )
                return result
        except Exception as e:
            last_error = e
            logger.warning(f"✗ Deepgram failed: {e}")

    # ── Try AssemblyAI ──
    if settings.ASSEMBLYAI_API_KEY:
        try:
            text = await _assemblyai_transcribe(
                audio_bytes, settings.ASSEMBLYAI_API_KEY
            )
            if text:
                logger.info(f"✓ AssemblyAI: transcribed {len(text)} chars")
                return {"text": text, "prosodic": {}}
        except Exception as e:
            last_error = e
            logger.warning(f"✗ AssemblyAI failed: {e}")

    if last_error:
        raise ValueError(f"All transcription providers failed: {last_error}")
    raise ValueError("No transcription API keys configured")


def _extract_prosodic_features(data: dict) -> dict:
    """
    Extract prosodic features from Deepgram response with utterances.

    Analyzes:
    - Speaking rate (words per minute)
    - Pause patterns (frequency + avg duration)
    - Speech duration
    - Sentiment per utterance (if available)
    """
    prosodic = {}

    channels = data.get("results", {}).get("channels", [])
    if not channels:
        return prosodic

    alt = channels[0].get("alternatives", [{}])[0]
    words = alt.get("words", [])

    if not words:
        return prosodic

    # ── Speaking rate ──
    first_word_start = words[0].get("start", 0)
    last_word_end = words[-1].get("end", 0)
    speech_duration = last_word_end - first_word_start

    if speech_duration > 0:
        word_count = len(words)
        wpm = round((word_count / speech_duration) * 60)
        prosodic["speaking_rate_wpm"] = wpm
        prosodic["speech_duration_sec"] = round(speech_duration, 1)
        prosodic["word_count"] = word_count

        # Classify pace
        if wpm < 100:
            prosodic["pace"] = "very slow"
            prosodic["pace_hint"] = "deliberate, reflective, possibly sad or thoughtful"
        elif wpm < 130:
            prosodic["pace"] = "slow"
            prosodic["pace_hint"] = "calm, measured, contemplative"
        elif wpm < 160:
            prosodic["pace"] = "moderate"
            prosodic["pace_hint"] = "natural, conversational, balanced"
        elif wpm < 190:
            prosodic["pace"] = "fast"
            prosodic["pace_hint"] = "energetic, excited, or slightly anxious"
        else:
            prosodic["pace"] = "very fast"
            prosodic["pace_hint"] = "highly energetic, anxious, or agitated"

    # ── Pause analysis ──
    pauses = []
    for i in range(1, len(words)):
        gap = words[i].get("start", 0) - words[i - 1].get("end", 0)
        if gap > 0.5:  # Significant pause = > 500ms
            pauses.append(gap)

    prosodic["pause_count"] = len(pauses)
    if pauses:
        prosodic["avg_pause_sec"] = round(sum(pauses) / len(pauses), 2)
        prosodic["longest_pause_sec"] = round(max(pauses), 2)

        if len(pauses) > 3 and prosodic.get("avg_pause_sec", 0) > 1.0:
            prosodic["pause_pattern"] = "frequent long pauses — hesitant, emotional, or deeply reflective"
        elif len(pauses) > 2:
            prosodic["pause_pattern"] = "noticeable pauses — thoughtful or weighing words carefully"
        else:
            prosodic["pause_pattern"] = "minimal pauses — fluid and confident delivery"
    else:
        prosodic["pause_pattern"] = "continuous speech — fluent and decisive"

    # ── Utterance-level sentiment (if available) ──
    utterances = data.get("results", {}).get("utterances", [])
    if utterances:
        sentiments = []
        for utt in utterances:
            sent = utt.get("sentiment", {})
            if sent:
                sentiments.append(sent)

        if sentiments:
            prosodic["utterance_sentiments"] = sentiments

    # ── Confidence (how clearly they spoke) ──
    confidences = [w.get("confidence", 0) for w in words if "confidence" in w]
    if confidences:
        avg_conf = sum(confidences) / len(confidences)
        prosodic["speech_clarity"] = round(avg_conf * 100, 1)
        if avg_conf > 0.95:
            prosodic["clarity_note"] = "very clear articulation"
        elif avg_conf > 0.85:
            prosodic["clarity_note"] = "clear speech"
        elif avg_conf > 0.7:
            prosodic["clarity_note"] = "somewhat unclear, possibly emotional or mumbling"
        else:
            prosodic["clarity_note"] = "unclear speech, possibly crying, whispering, or very emotional"

    return prosodic


async def _deepgram_transcribe(
    audio_bytes: bytes, api_key: str, content_type: str
) -> dict:
    """Transcribe via Deepgram's Nova-2 model with prosodic feature extraction."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": content_type,
            },
            params={
                "model": "nova-2",
                "smart_format": "true",
                "punctuate": "true",
                "utterances": "true",
                "language": "en",
            },
            content=audio_bytes,
        )
        response.raise_for_status()

    data = response.json()
    alternatives = (
        data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])
    )

    text = ""
    if alternatives:
        text = alternatives[0].get("transcript", "")

    # Extract prosodic features from the detailed response
    prosodic = _extract_prosodic_features(data)

    return {"text": text, "prosodic": prosodic}


async def _assemblyai_transcribe(audio_bytes: bytes, api_key: str) -> str:
    """Transcribe via AssemblyAI (upload → transcribe → poll)."""
    headers = {"authorization": api_key}

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Upload audio
        upload_resp = await client.post(
            "https://api.assemblyai.com/v2/upload",
            headers={**headers, "Content-Type": "application/octet-stream"},
            content=audio_bytes,
        )
        upload_resp.raise_for_status()
        upload_url = upload_resp.json()["upload_url"]

        # Step 2: Request transcription
        transcript_resp = await client.post(
            "https://api.assemblyai.com/v2/transcript",
            headers=headers,
            json={"audio_url": upload_url, "language_code": "en"},
        )
        transcript_resp.raise_for_status()
        transcript_id = transcript_resp.json()["id"]

        # Step 3: Poll for completion (max 60s)
        import asyncio

        for _ in range(30):
            poll_resp = await client.get(
                f"https://api.assemblyai.com/v2/transcript/{transcript_id}",
                headers=headers,
            )
            poll_resp.raise_for_status()
            poll_data = poll_resp.json()

            if poll_data["status"] == "completed":
                return poll_data.get("text", "")
            elif poll_data["status"] == "error":
                raise ValueError(f"AssemblyAI error: {poll_data.get('error')}")

            await asyncio.sleep(2)

    raise TimeoutError("AssemblyAI transcription timed out")
