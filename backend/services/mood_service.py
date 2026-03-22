"""
Mood Analysis Engine — Sonar's core NLP service.

Uses VADER sentiment analysis + keyword-based emotion extraction to map
free-text input to 6 emotional dimensions (0–100), determine a primary mood,
and generate a mood-matched or mood-uplifting playlist from a built-in catalog.
"""

import random
from dataclasses import dataclass

import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer

# Download VADER lexicon on first import (idempotent)
nltk.download("vader_lexicon", quiet=True)

_sia = SentimentIntensityAnalyzer()

# ── Emotion keyword banks ──

_EMOTION_KEYWORDS: dict[str, list[str]] = {
    "sadness": [
        "sad",
        "cry",
        "tears",
        "lonely",
        "alone",
        "depressed",
        "miss",
        "hurt",
        "pain",
        "loss",
        "grief",
        "empty",
        "broken",
        "miserable",
        "heartbreak",
        "sorrow",
        "mourning",
        "regret",
        "hopeless",
        "despair",
        "gloomy",
        "melancholy",
        "blue",
        "down",
        "weep",
        "ache",
        "suffer",
    ],
    "joy": [
        "happy",
        "joy",
        "excited",
        "amazing",
        "wonderful",
        "love",
        "great",
        "fantastic",
        "awesome",
        "celebrate",
        "laugh",
        "smile",
        "cheerful",
        "blessed",
        "grateful",
        "delighted",
        "ecstatic",
        "thrilled",
        "bliss",
        "elated",
        "euphoric",
        "radiant",
        "vibrant",
        "gleeful",
        "merry",
    ],
    "energy": [
        "hyped",
        "pumped",
        "energetic",
        "wild",
        "fire",
        "lit",
        "power",
        "strong",
        "fast",
        "run",
        "dance",
        "party",
        "adrenaline",
        "intense",
        "unstoppable",
        "fierce",
        "bold",
        "alive",
        "electric",
        "turbo",
        "beast",
        "rage",
        "fury",
        "sprint",
        "grind",
        "hustle",
    ],
    "calm": [
        "calm",
        "peace",
        "quiet",
        "relax",
        "serene",
        "gentle",
        "soft",
        "chill",
        "soothing",
        "still",
        "tranquil",
        "meditate",
        "breathe",
        "zen",
        "harmony",
        "mellow",
        "ease",
        "rest",
        "slow",
        "float",
        "drift",
        "cozy",
        "comfort",
        "warm",
        "safe",
        "content",
    ],
    "tension": [
        "anxious",
        "stress",
        "worried",
        "nervous",
        "fear",
        "scared",
        "panic",
        "dread",
        "overwhelm",
        "pressure",
        "restless",
        "tense",
        "uneasy",
        "agitated",
        "frustrated",
        "angry",
        "rage",
        "irritated",
        "annoyed",
        "conflict",
        "chaos",
        "crisis",
        "trapped",
        "suffocate",
    ],
    "nostalgia": [
        "remember",
        "memory",
        "past",
        "childhood",
        "miss",
        "old",
        "reminisce",
        "throwback",
        "vintage",
        "retro",
        "home",
        "youth",
        "used to",
        "back then",
        "once",
        "ago",
        "forgotten",
        "time",
        "bittersweet",
        "longing",
        "wistful",
        "someday",
        "distant",
    ],
}

# ── Mood mapping ──

