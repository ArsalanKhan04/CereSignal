"""
Main API router
"""

from fastapi import APIRouter
from app.api.v1.endpoints import auth, signals, processing, users

api_router = APIRouter()

# Include endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(signals.router, prefix="/signals", tags=["signals"])
api_router.include_router(processing.router, prefix="/processing", tags=["processing"])