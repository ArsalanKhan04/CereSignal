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
    # Unauthenticated input: a raw newline would let a caller forge whole log lines
    # (a fake "AUTH: LOGIN | status=SUCCESS", say). Keep it on one visible line.
    message = entry.message.replace("\r", "\\r").replace("\n", "\\n")
    extra = {
        "context": entry.context,
        "data": entry.data,
        "request_id": entry.request_id,
        "client_ts": entry.timestamp,
        "source": "client",
    }

    if level in ["warn", "warning"]:
        logger.warning(message, extra=extra)
    elif level == "error":
        logger.error(message, extra=extra)
    elif level == "debug":
        logger.debug(message, extra=extra)
    else:
        logger.info(message, extra=extra)

    return {"status": "ok"}
