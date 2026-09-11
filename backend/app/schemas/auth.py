"""
Authentication schemas
"""

from pydantic import BaseModel, Field
from app.schemas.email_types import LenientEmailStr
from typing import Optional
from datetime import datetime
from app.models.auth import UserType


class UserLogin(BaseModel):
    """Schema for user login"""

    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)


class UserRegister(BaseModel):
    """Schema for user registration"""

    username: str = Field(..., min_length=3, max_length=50)
    email: LenientEmailStr
    password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)
    user_type: UserType = Field(default=UserType.DOCTOR)
    # Professional information (for doctors and technicians)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    title: Optional[str] = Field(None, max_length=50)
    specialization: Optional[str] = Field(None, max_length=100)
    license_number: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(
        None,
        max_length=50,
        pattern=r"^\+?[\d\s\-\(\)\.]{7,20}$",
        description="Phone number in international format (7-20 digits, + allowed)",
    )
    about: Optional[str] = None
    hospital_affiliation: Optional[str] = Field(None, max_length=255)
    years_experience: Optional[int] = Field(None, ge=0, le=100)


class PatientRegister(BaseModel):
    """Schema for patient registration (creates both AuthUser and User)"""

    username: str = Field(..., min_length=3, max_length=50)
    email: LenientEmailStr
    password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)
    # Patient information
    name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(
        None,
        max_length=50,
        pattern=r"^\+?[\d\s\-\(\)\.]{7,20}$",
        description="Phone number in international format (7-20 digits, + allowed)",
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


class Token(BaseModel):
    """Schema for JWT token response"""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    """Schema for token data"""

    username: Optional[str] = None
    user_id: Optional[int] = None


class AuthUserResponse(BaseModel):
    """Schema for authenticated user response"""

    id: int
    username: str
    email: str
    user_type: UserType
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None
    about: Optional[str] = None
    hospital_affiliation: Optional[str] = None
    years_experience: Optional[int] = None
    profile_picture: Optional[str] = None
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class PasswordChange(BaseModel):
    """Schema for password change"""

    current_password: str
    new_password: str = Field(
        ...,
        min_length=8,
        description="New password (at least 8 characters)",
    )
    confirm_new_password: str = Field(..., min_length=8)
