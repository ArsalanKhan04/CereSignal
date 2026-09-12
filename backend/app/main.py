"""
CereSignal FastAPI Application
Main application entry point
"""

import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.exc import OperationalError

from app.api.v1.api import api_router
from app.core.config import PLACEHOLDER_SECRET_KEYS, settings
from app.core.database import Base, engine
from app.core.middleware import setup_middleware

# ---------------------------------------------------------------------------
# Human-readable error messages for common Pydantic validation failures
# ---------------------------------------------------------------------------
_FIELD_LABELS = {
    "username": "Username",
    "email": "Email address",
    "password": "Password",
    "confirm_password": "Confirm password",
    "new_password": "New password",
    "confirm_new_password": "Confirm new password",
    "current_password": "Current password",
    "first_name": "First name",
    "last_name": "Last name",
    "name": "Full name",
    "phone": "Phone number",
    "title": "Title",
    "specialization": "Specialization",
    "license_number": "License number",
    "hospital_affiliation": "Hospital affiliation",
    "years_experience": "Years of experience",
    "hospital_name": "Hospital name",
    "hospital_address": "Hospital address",
    "hospital_phone": "Hospital phone",
    "hospital_email": "Hospital email",
    "age": "Age",
    "patient_age": "Patient age",
    "patient_name": "Patient name",
    "patient_gender": "Patient gender",
    "gender": "Gender",
    "date_of_birth": "Date of birth",
    "medical_id": "Medical ID",
    "address": "Address",
    "referred_by": "Referred by",
    "emergency_contact_name": "Emergency contact name",
    "emergency_contact_phone": "Emergency contact phone",
    "blood_type": "Blood type",
    "allergies": "Allergies",
    "medical_conditions": "Medical conditions",
    "current_medications": "Current medications",
    "notes": "Notes",
    "doctor_id": "Doctor",
    "ref_physician": "Referring physician",
    "indications": "Indications",
    "technique": "Technique",
    "factual_report": "Factual report",
    "impression": "Impression",
    "doctor_info": "Doctor information",
    "role": "Role",
    "file_id": "File ID",
    "patient_id": "Patient ID",
    "condition": "Condition",
    "image_base64": "Screenshot image",
    "comment": "Comment",
    "message": "Message",
    "level": "Log level",
    "report_date": "Report date",
    "user_type": "Account type",
    "interest": "Interest",
    "country": "Country",
    "volume": "Volume",
    "signal_id": "Signal ID",
    "processing_type": "Processing type",
}


def _friendly_msg(error: dict) -> str:
    """Convert a raw Pydantic error to a human-readable message."""
    loc = error.get("loc", [])
    field = loc[-1] if loc else "unknown"
    label = _FIELD_LABELS.get(str(field), str(field).replace("_", " ").title())
    msg = error.get("msg", "Invalid value")
    etype = error.get("type", "")

    # Map raw Pydantic error codes to user-friendly messages
    type_messages = {
        "missing": f"{label} is required.",
        "string_too_short": f"{label} is too short (minimum {error.get('ctx', {}).get('min_length', '?')} characters).",
        "string_too_long": f"{label} is too long (maximum {error.get('ctx', {}).get('max_length', '?')} characters).",
        "string_pattern_mismatch": f"Please enter a valid {label.lower()}.",
        "number.not_ge": f"{label} must be at least {error.get('ctx', {}).get('ge', '?')}.",
        "number.not_le": f"{label} must be at most {error.get('ctx', {}).get('le', '?')}.",
        "number.not_gt": f"{label} must be greater than {error.get('ctx', {}).get('gt', '?')}.",
        "number.not_lt": f"{label} must be less than {error.get('ctx', {}).get('lt', '?')}.",
        "type_error.integer": f"{label} must be a whole number.",
        "type_error.float": f"{label} must be a number.",
        "type_error.str": f"{label} must be text.",
        "type_error.bool": f"{label} must be true or false.",
        "value_error.str": f"Please enter a valid value for {label.lower()}.",
        "value_error.number": f"Please enter a valid number for {label.lower()}.",
        "value_error.datetime": f"Please enter a valid date for {label.lower()}.",
    }

    if etype == "value_error":
        if "email" in str(field).lower() or "not a valid email" in str(msg).lower():
            return "Please enter a valid email address."

    return type_messages.get(etype, msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for FastAPI. 
    Code before 'yield' runs on startup. Code after runs on shutdown.
    """
    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError as e:
        if "already exists" not in str(e).lower():
            raise
    yield


def create_application() -> FastAPI:
    """Create and configure the FastAPI application"""

    # Checked here rather than in config.py: the Celery worker and migrate.py import
    # settings too, and neither signs anything.
    if settings.SECRET_KEY in PLACEHOLDER_SECRET_KEYS:
        raise RuntimeError(
            "SECRET_KEY is unset or still a placeholder, so anyone could forge a login "
            "token. Run ./scripts/setup.sh, or set SECRET_KEY in backend/.env "
            "(e.g. `openssl rand -hex 32`)."
        )

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="CereSignal - Brain Signal Processing API",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
        lifespan=lifespan,
    )

    # --- Custom RequestValidationError handler ---
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        errors = exc.errors()
        field_errors = []
        detail_parts = []

        for err in errors:
            loc = err.get("loc", [])
            field = loc[-1] if loc else "unknown"
            friendly = _friendly_msg(err)
            field_errors.append({"field": str(field), "message": friendly})
            detail_parts.append(friendly)

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=jsonable_encoder({
                "detail": " ".join(detail_parts) if detail_parts else "Validation failed. Please check your input.",
                "errors": field_errors,
            }),
        )

    setup_middleware(app)
    app.include_router(api_router, prefix=settings.API_V1_STR)

    # In local mode (no Supabase configured) assets live on disk and must be served
    # by this app — that is what LocalStorageService.signed_url() points at. Only the
    # assets bucket, and only with a valid signature: this used to be a StaticFiles
    # mount over all of local_storage, which served every EDF and report PDF to
    # anyone who could guess a path.
    if not settings.SUPABASE_URL:
        from app.services import storage_service as storage_module

        @app.get(
            f"{storage_module.LOCAL_STORAGE_URL_PREFIX}/{storage_module.ASSETS_BUCKET}"
            "/{object_path:path}",
            include_in_schema=False,
        )
        async def local_asset(object_path: str, expires: int = 0, signature: str = ""):
            bucket = storage_module.ASSETS_BUCKET
            if not storage_module.LocalStorageService.verify_signature(
                bucket, object_path, expires, signature
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid or expired link",
                )
            try:
                path = storage_module.storage_service._path(bucket, object_path)
            except ValueError:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
            if not os.path.isfile(path):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
            return FileResponse(path)

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