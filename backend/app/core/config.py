"""
Configuration management for CereSignal API
"""

try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from pydantic import field_validator
from typing import List
import os


class Settings(BaseSettings):
    """Application settings"""

    # Project settings
    PROJECT_NAME: str = "CereSignal API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    # Database settings
    DATABASE_URL: str = "postgresql://user:password@host:5432/postgres"

    # Security settings
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS settings
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8080"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    # Redis settings
    REDIS_URL: str = "redis://localhost:6379/0"

    # OpenAI settings
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Supabase client credentials (for future use: storage, auth)
    SUPABASE_URL: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""   # Safe for client-side; replaces legacy SUPABASE_ANON_KEY
    SUPABASE_SECRET_KEY: str = ""        # Backend-only; replaces legacy SUPABASE_SERVICE_ROLE_KEY

    # File upload settings
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    ALLOWED_FILE_TYPES: list = [".edf", ".csv", ".json", ".txt"]

    # Processing settings
    MAX_CONCURRENT_PROCESSES: int = 4
    PROCESSING_TIMEOUT: int = 300  # 5 minutes

    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()
