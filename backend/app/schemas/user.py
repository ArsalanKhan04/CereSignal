"""
Pydantic schemas for user management
"""

from pydantic import BaseModel, Field
from app.schemas.email_types import LenientEmailStr
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """Base schema for user"""

    name: str = Field(..., min_length=1, max_length=255, description="User's full name")
    email: Optional[LenientEmailStr] = None
    phone: Optional[str] = Field(
        None,
        max_length=50,
        pattern=r"^\+?[\d\s\-\(\)\.]{7,20}$",
        description="Phone number in international format",
    )
    date_of_birth: Optional[datetime] = None
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, pattern="^(M|F|Other)$")
    medical_id: Optional[str] = Field(None, max_length=100)
    # Additional patient information
    address: Optional[str] = None
    referred_by: Optional[str] = Field(None, max_length=255)
    emergency_contact_name: Optional[str] = Field(None, max_length=255)

    emergency_contact_phone: Optional[str] = Field(
        None,
        max_length=50,
        pattern=r"^\+?[\d\s\-\(\)\.]{7,20}$",
        description="Emergency contact phone number",
    )
    blood_type: Optional[str] = Field(
        None, pattern="^(A\\+|A-|B\\+|B-|AB\\+|AB-|O\\+|O-)$"
    )
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    notes: Optional[str] = None
    doctor_id: Optional[int] = None


class UserCreate(UserBase):
    """Schema for creating a user"""

    doctor_id: Optional[int] = Field(
        None, description="Doctor ID to assign patient to (for technicians)"
    )


class UserUpdate(BaseModel):
    """Schema for updating a user"""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[LenientEmailStr] = None
    phone: Optional[str] = Field(
        None,
        max_length=50,
        pattern=r"^\+?[\d\s\-\(\)\.]{7,20}$",
        description="Phone number in international format",
    )
    date_of_birth: Optional[datetime] = None
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, pattern="^(M|F|Other)$")
    medical_id: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = None
    referred_by: Optional[str] = Field(None, max_length=255)
    emergency_contact_name: Optional[str] = Field(None, max_length=255)
    emergency_contact_phone: Optional[str] = Field(
        None,
        max_length=50,
        pattern=r"^\+?[\d\s\-\(\)\.]{7,20}$",
        description="Emergency contact phone number",
    )
    blood_type: Optional[str] = Field(
        None, pattern="^(A\\+|A-|B\\+|B-|AB\\+|AB-|O\\+|O-)$"
    )
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    doctor_id: Optional[int] = None


class UserResponse(UserBase):
    """Schema for user response"""

    id: int
    age: Optional[int] = None
    referred_by: Optional[str] = None
    auth_user_id: Optional[int] = None
    profile_picture: Optional[str] = None
    is_active: bool
    report_sent: bool = False
    portal_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    doctor_name: Optional[str] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Schema for user list response"""

    id: int
    name: str
    email: Optional[str] = None
    medical_id: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    referred_by: Optional[str] = None
    auth_user_id: Optional[int] = None
    is_active: bool
    report_sent: bool = False
    portal_sent_at: Optional[datetime] = None
    created_at: datetime
    doctor_name: Optional[str] = None

    class Config:
        from_attributes = True
