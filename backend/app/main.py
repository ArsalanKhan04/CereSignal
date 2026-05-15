"""
CereSignal FastAPI Application
Main application entry point
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pathlib import Path
from contextlib import asynccontextmanager
import uvicorn
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.api import api_router
from app.core.middleware import setup_middleware
from app.models import user, signal, auth, contact

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