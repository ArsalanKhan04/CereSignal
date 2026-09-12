"""
Schemas for client log ingestion
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class ClientLogEntry(BaseModel):
    """
    Client log entry payload.

    The endpoint is unauthenticated (the frontend logs before login too), so the
    lengths are capped: without them one request could write an arbitrarily large
    line to a log file kept for 30 days.
    """

    timestamp: Optional[str] = Field(None, max_length=64)
    level: str = Field(..., pattern="^(debug|info|warn|warning|error)$")
    message: str = Field(..., max_length=2000)
    context: Optional[str] = Field(None, max_length=200)
    data: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = Field(None, max_length=100)
