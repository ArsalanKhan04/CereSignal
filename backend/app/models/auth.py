"""
Authentication models
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from typing import Optional
import enum
from app.core.database import Base


class UserType(str, enum.Enum):
    """User type enumeration"""
    DOCTOR = "doctor"
    TECHNICIAN = "technician"
    PATIENT = "patient"


class AuthUser(Base):
    """Model for authentication users (doctors, technicians, patients)"""
    
    __tablename__ = "auth_users"
    
    id: int = Column(Integer, primary_key=True, index=True)
    username: str = Column(String(50), unique=True, nullable=False, index=True)
    email: str = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password: str = Column(String(255), nullable=False)
    user_type: str = Column(String(20), nullable=False, default=UserType.DOCTOR.value, index=True)
    # Professional information (for doctors and technicians)
    first_name: Optional[str] = Column(String(100), nullable=True)
    last_name: Optional[str] = Column(String(100), nullable=True)
    title: Optional[str] = Column(String(50), nullable=True)  # Dr., Prof., etc.
    specialization: Optional[str] = Column(String(100), nullable=True)  # Neurology, Cardiology, etc.
    license_number: Optional[str] = Column(String(100), nullable=True, unique=True)
    phone: Optional[str] = Column(String(50), nullable=True)
    about: Optional[str] = Column(Text, nullable=True)  # Professional bio
    hospital_affiliation: Optional[str] = Column(String(255), nullable=True)
    years_experience: Optional[int] = Column(Integer, nullable=True)
    profile_picture: Optional[str] = Column(String(500), nullable=True)
    # System fields
    is_active: bool = Column(Boolean, default=True)
    is_superuser: bool = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationship to patient users (one auth user can manage multiple patients - for doctors/technicians)
    patient_users = relationship("User", back_populates="auth_user", foreign_keys="User.auth_user_id")
    # Relationship for patients who can log in (one-to-one)
    patient_user = relationship("User", back_populates="auth_user_patient", uselist=False, foreign_keys="User.patient_auth_user_id")


class UserSession(Base):
    """Model for tracking user sessions"""
    
    __tablename__ = "user_sessions"
    
    id: int = Column(Integer, primary_key=True, index=True)
    auth_user_id: int = Column(Integer, ForeignKey("auth_users.id"), nullable=False)
    token_jti: str = Column(String(255), unique=True, nullable=False, index=True)  # JWT ID
    is_active: bool = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    auth_user = relationship("AuthUser")