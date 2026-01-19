"""
Notification model
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Notification(Base):
    """Model for user notifications"""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    auth_user_id = Column(
        Integer, ForeignKey("auth_users.id"), nullable=False, index=True
    )
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    message = Column(String(500), nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)

    auth_user = relationship("AuthUser")
    patient = relationship("User")
