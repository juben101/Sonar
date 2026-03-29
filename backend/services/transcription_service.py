"""
Voice Transcription Service — speech-to-text with provider fallback.

Fallback hierarchy: Deepgram → AssemblyAI
Accepts raw audio bytes and returns transcribed text.
"""

import logging

import httpx

from config import get_settings

logger = logging.getLogger("sonar.transcription")


async def transcribe_audio(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    """
    Transcribe audio bytes to text using available providers.

    Tries Deepgram first, falls back to AssemblyAI.
    Returns the transcribed text string.
    """
    settings = get_settings()
    last_error = None

    # ── Try Deepgram ──
    if settings.DEEPGRAM_API_KEY:
        try:
            text = await _deepgram_transcribe(
                audio_bytes, settings.DEEPGRAM_API_KEY, content_type
            )
            if text:
                logger.info(f"✓ Deepgram: transcribed {len(text)} chars")
                return text
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
                return text
        except Exception as e:
            last_error = e
            logger.warning(f"✗ AssemblyAI failed: {e}")

    if last_error:
        raise ValueError(f"All transcription providers failed: {last_error}")
    raise ValueError("No transcription API keys configured")


async def _deepgram_transcribe(
    audio_bytes: bytes, api_key: str, content_type: str
) -> str:
    """Transcribe via Deepgram's Nova-2 model."""
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
                "language": "en",
            },
            content=audio_bytes,
        )
        response.raise_for_status()

    data = response.json()
    alternatives = (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])
    )
    if alternatives:
        return alternatives[0].get("transcript", "")
    return ""


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
