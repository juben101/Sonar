from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/sonar"
    JWT_SECRET_KEY: str = "sonar-super-secret-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS — comma-separated origins
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Logging
    LOG_LEVEL: str = "INFO"

    # ── AI Emotion Analysis (fallback: NVIDIA NIM → Groq → Together AI) ──
    NVIDIA_NIM_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    TOGETHER_API_KEY: str = ""

    # ── Voice Transcription (fallback: Deepgram → AssemblyAI) ──
    DEEPGRAM_API_KEY: str = ""
    ASSEMBLYAI_API_KEY: str = ""

    # ── Weather (OpenWeatherMap) ──
    OPENWEATHERMAP_API_KEY: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
