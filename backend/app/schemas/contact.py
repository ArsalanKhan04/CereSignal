"""
Contact schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class ContactSubmissionCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    hospital: Optional[str] = None
    role: Optional[str] = None
    country: Optional[str] = None
    volume: Optional[str] = None
    interest: Optional[str] = None
    message: Optional[str] = None


class ContactSubmissionResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    hospital: Optional[str] = None
    role: Optional[str] = None
    country: Optional[str] = None
    volume: Optional[str] = None
    interest: Optional[str] = None
    message: Optional[str] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
