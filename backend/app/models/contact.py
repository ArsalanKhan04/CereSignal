"""
Contact Submission model
"""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ContactSubmission(Base):
    """Model for contact form submissions"""

    __tablename__ = "contact_submissions"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    hospital = Column(String(255), nullable=True)
    role = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    volume = Column(String(50), nullable=True)
    interest = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
