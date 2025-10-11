"""
User models
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from typing import Optional
from app.core.database import Base


class User(Base):
    """Model for users/patients"""
    
    __tablename__ = "users"
    
    id: int = Column(Integer, primary_key=True, index=True)
    name: str = Column(String(255), nullable=False)  # Required field
    email: Optional[str] = Column(String(255), nullable=True, unique=True)
    phone: Optional[str] = Column(String(50), nullable=True)
    date_of_birth: Optional[DateTime] = Column(DateTime, nullable=True)
    gender: Optional[str] = Column(String(10), nullable=True)  # M, F, Other
    profile_picture: Optional[str] = Column(String(500), nullable=True)  # Path to profile picture
    medical_id: Optional[str] = Column(String(100), nullable=True, unique=True)
    notes: Optional[str] = Column(Text, nullable=True)  # Medical notes
    is_active: bool = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    auth_user_id: Optional[int] = Column(Integer, ForeignKey("auth_users.id"), nullable=True)
    
    # Relationships
    auth_user = relationship("AuthUser", back_populates="patient_users")
    signal_files = relationship("SignalFile", back_populates="user")