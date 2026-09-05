"""
Public runtime configuration endpoint

Lets the frontend discover which optional backend capabilities are enabled, so a
single frontend build works against both an AI-enabled and a manual-entry-only
deployment. Unauthenticated by design — it exposes feature flags only, no secrets.
"""

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("")
async def get_runtime_config():
    """Return public feature flags for this deployment"""
    return {"ai_inference_enabled": settings.AI_INFERENCE_ENABLED}
