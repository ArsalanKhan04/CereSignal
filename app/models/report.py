"""
Report models for EEG analysis reports
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from typing import Optional
from app.core.database import Base


class EEGReport(Base):
    """Model for EEG analysis reports"""
    
    __tablename__ = "eeg_reports"
    
    id: int = Column(Integer, primary_key=True, index=True)
    file_id: int = Column(Integer, ForeignKey("signal_files.id"), nullable=False)
    auth_user_id: int = Column(Integer, ForeignKey("auth_users.id"), nullable=False)
    
    # Patient Information
    patient_name: str = Column(String(255), nullable=False)
    patient_age: Optional[int] = Column(Integer, nullable=True)
    patient_gender: Optional[str] = Column(String(10), nullable=True)
    
    # Report Information
    report_date: DateTime = Column(DateTime, nullable=False, server_default=func.now())
    ref_physician: Optional[str] = Column(String(255), nullable=True)
    indications: Optional[str] = Column(Text, nullable=True)
    technique: Optional[str] = Column(Text, nullable=True)
    factual_report: Optional[str] = Column(Text, nullable=True)
    impression: str = Column(String(50), nullable=False)  # normal, abnormal
    doctor_info: Optional[str] = Column(Text, nullable=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_finalized: bool = Column(Boolean, default=False)
    pdf_file_path: Optional[str] = Column(String(500), nullable=True)  # Path to generated PDF
    
    # Relationships
    signal_file = relationship("SignalFile", back_populates="reports")
    auth_user = relationship("AuthUser")