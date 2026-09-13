"""
Pydantic schemas for EEG reports
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.field_types import BlankAsNone, BodyResourceId


class EEGReportBase(BaseModel):
    """Base schema for EEG report"""
    patient_name: str = Field(..., min_length=1, max_length=255)
    patient_age: Optional[int] = Field(None, ge=0, le=150)
    patient_gender: BlankAsNone = Field(None, pattern="^(M|F|Other)$")
    ref_physician: Optional[str] = Field(None, max_length=255)
    indications: Optional[str] = None
    technique: Optional[str] = None
    factual_report: Optional[str] = None
    impression: Optional[str] = None
    doctor_info: Optional[str] = None


class EEGReportCreate(EEGReportBase):
    """Schema for creating an EEG report"""
    file_id: BodyResourceId = Field(..., description="ID of the signal file")


class EEGReportUpdate(BaseModel):
    """Schema for updating an EEG report"""
    patient_name: Optional[str] = Field(None, min_length=1, max_length=255)
    patient_age: Optional[int] = Field(None, ge=0, le=150)
    patient_gender: BlankAsNone = Field(None, pattern="^(M|F|Other)$")
    ref_physician: Optional[str] = Field(None, max_length=255)
    indications: Optional[str] = None
    technique: Optional[str] = None
    factual_report: Optional[str] = None
    impression: Optional[str] = None
    doctor_info: Optional[str] = None
    is_finalized: Optional[bool] = None


class EEGReportResponse(EEGReportBase):
    """Schema for EEG report response"""
    id: int
    file_id: int
    auth_user_id: int
    report_date: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_finalized: bool
    pdf_file_path: Optional[str] = None
    # Additional fields for display
    file_name: Optional[str] = None
    doctor_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class EEGReportVersionResponse(BaseModel):
    """Schema for a versioned snapshot of an EEG report"""
    id: int
    report_id: int
    version_number: int
    saved_by_auth_user_id: int
    saved_at: datetime
    saved_by_name: Optional[str] = None
    patient_name: str
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    ref_physician: Optional[str] = None
    indications: Optional[str] = None
    technique: Optional[str] = None
    factual_report: Optional[str] = None
    impression: Optional[str] = None
    doctor_info: Optional[str] = None
    is_finalized: bool

    class Config:
        from_attributes = True


class EEGReportListResponse(EEGReportBase):
    """Schema for EEG report list response"""
    id: int
    file_id: int
    report_date: datetime
    is_finalized: bool
    pdf_file_path: Optional[str] = None
    # Additional fields for display
    file_name: Optional[str] = None
    doctor_name: Optional[str] = None
    
    class Config:
        from_attributes = True