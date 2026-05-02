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
from app.models import user, signal, auth
from sqlalchemy import text


def _run_migrations():
    """Add new columns to existing tables if they don't exist yet."""
    with engine.connect() as conn:
        is_postgres = "postgresql" in str(engine.url)

        migrations = [
            # Users table — portal-token flow
            ("ALTER TABLE users ADD COLUMN report_sent BOOLEAN NOT NULL DEFAULT false", "report_sent"),
            ("ALTER TABLE users ADD COLUMN portal_token VARCHAR(255)", "portal_token"),
            ("ALTER TABLE users ADD COLUMN portal_sent_at TIMESTAMP WITH TIME ZONE", "portal_sent_at"),
        ]

        for sql, col_name in migrations:
            try:
                if is_postgres:
                    conn.execute(text(sql.replace("ADD COLUMN", "ADD COLUMN IF NOT EXISTS")))
                else:
                    conn.execute(text(sql))
            except Exception as e:
                if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                    raise
        conn.commit()


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

    # Run column migrations for existing tables
    _run_migrations()

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