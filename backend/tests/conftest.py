"""Shared test fixtures for backend tests."""

import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# ── Set dummy API keys BEFORE importing config ──
# This ensures services attempt HTTP calls (mocked by respx)
# instead of bailing with "no API key configured"
os.environ.setdefault("NVIDIA_NIM_API_KEY", "test-nvidia-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("TOGETHER_API_KEY", "test-together-key")
os.environ.setdefault("DEEPGRAM_API_KEY", "test-deepgram-key")
os.environ.setdefault("ASSEMBLYAI_API_KEY", "test-assemblyai-key")
os.environ.setdefault("OPENWEATHERMAP_API_KEY", "test-weather-key")

from config import get_settings  # noqa: E402

# Clear cached settings so the env vars above take effect
get_settings.cache_clear()

from database import Base, get_db  # noqa: E402
from main import app  # noqa: E402
from limiter import limiter  # noqa: E402

settings = get_settings()

# Use a test database URL (append _test if not already)
TEST_DB_URL = settings.DATABASE_URL
if not TEST_DB_URL.endswith("_test"):
    TEST_DB_URL = TEST_DB_URL + "_test"
if TEST_DB_URL.startswith("postgresql://"):
    TEST_DB_URL = TEST_DB_URL.replace("postgresql://", "postgresql+psycopg://", 1)

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for all tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create all tables before each test, drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    """Provide a test DB session."""
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@pytest_asyncio.fixture(autouse=True)
def disable_rate_limiter():
    """Disable rate limiting during tests so tests don't interfere with each other."""
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing FastAPI routes."""
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
