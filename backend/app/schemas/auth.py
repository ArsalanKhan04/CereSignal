"""
Authentication schemas
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime


class UserLogin(BaseModel):
    """Schema for user login"""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)


class UserRegister(BaseModel):
    """Schema for user registration"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)
    # Professional information
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    title: Optional[str] = Field(None, max_length=50)
    specialization: Optional[str] = Field(None, max_length=100)
    license_number: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    about: Optional[str] = None
    hospital_affiliation: Optional[str] = Field(None, max_length=255)
    years_experience: Optional[int] = Field(None, ge=0, le=100)


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
    first_name: str
    last_name: str
    title: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None
    about: Optional[str] = None
    hospital_affiliation: Optional[str] = None
    years_experience: Optional[int] = None
    profile_picture: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PasswordChange(BaseModel):
    """Schema for password change"""
    current_password: str
    new_password: str = Field(..., min_length=6)
    confirm_new_password: str = Field(..., min_length=6)