"""
Dev Admin Pydantic schemas — cross-hospital superuser views
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class DevAdminStaffMember(BaseModel):
    id: int
    username: str
    email: str
    user_type: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    title: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DevAdminEEGFile(BaseModel):
    id: int
    original_filename: str
    file_size: int
    processing_status: str
    condition: str
    upload_time: datetime
    patient_name: Optional[str] = None

    class Config:
        from_attributes = True


class DevAdminReport(BaseModel):
    id: int
    patient_name: str
    doctor_name: Optional[str] = None
    is_finalized: bool
    has_pdf: bool
    created_at: datetime
    file_id: int

    class Config:
        from_attributes = True


class DevAdminHospitalSummary(BaseModel):
    id: int
    name: str
    code: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool
    created_at: datetime
    total_doctors: int
    total_technicians: int
    total_patients: int
    total_files: int
    pending_reports: int
    completed_reports: int

    class Config:
        from_attributes = True


class DevAdminHospitalDetail(DevAdminHospitalSummary):
    staff: List[DevAdminStaffMember] = []
    files: List[DevAdminEEGFile] = []
    reports: List[DevAdminReport] = []


class DevAdminGlobalStats(BaseModel):
    total_hospitals: int
    active_hospitals: int
    total_doctors: int
    total_technicians: int
    total_patients: int
    total_eeg_files: int
    total_reports: int
    pending_reports: int
    completed_reports: int
    unread_contacts: int
    hospitals_breakdown: List[DevAdminHospitalSummary] = []


class DevAdminContact(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    hospital: Optional[str] = None
    role: Optional[str] = None
    country: Optional[str] = None
    volume: Optional[str] = None
    interest: Optional[str] = None
    message: Optional[str] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DevAdminContactListResponse(BaseModel):
    items: List[DevAdminContact]
    total: int
    unread_count: int
