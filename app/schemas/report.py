"""
Pydantic schemas for EEG reports
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class EEGReportBase(BaseModel):
    """Base schema for EEG report"""
    patient_name: str = Field(..., min_length=1, max_length=255)
    patient_age: Optional[int] = Field(None, ge=0, le=150)
    patient_gender: Optional[str] = Field(None, pattern="^(M|F|Other)$")
    ref_physician: Optional[str] = Field(None, max_length=255)
    indications: Optional[str] = None
    technique: Optional[str] = None
    factual_report: Optional[str] = None
    impression: str = Field(..., pattern="^(normal|abnormal)$")
    doctor_info: Optional[str] = None


class EEGReportCreate(EEGReportBase):
    """Schema for creating an EEG report"""
    file_id: int = Field(..., description="ID of the signal file")


class EEGReportUpdate(BaseModel):
    """Schema for updating an EEG report"""
    patient_name: Optional[str] = Field(None, min_length=1, max_length=255)
    patient_age: Optional[int] = Field(None, ge=0, le=150)
    patient_gender: Optional[str] = Field(None, pattern="^(M|F|Other)$")
    ref_physician: Optional[str] = Field(None, max_length=255)
    indications: Optional[str] = None
    technique: Optional[str] = None
    factual_report: Optional[str] = None
    impression: Optional[str] = Field(None, pattern="^(normal|abnormal)$")
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
    # Additional fields for display
    file_name: Optional[str] = None
    doctor_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class EEGReportListResponse(BaseModel):
    """Schema for EEG report list response"""
    id: int
    patient_name: str
    file_name: str
    impression: str
    report_date: datetime
    is_finalized: bool
    doctor_name: Optional[str] = None
    
    class Config:
        from_attributes = True