_MOOD_MAP: list[dict] = [
    {
        "label": "Melancholy",
        "emoji": "🌧",
        "nuance": "Melancholic",
        "sentiment_label": "Negative",
        "condition": lambda d: d["sadness"] > 50 and d["joy"] < 30,
    },
    {
        "label": "Nostalgic",
        "emoji": "🕰",
        "nuance": "Wistful",
        "sentiment_label": "Mixed",
        "condition": lambda d: d["nostalgia"] > 45,
    },
    {
        "label": "Anxious",
        "emoji": "😰",
        "nuance": "Restless",
        "sentiment_label": "Negative",
        "condition": lambda d: d["tension"] > 50 and d["calm"] < 30,
    },
    {
        "label": "Euphoric",
        "emoji": "✨",
        "nuance": "Ecstatic",
        "sentiment_label": "Positive",
        "condition": lambda d: d["joy"] > 55 and d["energy"] > 45,
    },
    {
        "label": "Happy",
        "emoji": "😊",
        "nuance": "Cheerful",
        "sentiment_label": "Positive",
        "condition": lambda d: d["joy"] > 45,
    },
    {
        "label": "Energized",
        "emoji": "⚡",
        "nuance": "Fired Up",
        "sentiment_label": "Positive",
        "condition": lambda d: d["energy"] > 50,
    },
    {
        "label": "Peaceful",
        "emoji": "🍃",
        "nuance": "Serene",
        "sentiment_label": "Positive",
        "condition": lambda d: d["calm"] > 50 and d["tension"] < 25,
    },
    {
        "label": "Tense",
        "emoji": "😤",
        "nuance": "Agitated",
        "sentiment_label": "Negative",
        "condition": lambda d: d["tension"] > 40,
    },
    {
        "label": "Sad",
        "emoji": "😢",
        "nuance": "Heavy-hearted",
        "sentiment_label": "Negative",
        "condition": lambda d: d["sadness"] > 35,
    },
    {
        "label": "Reflective",
        "emoji": "🌙",
        "nuance": "Contemplative",
        "sentiment_label": "Neutral",
        "condition": lambda _: True,  # default fallback
    },
]

# ── Explanation templates ──

_EXPLANATIONS: dict[str, str] = {
    "Melancholy": (
        "Your words carry a gentle weight — a sense of reflection and longing, "
        "mixed with quiet vulnerability. There's beauty in this depth; "
        "it suggests a rich inner emotional landscape."
    ),
    "Nostalgic": (
        "We detected a strong thread of memory and longing in your words. "
        "You seem to be reaching back to something meaningful from the past — "
        "a bittersweet connection to moments that shaped you."
    ),
    "Anxious": (
        "Your input reveals heightened tension and restlessness. "
        "There's an undercurrent of worry — your mind seems to be racing, "
        "processing multiple stressors at once."
    ),
    "Euphoric": (
        "Pure positive energy radiates from your words! "
        "You're experiencing a peak emotional state — everything feels electric, "
        "alive, and full of possibility."
    ),
    "Happy": (
        "A warm, genuine positivity flows through your expression. "
        "You seem to be in a good place — content, optimistic, "
        "and open to the world around you."
    ),
    "Energized": (
        "Your words pulse with raw energy and determination. "
        "There's a fire in you right now — a drive to move, create, and conquer. "
        "This is your power state."
    ),
    "Peaceful": (
        "A beautiful calm permeates your expression. "
        "You seem centered and grounded — in tune with a quiet inner stillness "
        "that many strive for but few truly find."
    ),
    "Tense": (
        "We sense friction and frustration beneath the surface. "
        "Something is weighing on you — perhaps a conflict or a situation "
        "that feels beyond your control right now."
    ),
    "Sad": (
        "Your words reflect a heaviness — a low emotional state "
        "that's pulling you inward. This is valid and real, "
        "and acknowledging it is the first step toward processing it."
    ),
    "Reflective": (
        "Your expression is contemplative and measured. "
        "You seem to be in a thoughtful space — turning ideas over, "
        "examining feelings, and seeking deeper understanding."
    ),
}

# ── Music Catalog ──

_DIMENSION_COLORS = {
    "sadness": "#7c8cff",
    "nostalgia": "#c96dff",
    "calm": "#00d4aa",
    "tension": "#ff6b00",
    "joy": "#ffcc00",
    "energy": "#ff3c64",
}


@dataclass
class Track:
    title: str
    artist: str
    duration: str
    tags: dict[str, int]  # dimension -> affinity 0-100


