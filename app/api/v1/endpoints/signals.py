"""
Signal management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import json
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_active_user
from app.models.signal import SignalFile, Signal
from app.models.user import User
from app.models.auth import AuthUser
from app.schemas.signal import (
    SignalFileResponse, 
    SignalResponse, 
    FileUploadResponse,
    ProcessingRequest
)
from app.core.config import settings
from app.utils.file_processing import save_uploaded_file, process_signal_file

router = APIRouter()


@router.post("/upload", response_model=FileUploadResponse)
async def upload_signal_file(
    file: UploadFile = File(...),
    patient_id: int = None,  # Optional: specify which patient this file belongs to
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload a signal file for processing"""
    
    # Validate file type
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file uploaded"
        )
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in settings.ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file_extension} not allowed. Allowed types: {settings.ALLOWED_FILE_TYPES}"
        )
    
    # Validate file size
    if file.size is not None and file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {settings.MAX_FILE_SIZE} bytes"
        )
    
    try:
        # Generate unique filename
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{file_extension}"
        
        # Save file
        file_path = await save_uploaded_file(file, filename)
        
        # Create database record
        db_file = SignalFile(
            user_id=user.id,
            filename=filename,
            original_filename=file.filename,
            file_path=file_path,
            file_size=file.size,
            file_type=file_extension
        )
        
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        
        # Process the signal file and extract data
        try:
            file_info = process_signal_file(file_path)
            
            # Create signal records for each channel
            for signal_info in file_info.get("signals", []):
                # Read actual signal data (for EDF files)
                signal_data = None
                if file_extension == ".edf":
                    try:
                        import pyedflib
                        with pyedflib.EdfReader(file_path) as f:
                            channel_index = next(
                                (i for i, label in enumerate([f.getLabel(i) for i in range(f.getNSignals())]) 
                                 if label == signal_info["channel_name"]), 
                                None
                            )
                            if channel_index is not None:
                                signal_data = f.readSignal(channel_index).tolist()
                                signal_data = json.dumps(signal_data)
                    except Exception as e:
                        print(f"Warning: Could not read signal data for {signal_info['channel_name']}: {e}")
                
                # Create signal record
                signal_record = Signal(
                    file_id=db_file.id,
                    channel_name=signal_info["channel_name"],
                    sampling_rate=signal_info["sampling_rate"],
                    duration=signal_info.get("samples", 0) / signal_info["sampling_rate"],
                    data_points=signal_info.get("samples", 0),
                    signal_data=signal_data,
                    physical_max=signal_info.get("physical_max"),
                    physical_min=signal_info.get("physical_min"),
                    digital_max=signal_info.get("digital_max"),
                    digital_min=signal_info.get("digital_min"),
                    units=signal_info.get("units"),
                    prefilter=signal_info.get("prefilter"),
                    transducer=signal_info.get("transducer")
                )
                
                db.add(signal_record)
            
            db.commit()
            
            # Mark file as processed
            db_file.processed = True
            db_file.processing_status = "completed"
            db.commit()
            
        except Exception as e:
            # Mark as failed but don't rollback the file record
            db_file.processing_status = "failed"
            db.commit()
            print(f"Error processing signal file: {e}")
        
        return FileUploadResponse(
            message="File uploaded successfully",
            file_id=db_file.id,
            filename=db_file.original_filename,
            file_size=db_file.file_size,
            processing_status=db_file.processing_status
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading file: {str(e)}"
        )


@router.get("/files", response_model=List[SignalFileResponse])
async def get_signal_files(
    skip: int = 0,
    limit: int = 100,
    patient_id: Optional[int] = None,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get list of uploaded signal files for the authenticated user's patients"""
    
    # Get all patients for the authenticated user
    query = db.query(SignalFile).join(User).filter(User.auth_user_id == current_user.id)
    
    if patient_id:
        # Verify the patient belongs to the authenticated user
        patient = db.query(User).filter(
            User.id == patient_id,
            User.auth_user_id == current_user.id
        ).first()
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found or you don't have access to this patient"
            )
        query = query.filter(SignalFile.user_id == patient_id)
    
    files = query.offset(skip).limit(limit).all()
    
    # Add user name to response
    result = []
    for file in files:
        file_dict = file.__dict__.copy()
        file_dict['user_name'] = file.user.name if file.user else None
        result.append(file_dict)
    
    return result


@router.get("/files/{file_id}", response_model=SignalFileResponse)
async def get_signal_file(
    file_id: int,
    db: Session = Depends(get_db)
):
    """Get specific signal file by ID"""
    
    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal file not found"
        )
    
    return file


@router.get("/files/{file_id}/signals", response_model=List[SignalResponse])
async def get_file_signals(
    file_id: int,
    db: Session = Depends(get_db)
):
    """Get all signals from a specific file"""
    
    # Check if file exists
    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal file not found"
        )
    
    signals = db.query(Signal).filter(Signal.file_id == file_id).all()
    return signals


@router.delete("/files/{file_id}")
async def delete_signal_file(
    file_id: int,
    db: Session = Depends(get_db)
):
    """Delete a signal file and its associated data"""
    
    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal file not found"
        )
    
    try:
        # Delete physical file
        if os.path.exists(file.file_path):
            os.remove(file.file_path)
        
        # Delete from database (cascade will handle related records)
        db.delete(file)
        db.commit()
        
        return {"message": "File deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting file: {str(e)}"
        )
