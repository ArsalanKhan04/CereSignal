"""
Client logging endpoints
"""

from fastapi import APIRouter, HTTPException, status

from app.core.logging_config import logger
from app.schemas.log import ClientLogEntry

router = APIRouter()


@router.post("/client")
async def ingest_client_log(entry: ClientLogEntry):
    """Ingest a client log entry and write to server logs"""

    level = entry.level.lower()
    extra = {
        "context": entry.context,
        "data": entry.data,
        "request_id": entry.request_id,
        "client_ts": entry.timestamp,
        "source": "client",
    }

    if level in ["warn", "warning"]:
        logger.warning(entry.message, extra=extra)
    elif level == "error":
        logger.error(entry.message, extra=extra)
    elif level == "debug":
        logger.debug(entry.message, extra=extra)
    else:
        logger.info(entry.message, extra=extra)

    return {"status": "ok"}