_CATALOG: list[Track] = [
    # ── Sad / Melancholy ──
    Track(
        "Skinny Love", "Bon Iver", "3:58", {"sadness": 85, "nostalgia": 60, "calm": 40}
    ),
    Track(
        "Fourth of July",
        "Sufjan Stevens",
        "4:22",
        {"sadness": 90, "nostalgia": 70, "calm": 35},
    ),
    Track(
        "The Night We Met",
        "Lord Huron",
        "3:28",
        {"sadness": 80, "nostalgia": 75, "calm": 30},
    ),
    Track("Liability", "Lorde", "2:52", {"sadness": 75, "nostalgia": 50, "calm": 45}),
    Track(
        "All I Want", "Kodaline", "5:07", {"sadness": 82, "nostalgia": 55, "calm": 38}
    ),
    Track(
        "Someone Like You",
        "Adele",
        "4:45",
        {"sadness": 78, "nostalgia": 65, "calm": 42},
    ),
    # ── Nostalgic ──
    Track(
        "Pink Moon", "Nick Drake", "2:03", {"nostalgia": 85, "calm": 60, "sadness": 50}
    ),
    Track("Dreams", "Fleetwood Mac", "4:14", {"nostalgia": 80, "calm": 45, "joy": 40}),
    Track(
        "Space Song",
        "Beach House",
        "5:22",
        {"nostalgia": 82, "calm": 55, "sadness": 40},
    ),
    Track(
        "Fade Into You",
        "Mazzy Star",
        "4:54",
        {"nostalgia": 88, "calm": 50, "sadness": 45},
    ),
    Track(
        "Video Games",
        "Lana Del Rey",
        "4:42",
        {"nostalgia": 78, "sadness": 55, "calm": 40},
    ),
    # ── Calm / Peaceful ──
    Track(
        "Weightless", "Marconi Union", "8:09", {"calm": 95, "tension": 5, "sadness": 15}
    ),
    Track(
        "Clair de Lune", "Debussy", "5:00", {"calm": 90, "nostalgia": 50, "sadness": 25}
    ),
    Track(
        "Nuvole Bianche",
        "Ludovico Einaudi",
        "5:57",
        {"calm": 85, "nostalgia": 55, "sadness": 30},
    ),
    Track(
        "Re: Stacks", "Bon Iver", "6:41", {"calm": 75, "sadness": 55, "nostalgia": 60}
    ),
    Track(
        "To Build a Home",
        "The Cinematic Orchestra",
        "6:03",
        {"calm": 70, "nostalgia": 65, "sadness": 50},
    ),
    Track(
        "Gymnopédie No.1",
        "Erik Satie",
        "3:05",
        {"calm": 92, "nostalgia": 45, "tension": 5},
    ),
    # ── Happy / Joyful ──
    Track(
        "Here Comes the Sun",
        "The Beatles",
        "3:05",
        {"joy": 90, "energy": 40, "calm": 35},
    ),
    Track("Happy", "Pharrell Williams", "3:53", {"joy": 95, "energy": 70}),
    Track(
        "Walking on Sunshine", "Katrina & The Waves", "3:58", {"joy": 88, "energy": 75}
    ),
    Track("Good as Hell", "Lizzo", "2:39", {"joy": 85, "energy": 80}),
    Track("Lovely Day", "Bill Withers", "4:15", {"joy": 82, "calm": 50, "energy": 35}),
    Track(
        "Three Little Birds",
        "Bob Marley",
        "3:00",
        {"joy": 80, "calm": 55, "energy": 30},
    ),
    Track("Mr. Blue Sky", "ELO", "5:03", {"joy": 92, "energy": 65}),
    # ── Energetic ──
    Track(
        "Blinding Lights",
        "The Weeknd",
        "3:20",
        {"energy": 90, "joy": 55, "tension": 25},
    ),
    Track("Lose Yourself", "Eminem", "5:26", {"energy": 95, "tension": 50}),
    Track("Can't Hold Us", "Macklemore", "4:18", {"energy": 92, "joy": 65}),
    Track(
        "Titanium",
        "David Guetta ft. Sia",
        "3:49",
        {"energy": 85, "joy": 50, "tension": 20},
    ),
    Track("Stronger", "Kanye West", "5:12", {"energy": 88, "joy": 45}),
    Track(
        "Eye of the Tiger", "Survivor", "4:04", {"energy": 90, "tension": 35, "joy": 40}
    ),
    Track("Levels", "Avicii", "3:18", {"energy": 92, "joy": 70}),
    # ── Tense / Anxious ──
    Track(
        "Creep", "Radiohead", "3:56", {"tension": 70, "sadness": 60, "nostalgia": 30}
    ),
    Track(
        "Everybody Hurts",
        "R.E.M.",
        "5:17",
        {"tension": 50, "sadness": 75, "nostalgia": 40},
    ),
    Track(
        "Mad World", "Gary Jules", "3:08", {"tension": 65, "sadness": 80, "calm": 30}
    ),
    Track("Exit Music", "Radiohead", "4:24", {"tension": 80, "sadness": 60}),
    Track("Breathe Me", "Sia", "4:34", {"tension": 55, "sadness": 70, "calm": 35}),
    # ── Uplifting (for "Uplift" preference) ──
    Track("Don't Stop Me Now", "Queen", "3:29", {"joy": 95, "energy": 90}),
    Track("Shake It Off", "Taylor Swift", "3:39", {"joy": 85, "energy": 80}),
    Track("Best Day of My Life", "American Authors", "3:14", {"joy": 90, "energy": 75}),
    Track("On Top of the World", "Imagine Dragons", "3:12", {"joy": 88, "energy": 72}),
    Track(
        "Unwritten",
        "Natasha Bedingfield",
        "4:18",
        {"joy": 82, "energy": 60, "calm": 25},
    ),
]


