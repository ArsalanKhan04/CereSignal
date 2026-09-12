"""
Configuration management for CereSignal API
"""

try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from pydantic import field_validator
from typing import List, Union
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

    # Security settings. No usable default: main.py refuses to start the API on an
    # empty key or one of PLACEHOLDER_SECRET_KEYS, since anyone who knows the key can
    # mint a JWT for any account.
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS settings
    BACKEND_CORS_ORIGINS: Union[List[str], str] = ["http://localhost:3000", "http://localhost:8080"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    # Redis settings
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI/ML inference. Set False for a manual-entry-only deployment
    # (no torch, no model weights, no LLM report generation).
    AI_INFERENCE_ENABLED: bool = True

    # OpenAI settings
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Local Ollama, used for report drafting when OPENAI_API_KEY is empty. With
    # OLLAMA_MODEL empty, the most recently pulled model is used.
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = ""

    # Supabase client credentials (for future use: storage, auth)
    SUPABASE_URL: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""   # Safe for client-side; replaces legacy SUPABASE_ANON_KEY
    SUPABASE_SECRET_KEY: str = ""        # Backend-only; replaces legacy SUPABASE_SERVICE_ROLE_KEY

    # File upload settings
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    ALLOWED_FILE_TYPES: Union[List[str], str] = [".edf", ".csv", ".json", ".txt"]

    @field_validator("ALLOWED_FILE_TYPES", mode="before")
    @classmethod
    def assemble_file_types(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    # Processing settings
    MAX_CONCURRENT_PROCESSES: int = 4
    PROCESSING_TIMEOUT: int = 300  # 5 minutes

    # Email — Resend SDK (preferred)
    RESEND_API_KEY: str = ""

    # Email — SMTP fallback (fastapi-mail)
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_PORT: int = 465
    MAIL_SERVER: str = "smtp.resend.com"
    MAIL_STARTTLS: bool = False
    MAIL_SSL_TLS: bool = True

    # Frontend URL (used in invitation email links)
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        case_sensitive = True


# Values that have shipped as a SECRET_KEY default — the old config.py default and
# the .env.example placeholder that scripts/setup.sh replaces.
PLACEHOLDER_SECRET_KEYS = {
    "",
    "your-secret-key-change-in-production",
    "change-me-for-local-dev",
}


# Create settings instance
settings = Settings()
