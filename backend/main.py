import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from config import get_settings
from limiter import limiter
from middleware.logging import RequestLoggingMiddleware, setup_logging
from middleware.exceptions import register_exception_handlers
from routes.auth import router as auth_router
from routes.mood import router as mood_router
from routes.chat import router as chat_router

settings = get_settings()

# Configure structured logging
setup_logging(settings.LOG_LEVEL)
logger = logging.getLogger("sonar")


async def _token_cleanup_loop() -> None:
    """Background task that purges expired/revoked refresh tokens every hour."""
    from database import AsyncSessionLocal
    from services.auth_service import cleanup_expired_tokens

    while True:
        await asyncio.sleep(3600)  # every hour
        try:
            async with AsyncSessionLocal() as session:
                count = await cleanup_expired_tokens(session)
                if count:
                    logger.info(f"Cleaned up {count} expired/revoked refresh tokens")
        except Exception as e:
            logger.error(f"Token cleanup error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle — starts background token cleanup."""
    task = asyncio.create_task(_token_cleanup_loop())
    logger.info("Sonar API started — token cleanup task running")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Sonar API",
    description="AI-powered emotion-aware music platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Rate limiter ──
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Global exception handlers ──
register_exception_handlers(app)

# ── Request logging middleware ──
app.add_middleware(RequestLoggingMiddleware)

# ── CORS — configurable via CORS_ORIGINS in .env ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Versioned API routes ──
app.include_router(auth_router, prefix="/v1")
app.include_router(mood_router, prefix="/v1")
app.include_router(chat_router, prefix="/v1")

# Also register without prefix for backward compatibility
app.include_router(auth_router)
app.include_router(mood_router)
app.include_router(chat_router)


@app.get("/")
def root() -> dict:
    return {"message": "Sonar API is running", "version": "1.0.0"}


@app.get("/health")
def health_check() -> dict:
    return {"status": "healthy"}
