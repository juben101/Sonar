from pydantic import BaseModel, Field, ConfigDict


# ── Request schemas ──


class SignupRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


# ── Response schemas ──


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: str | None = None
    avatar_url: str | None = None
    username_changed_at: str | None = None
    created_at: str | None = None


class ProfileUpdate(BaseModel):
    username: str | None = None
    email: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


# ── Mood analysis schemas ──


class MoodAnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=2000)
    lat: float | None = None
    lon: float | None = None
    prosodic: dict | None = None  # Prosodic features from voice input


class MoodDimension(BaseModel):
    name: str
    value: int
    color: str


class WeatherInfo(BaseModel):
    city: str = ""
    condition: str = ""
    description: str = ""
    temp_c: int = 0


class MoodAnalyzeResponse(BaseModel):
    mood: str
    moodEmoji: str
    base_emotion: str
    sub_emotion: str
    nuance: str
    sentiment: str
    confidence: int
    explanation: str
    genre: str
    genre_reason: str
    dimensions: list[MoodDimension]
    weather: WeatherInfo | None = None


# ── Transcription schemas ──


class TranscribeResponse(BaseModel):
    text: str
    prosodic: dict = {}


# ── Playlist schemas ──


class PlaylistRequest(BaseModel):
    dimensions: list[MoodDimension]
    preference: str = Field(..., pattern=r"^(match|uplift)$")
    languages: list[str] = Field(default=["English"])
    artists: list[str] = Field(default=[])
    intensity: int = Field(default=50, ge=0, le=100)
    track_count: int = Field(default=15, ge=2, le=50)
    genre: str = Field(default="pop")
    base_emotion: str = Field(default="Calm")
    match_mode: str = Field(default="smart", pattern=r"^(smart|strict)$")


class TrackResponse(BaseModel):
    id: int
    title: str
    artist: str
    duration: str
    color: str
    album_art: str = ""
    video_id: str = ""
    youtube_url: str = ""


class PlaylistResponse(BaseModel):
    title: str
    tracks: list[TrackResponse]
    playlist_reason: str = ""


class SavedPlaylistCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    mood: str = Field(default="")
    mood_emoji: str = Field(default="")
    base_emotion: str = Field(default="")
    tracks: int = Field(default=0, ge=0, le=200)
    track_list: list[dict] = Field(default_factory=list)
    duration: str = Field(default="")
    gradient: str = Field(default="")
    accent: str = Field(default="")
    preference: str = Field(default="match")
    settings: dict = Field(default_factory=dict)
    analysis: dict = Field(default_factory=dict)


class SavedPlaylistResponse(BaseModel):
    id: str
    title: str
    mood: str
    mood_emoji: str
    base_emotion: str
    tracks: int
    trackList: list[dict]
    duration: str
    gradient: str
    accent: str
    preference: str
    settings: dict
    analysis: dict
    created_at: str


# ── Mood history schemas ──


class MoodEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    base_emotion: str
    sub_emotion: str
    confidence: int
    sentiment: str
    genre: str
    input_preview: str
    weather_condition: str
    mood_emoji: str
    energy: float
    valence: float
    created_at: str


class EmotionCount(BaseModel):
    emotion: str
    count: int


class DailyMood(BaseModel):
    date: str
    base_emotion: str
    confidence: int
    energy: float
    valence: float


class MoodHistoryResponse(BaseModel):
    entries: list[MoodEntryResponse]
    total: int


class WeekComparison(BaseModel):
    this_week_analyses: int = 0
    last_week_analyses: int = 0
    confidence_delta: float = 0.0
    energy_delta: float = 0.0
    valence_delta: float = 0.0


class CalendarDay(BaseModel):
    date: str
    count: int
    dominant_emotion: str = ""


class MoodStatsResponse(BaseModel):
    emotion_distribution: list[EmotionCount]
    avg_confidence: float
    total_analyses: int
    daily_moods: list[DailyMood]
    top_genre: str
    dominant_emotion: str
    streak: int = 0
    week_comparison: WeekComparison = WeekComparison()
    calendar_data: list[CalendarDay] = []


# ── Song Preference schemas ──


class SongPreferenceRequest(BaseModel):
    song_key: str = Field(..., min_length=1, max_length=255)
    preference: str = Field(..., pattern=r"^(like|dislike)$")
    song_title: str = Field(default="", max_length=255)
    song_artist: str = Field(default="", max_length=255)


class SongPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    song_key: str
    preference: str
    song_title: str
    song_artist: str


class SongPreferenceBatchResponse(BaseModel):
    preferences: dict[str, str]  # {song_key: "like"|"dislike"}


# ── Chat schemas ──


class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=5000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default=[])


class ChatResponse(BaseModel):
    response: str
