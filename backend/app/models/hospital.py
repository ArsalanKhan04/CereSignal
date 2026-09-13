"""
Hospital and staff invitation models
"""

from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Hospital(Base):
    __tablename__ = "hospitals"

    id: int = Column(Integer, primary_key=True, index=True)
    name: str = Column(String(255), nullable=False)
    code: str = Column(String(50), unique=True, nullable=False, index=True)
    address: Optional[str] = Column(Text, nullable=True)
    phone: Optional[str] = Column(String(50), nullable=True)
    email: Optional[str] = Column(String(255), nullable=True)
    is_active: bool = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    staff = relationship("AuthUser", back_populates="hospital", foreign_keys="AuthUser.hospital_id")
    invitations = relationship("StaffInvitation", back_populates="hospital")


class StaffInvitation(Base):
    __tablename__ = "staff_invitations"

    id: int = Column(Integer, primary_key=True, index=True)
    hospital_id: int = Column(Integer, ForeignKey("hospitals.id"), nullable=False)
    invited_email: str = Column(String(255), nullable=False)
    role: str = Column(String(20), nullable=False)  # "doctor" | "technician"
    token: str = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_by: int = Column(Integer, ForeignKey("auth_users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", back_populates="invitations")
    creator = relationship("AuthUser", foreign_keys=[created_by])
