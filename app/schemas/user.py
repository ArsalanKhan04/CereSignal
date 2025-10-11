"""
Pydantic schemas for user management
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """Base schema for user"""
    name: str = Field(..., min_length=1, max_length=255, description="User's full name")
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = Field(None, pattern="^(M|F|Other)$")
    medical_id: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class UserCreate(UserBase):
    """Schema for creating a user"""
    pass


class UserUpdate(BaseModel):
    """Schema for updating a user"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = Field(None, pattern="^(M|F|Other)$")
    medical_id: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    """Schema for user response"""
    id: int
    profile_picture: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Schema for user list response"""
    id: int
    name: str
    email: Optional[str] = None
    medical_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True