"""
Authentication models
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from typing import Optional
from app.core.database import Base


class AuthUser(Base):
    """Model for authentication users (separate from patient users)"""
    
    __tablename__ = "auth_users"
    
    id: int = Column(Integer, primary_key=True, index=True)
    username: str = Column(String(50), unique=True, nullable=False, index=True)
    email: str = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password: str = Column(String(255), nullable=False)
    is_active: bool = Column(Boolean, default=True)
    is_superuser: bool = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationship to patient users (one auth user can manage multiple patients)
    patient_users = relationship("User", back_populates="auth_user")


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