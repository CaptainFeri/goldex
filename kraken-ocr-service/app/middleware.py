import logging
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("kraken-ocr")


class TimeoutMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, timeout_sec: int = 30):
        super().__init__(app)
        self.timeout_sec = timeout_sec

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        try:
            response = await call_next(request)
            elapsed = (time.monotonic() - start) * 1000
            response.headers["X-Processing-Time-Ms"] = str(round(elapsed, 2))
            return response
        except Exception as e:
            elapsed = (time.monotonic() - start) * 1000
            logger.error("Request failed after %.0fms: %s", elapsed, e)
            return JSONResponse(
                status_code=504 if elapsed > self.timeout_sec * 1000 else 500,
                content={"detail": str(e) if elapsed <= self.timeout_sec * 1000 else "Request timeout"},
            )


def setup_rate_limiter(app: FastAPI, default_limit: str = "10/minute"):
    try:
        from slowapi import Limiter, _rate_limit_exceeded_handler
        from slowapi.errors import RateLimitExceeded
        from slowapi.middleware import SlowAPIMiddleware
        from slowapi.util import get_remote_address

        limiter = Limiter(
            key_func=get_remote_address,
            default_limits=[default_limit],
        )
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.add_middleware(SlowAPIMiddleware)
        logger.info("Rate limiter enabled (default: %s)", default_limit)
        return limiter
    except ImportError:
        logger.warning("slowapi not installed; rate limiting disabled")
        return None


def setup_middleware(app: FastAPI, timeout_sec: int = 30):
    app.add_middleware(TimeoutMiddleware, timeout_sec=timeout_sec)
