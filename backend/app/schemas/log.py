"""
Schemas for client log ingestion
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class ClientLogEntry(BaseModel):
    """Client log entry payload"""

    timestamp: Optional[str] = None
    level: str = Field(..., pattern="^(debug|info|warn|warning|error)$")
    message: str
    context: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
