"""
Signal processing models
"""

from sqlalchemy import Column, Integer, String, DateTime, Float, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from typing import Optional
from app.core.database import Base


class SignalFile(Base):
    """Model for uploaded signal files"""
    
    __tablename__ = "signal_files"
    
    id: int = Column(Integer, primary_key=True, index=True)
    user_id: int = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename: str = Column(String(255), nullable=False)
    original_filename: str = Column(String(255), nullable=False)
    file_path: str = Column(String(500), nullable=False)
    file_size: int = Column(Integer, nullable=False)
    file_type: str = Column(String(50), nullable=False)
    upload_time = Column(DateTime(timezone=True), server_default=func.now())
    processed: bool = Column(Boolean, default=False)
    processing_status: str = Column(String(50), default="pending")  # pending, processing, completed, failed
    
    # Relationships
    user = relationship("User", back_populates="signal_files")
    signals = relationship("Signal", back_populates="file", cascade="all, delete-orphan")
    processing_results = relationship("ProcessingResult", back_populates="file", cascade="all, delete-orphan")


class Signal(Base):
    """Model for individual signal data"""
    
    __tablename__ = "signals"
    
    id: int = Column(Integer, primary_key=True, index=True)
    file_id: int = Column(Integer, ForeignKey("signal_files.id"), nullable=False)
    channel_name: str = Column(String(100), nullable=False)
    sampling_rate: float = Column(Float, nullable=False)
    duration: float = Column(Float, nullable=False)
    data_points: int = Column(Integer, nullable=False)
    signal_data: Optional[str] = Column(Text)  # JSON string of signal data
    physical_max: Optional[float] = Column(Float, nullable=True)
    physical_min: Optional[float] = Column(Float, nullable=True)
    digital_max: Optional[int] = Column(Integer, nullable=True)
    digital_min: Optional[int] = Column(Integer, nullable=True)
    units: Optional[str] = Column(String(50), nullable=True)
    prefilter: Optional[str] = Column(String(200), nullable=True)
    transducer: Optional[str] = Column(String(200), nullable=True)
    
    # Relationships
    file = relationship("SignalFile", back_populates="signals")
    processing_results = relationship("ProcessingResult", back_populates="signal", cascade="all, delete-orphan")


class ProcessingResult(Base):
    """Model for signal processing results"""
    
    __tablename__ = "processing_results"
    
    id: int = Column(Integer, primary_key=True, index=True)
    file_id: int = Column(Integer, ForeignKey("signal_files.id"), nullable=False)
    signal_id: Optional[int] = Column(Integer, ForeignKey("signals.id"), nullable=True)
    processing_type: str = Column(String(100), nullable=False)  # fft, filter, feature_extraction, etc.
    parameters: Optional[str] = Column(Text)  # JSON string of processing parameters
    result_data: Optional[str] = Column(Text)  # JSON string of results
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    file = relationship("SignalFile", back_populates="processing_results")
    signal = relationship("Signal", back_populates="processing_results")
