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
    hospital_id: Optional[int] = Column(Integer, ForeignKey("hospitals.id"), nullable=True, index=True)
    
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
    impression: Optional[str] = Column(Text, nullable=True)  # AI-generated impression text
    doctor_info: Optional[str] = Column(Text, nullable=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_finalized: bool = Column(Boolean, default=False)
    pdf_file_path: Optional[str] = Column(String(500), nullable=True)  # Path to generated PDF
    
    # Relationships
    signal_file = relationship("SignalFile", back_populates="reports")
    auth_user = relationship("AuthUser")
    versions = relationship(
        "EEGReportVersion",
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="EEGReportVersion.version_number",
    )


class EEGReportVersion(Base):
    """Snapshot of an EEGReport at a point in time, for version history/rollback"""

    __tablename__ = "eeg_report_versions"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer, ForeignKey("eeg_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number = Column(Integer, nullable=False)
    saved_by_auth_user_id = Column(Integer, ForeignKey("auth_users.id"), nullable=False)
    saved_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Snapshot of all editable fields from EEGReport
    patient_name = Column(String(255), nullable=False)
    patient_age = Column(Integer, nullable=True)
    patient_gender = Column(String(10), nullable=True)
    ref_physician = Column(String(255), nullable=True)
    indications = Column(Text, nullable=True)
    technique = Column(Text, nullable=True)
    factual_report = Column(Text, nullable=True)
    impression = Column(Text, nullable=True)
    doctor_info = Column(Text, nullable=True)
    is_finalized = Column(Boolean, default=False)

    # Relationships
    report = relationship("EEGReport", back_populates="versions")
    saved_by = relationship("AuthUser")