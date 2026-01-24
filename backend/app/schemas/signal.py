"""
Pydantic schemas for signal processing
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class SignalFileBase(BaseModel):
    """Base schema for signal file"""

    filename: str
    file_type: str
    file_size: int
    user_id: int


class SignalFileCreate(SignalFileBase):
    """Schema for creating signal file"""

    pass


class SignalFileResponse(SignalFileBase):
    """Schema for signal file response"""

    id: int
    original_filename: str
    file_path: str
    upload_time: datetime
    processed: bool
    processing_status: str
    condition: str
    task_id: Optional[str] = None
    report_task_id: Optional[str] = None
    factual_report: Optional[str] = None
    impression: Optional[str] = None
    user_name: Optional[str] = None  # Will be populated from relationship

    class Config:
        from_attributes = True


class SignalBase(BaseModel):
    """Base schema for signal"""

    channel_name: str
    sampling_rate: float
    duration: float
    data_points: int


class SignalCreate(SignalBase):
    """Schema for creating signal"""

    file_id: int
    signal_data: Optional[str] = None


class SignalResponse(SignalBase):
    """Schema for signal response - simplified to only essential fields"""

    id: int
    file_id: int

    class Config:
        from_attributes = True


class EEGBookmarkBase(BaseModel):
    """Base schema for EEG bookmark"""

    comment: Optional[str] = None


class EEGBookmarkCreate(EEGBookmarkBase):
    """Schema for creating EEG bookmark"""

    image_base64: str = Field(..., description="Base64 encoded PNG image")
    replace_id: Optional[int] = None


class EEGBookmarkResponse(EEGBookmarkBase):
    """Schema for EEG bookmark response"""

    id: int
    file_id: int
    image_url: str
    created_at: datetime
    created_by: Optional[int] = None

    class Config:
        from_attributes = True


class ProcessingResultBase(BaseModel):
    """Base schema for processing result"""

    processing_type: str
    parameters: Optional[Dict[str, Any]] = None
    result_data: Optional[Dict[str, Any]] = None


class ProcessingResultCreate(ProcessingResultBase):
    """Schema for creating processing result"""

    file_id: int
    signal_id: Optional[int] = None


class ProcessingResultResponse(ProcessingResultBase):
    """Schema for processing result response"""

    id: int
    file_id: int
    signal_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class FileUploadResponse(BaseModel):
    """Schema for file upload response"""

    message: str
    file_id: int
    filename: str
    file_size: int
    processing_status: str


class ProcessingRequest(BaseModel):
    """Schema for processing request"""

    file_id: int
    signal_id: Optional[int] = None
    processing_type: str
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)
