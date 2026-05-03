"""
CereSignal FastAPI Application
Main application entry point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pathlib import Path
from contextlib import asynccontextmanager
import uvicorn
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.api import api_router
from app.core.middleware import setup_middleware
from app.models import user, signal, auth, contact


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for FastAPI. 
    Code before 'yield' runs on startup. Code after runs on shutdown.
    """
    # Create database tables safely
    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError as e:
        # Ignore the exact race condition error if multiple workers start at once
        if "already exists" not in str(e).lower():
            raise
    yield


def create_application() -> FastAPI:
    """Create and configure the FastAPI application"""

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="CereSignal - Brain Signal Processing API",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
        lifespan=lifespan,
    )

    # Setup middleware
    setup_middleware(app)

    # Include API router
    app.include_router(api_router, prefix=settings.API_V1_STR)

    return app


app = create_application()


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to CereSignal API",
        "version": settings.VERSION,
        "docs": f"{settings.API_V1_STR}/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "cere-signal-api"}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )