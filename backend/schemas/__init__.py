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
    created_at: str | None = None


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


class MoodDimension(BaseModel):
    name: str
    value: int
    color: str


class MoodAnalyzeResponse(BaseModel):
    mood: str
    moodEmoji: str
    nuance: str
    sentiment: str
    confidence: int
    explanation: str
    dimensions: list[MoodDimension]


class PlaylistRequest(BaseModel):
    dimensions: list[MoodDimension]
    preference: str = Field(..., pattern=r"^(match|uplift)$")
    languages: list[str] = Field(default=["English"])
    artists: list[str] = Field(default=[])
    intensity: int = Field(default=50, ge=0, le=100)
    track_count: int = Field(default=15, ge=5, le=50)


class TrackResponse(BaseModel):
    id: int
    title: str
    artist: str
    duration: str
    color: str


class PlaylistResponse(BaseModel):
    title: str
    tracks: list[TrackResponse]
