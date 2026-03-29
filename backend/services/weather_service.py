"""
Weather Service — fetches current weather for mood-influenced recommendations.

Uses OpenWeatherMap API to get weather conditions at user's location.
Weather context is passed to the LLM for genre-aware recommendations.
"""

import logging

import httpx

from config import get_settings

logger = logging.getLogger("sonar.weather")

# ── Weather → mood influence mapping ──
WEATHER_MOODS = {
    "Thunderstorm": {"mood_hint": "intense, dramatic", "genre_hint": "rock, electronic"},
    "Drizzle": {"mood_hint": "mellow, introspective", "genre_hint": "lo-fi, ambient"},
    "Rain": {"mood_hint": "reflective, cozy", "genre_hint": "indie folk, acoustic"},
    "Snow": {"mood_hint": "quiet, magical", "genre_hint": "classical, ambient"},
    "Clear": {"mood_hint": "uplifting, bright", "genre_hint": "pop, indie pop"},
    "Clouds": {"mood_hint": "neutral, contemplative", "genre_hint": "alternative, chill"},
    "Mist": {"mood_hint": "ethereal, dreamy", "genre_hint": "ambient, trip-hop"},
    "Fog": {"mood_hint": "ethereal, dreamy", "genre_hint": "ambient, trip-hop"},
    "Haze": {"mood_hint": "lazy, hazy", "genre_hint": "lo-fi, chill"},
    "Smoke": {"mood_hint": "heavy, tense", "genre_hint": "grunge, rock"},
    "Dust": {"mood_hint": "restless, arid", "genre_hint": "desert rock, blues"},
    "Sand": {"mood_hint": "restless, arid", "genre_hint": "world, folk"},
    "Ash": {"mood_hint": "dark, ominous", "genre_hint": "metal, dark ambient"},
    "Squall": {"mood_hint": "chaotic, powerful", "genre_hint": "punk, electronic"},
    "Tornado": {"mood_hint": "intense, overwhelming", "genre_hint": "metal, industrial"},
}


async def get_weather(lat: float, lon: float) -> dict | None:
    """
    Fetch current weather for given coordinates.

    Returns dict with: condition, description, temp_c, humidity,
    mood_hint, genre_hint. Returns None if weather service unavailable.
    """
    settings = get_settings()
    if not settings.OPENWEATHERMAP_API_KEY:
        logger.info("Weather API key not configured, skipping")
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": settings.OPENWEATHERMAP_API_KEY,
                    "units": "metric",
                },
            )
            response.raise_for_status()

        data = response.json()
        weather_main = data.get("weather", [{}])[0].get("main", "Clear")
        weather_desc = data.get("weather", [{}])[0].get("description", "clear sky")
        temp = data.get("main", {}).get("temp", 20)
        humidity = data.get("main", {}).get("humidity", 50)
        city = data.get("name", "Unknown")

        mood_info = WEATHER_MOODS.get(weather_main, WEATHER_MOODS["Clear"])

        result = {
            "condition": weather_main,
            "description": weather_desc,
            "temp_c": round(temp),
            "humidity": humidity,
            "city": city,
            "mood_hint": mood_info["mood_hint"],
            "genre_hint": mood_info["genre_hint"],
        }

        logger.info(
            f"✓ Weather: {city} — {weather_desc}, {temp}°C"
        )
        return result

    except Exception as e:
        logger.warning(f"✗ Weather fetch failed: {e}")
        return None
