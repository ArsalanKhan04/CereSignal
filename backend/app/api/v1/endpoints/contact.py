"""
Contact form endpoints
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.contact import ContactSubmission
from app.schemas.contact import ContactSubmissionCreate, ContactSubmissionResponse

router = APIRouter()


@router.post("/", response_model=ContactSubmissionResponse, status_code=201)
async def submit_contact(
    submission: ContactSubmissionCreate,
    db: Session = Depends(get_db),
):
    """Submit a contact form — no auth required"""
    contact = ContactSubmission(
        first_name=submission.first_name,
        last_name=submission.last_name,
        email=submission.email,
        hospital=submission.hospital,
        role=submission.role,
        country=submission.country,
        volume=submission.volume,
        interest=submission.interest,
        message=submission.message,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact
