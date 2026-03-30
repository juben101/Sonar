"""Structured logging with request ID tracking."""

import logging
import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Context variable to hold the current request ID
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Inject request_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get("-")
        return True


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Generates a unique request ID per request
    2. Logs request start and finish with status code + duration
    3. Stores the request ID in a context variable for downstream use
    """

    async def dispatch(self, request: Request, call_next):
        rid = uuid.uuid4().hex[:12]
        token = request_id_ctx.set(rid)

        logger = logging.getLogger("sonar")
        logger.info(f"{request.method} {request.url.path} started")

        import time

        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        logger.info(
            f"{request.method} {request.url.path} → {response.status_code} ({elapsed_ms:.0f}ms)"
        )

        # Add request ID to response headers
        response.headers["X-Request-ID"] = rid

        request_id_ctx.reset(token)
        return response


def setup_logging(level: str = "INFO") -> None:
    """Configure structured logging with request ID."""
    log_format = (
        "%(asctime)s | %(levelname)-5s | %(request_id)s | %(name)s | %(message)s"
    )

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(log_format, datefmt="%Y-%m-%d %H:%M:%S"))
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger("sonar")
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Quiet noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
