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
    age: Optional[int] = Column(Integer, nullable=True)
    gender: Optional[str] = Column(String(10), nullable=True)  # M, F, Other
    profile_picture: Optional[str] = Column(
        String(500), nullable=True
    )  # Path to profile picture
    medical_id: Optional[str] = Column(String(100), nullable=True, unique=True)
    # Additional patient information
    address: Optional[str] = Column(Text, nullable=True)
    emergency_contact_name: Optional[str] = Column(String(255), nullable=True)
    emergency_contact_phone: Optional[str] = Column(String(50), nullable=True)
    blood_type: Optional[str] = Column(String(10), nullable=True)  # A+, B-, O+, etc.
    allergies: Optional[str] = Column(Text, nullable=True)
    medical_conditions: Optional[str] = Column(Text, nullable=True)
    current_medications: Optional[str] = Column(Text, nullable=True)
    notes: Optional[str] = Column(Text, nullable=True)  # Medical notes
    is_active: bool = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    auth_user_id: Optional[int] = Column(
        Integer, ForeignKey("auth_users.id"), nullable=True
    )  # Doctor/technician managing this patient
    patient_auth_user_id: Optional[int] = Column(
        Integer, ForeignKey("auth_users.id"), nullable=True, unique=True
    )  # Patient's own auth account

    # Relationships
    auth_user = relationship(
        "AuthUser", back_populates="patient_users", foreign_keys=[auth_user_id]
    )
    auth_user_patient = relationship(
        "AuthUser", back_populates="patient_user", foreign_keys=[patient_auth_user_id]
    )
    signal_files = relationship("SignalFile", back_populates="user")

    @property
    def full_name(self) -> str:
        """Get full name for display"""
        return self.name
