"""
Per-client-IP rate limiting for the public routes.

In-process on purpose: the API runs as one Railway instance, and the test suite and
desktop mode have no Redis. Scaling the API past one replica makes each limit
per-replica, so revisit this then.

Behind Railway's proxy request.client.host is only the real client because
Dockerfile.backend sets FORWARDED_ALLOW_IPS; without it every caller shares the
proxy's address and one bucket.
"""

import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

_hits: dict[tuple[str, str], deque] = {}
_lock = threading.Lock()


def rate_limit(name: str, limit: int, window_seconds: int):
    """A dependency allowing `limit` requests per client IP per `window_seconds`."""

    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        key = (name, client)
        now = time.monotonic()
        with _lock:
            hits = _hits.setdefault(key, deque())
            while hits and hits[0] <= now - window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = int(hits[0] + window_seconds - now) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many attempts. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)
            # Drop this limit's idle keys so one-off clients don't accumulate forever.
            # Only this limit's: another limit's window may be longer.
            for stale in [
                k for k, v in _hits.items()
                if k[0] == name and k != key and v[-1] <= now - window_seconds
            ]:
                del _hits[stale]

    return dependency


def reset() -> None:
    """Forget every counter. For tests."""
    with _lock:
        _hits.clear()
