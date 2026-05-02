"""
Signal processing models
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Float,
    Text,
    Boolean,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from typing import Optional
from app.core.database import Base


class SignalFile(Base):
    """Model for uploaded signal files"""

    __tablename__ = "signal_files"

    id: int = Column(Integer, primary_key=True, index=True)
    user_id: int = Column(Integer, ForeignKey("users.id"), nullable=False)
    hospital_id: Optional[int] = Column(Integer, ForeignKey("hospitals.id"), nullable=True, index=True)
    filename: str = Column(String(255), nullable=False)
    original_filename: str = Column(String(255), nullable=False)
    file_path: str = Column(String(500), nullable=False)
    file_size: int = Column(Integer, nullable=False)
    file_type: str = Column(String(50), nullable=False)
    upload_time = Column(DateTime(timezone=True), server_default=func.now())
    processed: bool = Column(Boolean, default=False)
    processing_status: str = Column(
        String(50), default="pending"
    )  # pending, processing, completed, failed
    condition: str = Column(
        String(20), default="processing"
    )  # processing, normal, abnormal
    task_id: Optional[str] = Column(
        String(255), nullable=True
    )  # Celery task ID for inference
    report_task_id: Optional[str] = Column(
        String(255), nullable=True
    )  # Celery task ID for report generation
    events: Optional[dict] = Column(
        JSON, nullable=True
    )  # Event data from neurotransformer
    factual_report: Optional[str] = Column(
        Text, nullable=True
    )  # AI-generated factual report
    impression: Optional[str] = Column(Text, nullable=True)  # AI-generated impression

    # Relationships
    user = relationship("User", back_populates="signal_files")
    signals = relationship(
        "Signal", back_populates="file", cascade="all, delete-orphan"
    )
    processing_results = relationship(
        "ProcessingResult", back_populates="file", cascade="all, delete-orphan"
    )
    reports = relationship(
        "EEGReport", back_populates="signal_file", cascade="all, delete-orphan"
    )
    bookmarks = relationship(
        "EEGBookmark", back_populates="file", cascade="all, delete-orphan"
    )


class Signal(Base):
    """Model for individual signal data - simplified to only essential fields"""

    __tablename__ = "signals"

    id: int = Column(Integer, primary_key=True, index=True)
    file_id: int = Column(Integer, ForeignKey("signal_files.id"), nullable=False)
    channel_name: str = Column(String(100), nullable=False)
    sampling_rate: float = Column(Float, nullable=False)
    duration: float = Column(Float, nullable=False)
    data_points: int = Column(Integer, nullable=False)

    # Relationships
    file = relationship("SignalFile", back_populates="signals")
    processing_results = relationship(
        "ProcessingResult", back_populates="signal", cascade="all, delete-orphan"
    )


class EEGBookmark(Base):
    """Model for EEG plot bookmarks"""

    __tablename__ = "eeg_bookmarks"

    id: int = Column(Integer, primary_key=True, index=True)
    file_id: int = Column(Integer, ForeignKey("signal_files.id"), nullable=False)
    image_path: str = Column(String(500), nullable=False)
    comment: Optional[str] = Column(Text, nullable=True)
    created_by: Optional[int] = Column(
        Integer, ForeignKey("auth_users.id"), nullable=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    file = relationship("SignalFile", back_populates="bookmarks")
    creator = relationship("AuthUser")


class ProcessingResult(Base):
    """Model for signal processing results"""

    __tablename__ = "processing_results"

    id: int = Column(Integer, primary_key=True, index=True)
    file_id: int = Column(Integer, ForeignKey("signal_files.id"), nullable=False)
    signal_id: Optional[int] = Column(Integer, ForeignKey("signals.id"), nullable=True)
    processing_type: str = Column(
        String(100), nullable=False
    )  # fft, filter, feature_extraction, etc.
    parameters: Optional[str] = Column(Text)  # JSON string of processing parameters
    result_data: Optional[str] = Column(Text)  # JSON string of results
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    file = relationship("SignalFile", back_populates="processing_results")
    signal = relationship("Signal", back_populates="processing_results")