# ── Analysis engine ──


def analyze_mood(text: str) -> dict:
    """
    Analyze free-text input and return mood analysis.

    Returns dict with: mood, moodEmoji, nuance, sentiment, confidence,
    explanation, dimensions.
    """
    text_lower = text.lower()
    words = set(text_lower.split())

    # 1. VADER compound score (-1 to 1)
    vader = _sia.polarity_scores(text)
    compound = vader["compound"]

    # 2. Keyword-based dimension scoring
    dimensions: dict[str, int] = {}
    for dim, keywords in _EMOTION_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in text_lower or kw in words)
        keyword_score = min(hits * 18, 80)  # cap keyword contribution

        # VADER boost: amplify relevant dimensions based on sentiment
        vader_boost = 0
        if dim in ("sadness", "tension") and compound < -0.2:
            vader_boost = int(abs(compound) * 40)
        elif dim in ("joy", "energy") and compound > 0.2:
            vader_boost = int(compound * 40)
        elif dim == "calm" and abs(compound) < 0.3:
            vader_boost = int((1 - abs(compound)) * 25)
        elif dim == "nostalgia" and compound < 0:
            vader_boost = int(abs(compound) * 15)

        raw = keyword_score + vader_boost
        # Add baseline noise for variety (10-25)
        baseline = random.randint(8, 22)
        dimensions[dim] = min(max(raw + baseline, 5), 100)

    # 3. Determine primary mood via condition matching
    mood_info = None
    for m in _MOOD_MAP:
        if m["condition"](dimensions):
            mood_info = m
            break

    label = mood_info["label"]

    # 4. Confidence = how strongly the top dimension dominates
    sorted_dims = sorted(dimensions.values(), reverse=True)
    spread = sorted_dims[0] - sorted_dims[1] if len(sorted_dims) > 1 else 50
    confidence = min(60 + spread + int(abs(compound) * 20), 98)

    # 5. Build dimension list for response
    dim_list = [
        {
            "name": dim.capitalize(),
            "value": val,
            "color": _DIMENSION_COLORS.get(dim, "#888"),
        }
        for dim, val in sorted(dimensions.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "mood": label,
        "moodEmoji": mood_info["emoji"],
        "nuance": mood_info["nuance"],
        "sentiment": mood_info["sentiment_label"],
        "confidence": confidence,
        "explanation": _EXPLANATIONS.get(label, _EXPLANATIONS["Reflective"]),
        "dimensions": dim_list,
    }


def generate_playlist(
    dimensions: list[dict],
    preference: str = "match",
    languages: list[str] | None = None,
    artists: list[str] | None = None,
    intensity: int = 50,
    track_count: int = 15,
) -> dict:
    """
    Generate a playlist based on mood dimensions, user preference, and customization.

    preference: "match" = songs that match the mood,
                "uplift" = songs that counterbalance toward positivity.
    intensity: 0 (soft) to 100 (strong) — adjusts energy/calm weighting.
    track_count: 5 to 50 — number of tracks to include.
    artists: optional list of preferred artist names (boosted in scoring).
    """
    # Convert dimension list to dict
    dim_dict = {d["name"].lower(): d["value"] for d in dimensions}

    if preference == "uplift":
        target = {
            "joy": min(dim_dict.get("sadness", 50) + 30, 100),
            "energy": min(dim_dict.get("tension", 50) + 20, 100),
            "calm": dim_dict.get("calm", 40),
            "sadness": max(dim_dict.get("sadness", 50) - 40, 5),
            "tension": max(dim_dict.get("tension", 50) - 40, 5),
            "nostalgia": max(dim_dict.get("nostalgia", 30) - 20, 5),
        }
    else:
        target = dict(dim_dict)

    # Apply intensity modifier: high intensity boosts energy, low boosts calm
    intensity_factor = (intensity - 50) / 50  # -1 to 1
    if "energy" in target:
        target["energy"] = min(max(target["energy"] + int(intensity_factor * 30), 5), 100)
    if "calm" in target:
        target["calm"] = min(max(target["calm"] - int(intensity_factor * 20), 5), 100)

    # Normalize artist names for matching
    preferred_artists = [a.lower().strip() for a in (artists or []) if a.strip()]

    # Score each track
    scored: list[tuple[float, Track]] = []
    for track in _CATALOG:
        score = 0.0
        for dim, target_val in target.items():
            track_val = track.tags.get(dim, 0)
            score += max(0, 100 - abs(target_val - track_val))

        # Artist boost: if user requested specific artists, boost matching tracks
        if preferred_artists:
            track_artist_lower = track.artist.lower()
            for pa in preferred_artists:
                if pa in track_artist_lower or track_artist_lower in pa:
                    score += 500  # massive boost
                    break

        scored.append((score, track))

    # Sort by score, take more than needed, shuffle, then trim
    scored.sort(key=lambda x: x[0], reverse=True)
    pool_size = min(len(scored), track_count + 8)
    top_tracks = [t for _, t in scored[:pool_size]]
    random.shuffle(top_tracks)
    selected = top_tracks[:track_count]

    # Playlist title
    top_dim_name = max(dim_dict, key=dim_dict.get) if dim_dict else "calm"

    playlist_names = {
        "match": {
            "sadness": "Midnight Drift",
            "nostalgia": "Faded Memories",
            "calm": "Still Waters",
            "tension": "Edge of Silence",
            "joy": "Golden Hour",
            "energy": "Solar Flare",
        },
        "uplift": {
            "sadness": "Silver Linings",
            "nostalgia": "New Horizons",
            "calm": "Morning Light",
            "tension": "Breaking Free",
            "joy": "Double Rainbow",
            "energy": "Supernova",
        },
    }

    title = playlist_names.get(preference, playlist_names["match"]).get(
        top_dim_name, "Sonar Mix"
    )

    tracks = []
    for i, t in enumerate(selected):
        strongest = max(t.tags, key=t.tags.get) if t.tags else "calm"
        color = _DIMENSION_COLORS.get(strongest, "#888")
        tracks.append(
            {
                "id": i + 1,
                "title": t.title,
                "artist": t.artist,
                "duration": t.duration,
                "color": color,
            }
        )

    return {"title": title, "tracks": tracks}

