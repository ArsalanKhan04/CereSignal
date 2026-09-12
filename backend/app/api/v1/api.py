"""
Main API router
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    auth,
    config,
    contact,
    dev_admin,
    logs,
    notifications,
    reports,
    signals,
    users,
)

api_router = APIRouter()

# Include endpoint routers
api_router.include_router(config.router, prefix="/config", tags=["config"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(signals.router, prefix="/signals", tags=["signals"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(contact.router, prefix="/contact", tags=["contact"])
api_router.include_router(dev_admin.router, prefix="/dev-admin", tags=["dev-admin"])
