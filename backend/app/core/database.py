"""
Database configuration and session management
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings


def _connect_args(url: str) -> dict:
    """
    Driver-specific connect arguments.

    sslmode is a Postgres-only option — passing it to any other driver raises
    TypeError at connection time, which is what previously made local SQLite
    development impossible.
    """
    if url.startswith("postgresql://") or url.startswith("postgres://"):
        return {"sslmode": "require"}
    if url.startswith("sqlite://"):
        # FastAPI serves requests from a threadpool, so the connection must not
        # be pinned to the creating thread.
        return {"check_same_thread": False}
    return {}


# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args(settings.DATABASE_URL),
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
