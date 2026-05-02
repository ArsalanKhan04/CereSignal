"""
Admin and hospital schemas
"""

from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime


class HospitalAdminRegister(BaseModel):
    """Combined hospital + admin account creation (public signup)"""
    # Hospital details
    hospital_name: str = Field(..., min_length=2, max_length=255)
    hospital_address: Optional[str] = None
    hospital_phone: Optional[str] = Field(None, max_length=50)
    hospital_email: Optional[EmailStr] = None

    @field_validator("hospital_address", "hospital_phone", "hospital_email", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v
    # Admin account
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)


class InviteCreate(BaseModel):
    """Admin sends invitation to a staff member"""
    email: EmailStr
    role: str = Field(..., pattern="^(doctor|technician)$")


class InviteResponse(BaseModel):
    """Returned immediately after creating an invitation (includes token for fallback sharing)"""
    id: int
    hospital_id: int
    invited_email: str
    role: str
    token: str
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InviteListResponse(BaseModel):
    """Safe invite representation for list endpoints — token omitted"""
    id: int
    hospital_id: int
    invited_email: str
    role: str
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InviteTokenValidation(BaseModel):
    """Returned when frontend validates an invite token before showing the form"""
    email: str
    role: str
    hospital_name: str
    hospital_id: int


class StaffInviteRegister(BaseModel):
    """Staff fills this form after clicking an invite link"""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)
    title: Optional[str] = Field(None, max_length=50)
    specialization: Optional[str] = Field(None, max_length=100)
    license_number: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    about: Optional[str] = None
    years_experience: Optional[int] = Field(None, ge=0, le=100)


class AdminStatsResponse(BaseModel):
    """Hospital-scoped statistics for admin dashboard"""
    total_patients: int
    total_doctors: int
    total_technicians: int
    pending_reports: int
    completed_reports: int
    pending_invitations: int


class StaffMemberResponse(BaseModel):
    """Safe staff user summary (no password hash)"""
    id: int
    username: str
    email: str
    user_type: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    specialization: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True
