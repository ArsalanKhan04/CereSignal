"""
Contact schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class ContactSubmissionCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    hospital: Optional[str] = Field(None, max_length=255)
    role: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    volume: Optional[str] = Field(None, max_length=50)
    interest: Optional[str] = Field(None, max_length=100)
    message: Optional[str] = Field(None, max_length=5000)


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
