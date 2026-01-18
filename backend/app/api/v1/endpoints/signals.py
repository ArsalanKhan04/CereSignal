"""
Signal management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import json
from datetime import datetime

from sqlalchemy import or_

from app.core.database import get_db
from app.core.auth import get_current_active_user
from app.models.signal import SignalFile, Signal
from app.models.user import User
from app.models.auth import AuthUser, UserType
from app.schemas.signal import (
    SignalFileResponse,
    SignalResponse,
    FileUploadResponse,
    ProcessingRequest,
)
from app.core.config import settings
from app.utils.file_processing import save_uploaded_file, process_signal_file
from app.services.inference_service import inference_service
from app.services.eeg_cache_service import eeg_cache

router = APIRouter()


@router.post("/upload", response_model=FileUploadResponse)
async def upload_signal_file(
    file: UploadFile = File(...),
    patient_id: int = Form(
        None
    ),  # Optional: specify which patient this file belongs to
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upload a signal file for processing"""

    print("patient_id", patient_id)
    # Validate file type
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No file uploaded"
        )
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in settings.ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file_extension} not allowed. Allowed types: {settings.ALLOWED_FILE_TYPES}",
        )

    # Validate file size
    if file.size is not None and file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {settings.MAX_FILE_SIZE} bytes",
        )

    try:
        # Determine which patient this file belongs to
        if patient_id:
            # For technicians: allow uploading to any patient (they manage patient creation)
            # For doctors: only allow uploading to their assigned patients
            # For patients: they cannot upload files
            if current_user.user_type == UserType.TECHNICIAN.value:
                # Technicians can upload files for any patient
                user = db.query(User).filter(User.id == patient_id).first()
                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Patient not found",
                    )
            elif current_user.user_type == UserType.DOCTOR.value:
                # Doctors can only upload to their assigned patients
                user = (
                    db.query(User)
                    .filter(User.id == patient_id, User.auth_user_id == current_user.id)
                    .first()
                )
                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Patient not found or you don't have access to this patient",
                    )
            else:
                # Patients cannot upload files
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Patients cannot upload files",
                )
        else:
            # If no patient specified, create a default patient for this auth user
            user = (
                db.query(User)
                .filter(
                    User.auth_user_id == current_user.id,
                    User.name == f"Default Patient for {current_user.username}",
                )
                .first()
            )

            if not user:
                # Create a default patient
                user = User(
                    name=f"Default Patient for {current_user.username}",
                    auth_user_id=current_user.id,
                )
                db.add(user)
                db.commit()
                db.refresh(user)

        # Use original filename (save_uploaded_file will add unique suffix)
        original_filename = file.filename
        if not original_filename:
            # Fallback if no filename provided
            file_id = str(uuid.uuid4())
            original_filename = f"{file_id}{file_extension}"

        # Save file (this will add unique suffix to preserve original name)
        file_path = await save_uploaded_file(file, original_filename)

        # Extract the actual saved filename from the path
        saved_filename = os.path.basename(file_path)

        # Create database record
        db_file = SignalFile(
            user_id=user.id,
            filename=saved_filename,
            original_filename=file.filename,
            file_path=file_path,
            file_size=file.size,
            file_type=file_extension,
        )

        db.add(db_file)
        db.commit()
        db.refresh(db_file)

        # Process the signal file and extract data
        try:
            file_info = process_signal_file(file_path)

            # Create signal records for each channel - only essential fields
            for signal_info in file_info.get("signals", []):
                # Create signal record with only essential data
                signal_record = Signal(
                    file_id=db_file.id,
                    channel_name=signal_info["channel_name"],
                    sampling_rate=float(signal_info["sampling_rate"]),
                    duration=float(signal_info["duration"]),
                    data_points=int(signal_info["samples"]),
                )

                db.add(signal_record)

            db.commit()

            # Mark file as processed
            db_file.processed = True
            db_file.processing_status = "processing"
            db_file.condition = "processing"
            db.commit()

            # Start inference task
            try:
                task_id = inference_service.start_inference(file_path)
                db_file.task_id = task_id
                db.commit()
                print(f"Inference task started for file {db_file.id}: {task_id}")
            except Exception as e:
                print(f"Error starting inference task: {e}")
                # Don't fail the upload if inference fails to start
                db_file.condition = "failed"
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
            processing_status=db_file.processing_status,
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading file: {str(e)}",
        )


@router.get("/files/serve")
async def serve_file(file_path: str):
    """Serve a file directly by path - No authentication required"""

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk"
        )

    filename = os.path.basename(file_path)
    return FileResponse(
        path=file_path, filename=filename, media_type="application/octet-stream"
    )


@router.get("/files", response_model=List[SignalFileResponse])
async def get_signal_files(
    skip: int = 0,
    limit: int = 100,
    patient_id: Optional[int] = None,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get list of uploaded signal files for the authenticated user's patients"""

    # Handle different user types
    if current_user.user_type == UserType.PATIENT.value:
        # Patients can only see files for their own patient record
        patient_user = (
            db.query(User).filter(User.patient_auth_user_id == current_user.id).first()
        )
        if not patient_user:
            return []  # No patient record found
        query = db.query(SignalFile).filter(SignalFile.user_id == patient_user.id)
    elif current_user.user_type == UserType.TECHNICIAN.value:
        # Technicians can see files for all patients they manage (all patients)
        query = db.query(SignalFile)
    else:
        # Doctors can see files for their assigned or unassigned patients
        query = (
            db.query(SignalFile)
            .join(User)
            .filter(
                or_(User.auth_user_id == current_user.id, User.auth_user_id == None)
            )
        )

    if patient_id:
        # Verify access based on user type
        if current_user.user_type == UserType.DOCTOR.value:
            # Verify the patient belongs to the doctor or is unassigned
            patient = (
                db.query(User)
                .filter(
                    User.id == patient_id,
                    or_(
                        User.auth_user_id == current_user.id, User.auth_user_id == None
                    ),
                )
                .first()
            )
            if not patient:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Patient not found or you don't have access to this patient",
                )

            if not patient:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Patient not found or you don't have access to this patient",
                )
        elif current_user.user_type == UserType.PATIENT.value:
            # Patients can only access their own files
            patient_user = (
                db.query(User)
                .filter(User.patient_auth_user_id == current_user.id)
                .first()
            )
            if not patient_user or patient_user.id != patient_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only access your own files",
                )
        # For technicians, no additional check needed - they can see all patients

        query = query.filter(SignalFile.user_id == patient_id)

    files = query.offset(skip).limit(limit).all()

    # Add user name to response
    result = []
    for file in files:
        file_dict = file.__dict__.copy()
        file_dict["user_name"] = file.user.name if file.user else None
        result.append(file_dict)

    return result


@router.get("/files/{file_id}/events")
async def get_file_events(
    file_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get events data for a specific file"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    return {
        "file_id": file_id,
        "filename": file.filename,
        "condition": file.condition,
        "events": file.events or {},
    }


@router.get("/files/{file_id}", response_model=SignalFileResponse)
async def get_signal_file(file_id: int, db: Session = Depends(get_db)):
    """Get specific signal file by ID"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    return file


@router.get("/files/{file_id}/signals", response_model=List[SignalResponse])
async def get_file_signals(file_id: int, db: Session = Depends(get_db)):
    """Get all signals from a specific file"""

    # Check if file exists
    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    signals = db.query(Signal).filter(Signal.file_id == file_id).all()
    return signals


@router.get("/files/{file_id}/signal-data")
async def get_signal_data(
    file_id: int,
    start_time: float = 0.0,
    duration: float = 10.0,
    db: Session = Depends(get_db),
):
    """Get signal data for a specific time range"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    signals = db.query(Signal).filter(Signal.file_id == file_id).all()

    # For now, return basic signal info
    # In a real implementation, you'd load the actual signal data from the file
    signal_data = []
    for signal in signals:
        signal_data.append(
            {
                "channel_name": signal.channel_name,
                "sampling_rate": signal.sampling_rate,
                "duration": signal.duration,
                "data_points": signal.data_points,
                "start_time": start_time,
                "end_time": start_time + duration,
                "samples_per_second": signal.sampling_rate,
                "total_samples": int(signal.sampling_rate * signal.duration),
            }
        )

    return {
        "file_id": file_id,
        "file_info": {
            "filename": file.filename,
            "condition": file.condition,
            "total_duration": max([s.duration for s in signals]) if signals else 0,
        },
        "signals": signal_data,
        "time_range": {
            "start": start_time,
            "end": start_time + duration,
            "duration": duration,
        },
    }


@router.get("/files/{file_id}/plot-data")
async def get_plot_data(
    file_id: int,
    start_time: float = 0.0,
    duration: float = 10.0,
    channels: Optional[str] = None,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return actual signal samples for plotting (JSON with lists). Channels is optional comma-separated names."""
    # Verify file exists and access
    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    # Optionally, could check user permissions here (omitted for brevity)

    # Ensure file is loaded into cache
    try:
        eeg_cache.load_file(file_id, file.file_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load EEG file: {e}",
        )

    # parse channels
    channels_list = None
    if channels:
        channels_list = [c.strip() for c in channels.split(",") if c.strip()]

    try:
        seg = eeg_cache.get_segment(
            file_id, start_time=start_time, duration=duration, channels=channels_list
        )
        return {"file_id": file_id, "filename": file.filename, "plot_data": seg}
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not loaded in cache"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error extracting plot data: {e}",
        )


@router.get("/files/{file_id}/topomap")
async def get_file_topomap(file_id: int, db: Session = Depends(get_db)):
    """Return generated topomap PNG for a file if it exists"""
    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    # Construct expected path (saved by inference task): <basename>_topomap.png where basename is the filename without extension
    base = os.path.splitext(file.filename)[0]
    print("Looking for topomap at base:", base)
    plot_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "..",
        "static",
        "plots",
        f"{base}_topomap.png",
    )
    print(plot_path)
    plot_path = os.path.abspath(plot_path)
    print(plot_path)
    if not os.path.exists(plot_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topomap not found for this file",
        )

    return FileResponse(
        path=plot_path, filename=os.path.basename(plot_path), media_type="image/png"
    )


@router.get("/stats")
async def get_signal_stats(
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get statistics for the dashboard"""

    # Get all files for the authenticated user's patients
    files = (
        db.query(SignalFile)
        .join(User)
        .filter(User.auth_user_id == current_user.id)
        .all()
    )

    if not files:
        return {
            "total_files": 0,
            "total_patients": 0,
            "condition_counts": {
                "normal": 0,
                "abnormal": 0,
                "checking": 0,
                "failed": 0,
            },
            "recent_files": [],
            "file_stats": {
                "average_duration": 0,
                "longest_duration": 0,
                "shortest_duration": 0,
                "average_size": 0,
                "total_size": 0,
            },
        }

    # Count files by condition
    condition_counts = {"normal": 0, "abnormal": 0, "checking": 0, "failed": 0}
    for file in files:
        condition = file.condition or "checking"
        if condition in condition_counts:
            condition_counts[condition] += 1
        else:
            condition_counts["failed"] += 1

    # Get recent files (last 3)
    recent_files = []
    for file in sorted(files, key=lambda x: x.upload_time, reverse=True)[:3]:
        recent_files.append(
            {
                "id": file.id,
                "filename": file.filename,
                "condition": file.condition,
                "uploaded_at": file.upload_time.isoformat()
                if file.upload_time
                else None,
                "patient_name": file.user.name if file.user else "Unknown",
            }
        )

    # Calculate file statistics
    # Get durations from related signals (each file can have multiple signals)
    durations = []
    for file in files:
        for signal in file.signals:
            if signal.duration is not None:
                durations.append(signal.duration)

    # Get file sizes from SignalFile
    file_sizes = [file.file_size for file in files if file.file_size is not None]

    file_stats = {
        "average_duration": sum(durations) / len(durations) if durations else 0,
        "longest_duration": max(durations) if durations else 0,
        "shortest_duration": min(durations) if durations else 0,
        "average_size": sum(file_sizes) / len(file_sizes) if file_sizes else 0,
        "total_size": sum(file_sizes) if file_sizes else 0,
    }

    # Get unique patients count
    unique_patients = len(set(file.user_id for file in files if file.user_id))

    return {
        "total_files": len(files),
        "total_patients": unique_patients,
        "condition_counts": condition_counts,
        "recent_files": recent_files,
        "file_stats": file_stats,
    }


@router.get("/files/{file_id}/inference-status")
async def check_inference_status(file_id: int, db: Session = Depends(get_db)):
    """Check the status of inference for a specific file"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    # If no task ID, inference hasn't started
    if not file.task_id:
        return {
            "file_id": file_id,
            "condition": file.condition,
            "inference_status": "not_started",
            "message": "Inference not started",
        }

    try:
        # Check task status
        task_status = inference_service.get_task_status(file.task_id)

        # If task is completed, update the database
        if task_status["status"] in ["completed", "failed"]:
            if task_status["status"] == "completed":
                result = task_status.get("result", {})
                if result and "result" in result:
                    # Map inference result to condition
                    if result["result"].lower() == "normal":
                        file.condition = "normal"
                    elif result["result"].lower() == "abnormal":
                        file.condition = "abnormal"
                    else:
                        file.condition = "failed"

                    # Store events data if available
                    if "events" in result and result["events"]:
                        file.events = result["events"]
                else:
                    file.condition = "failed"
            else:  # failed
                file.condition = "failed"

            db.commit()

        return {
            "file_id": file_id,
            "condition": file.condition,
            "inference_status": task_status["status"],
            "message": task_status["message"],
            "task_id": file.task_id,
        }

    except Exception as e:
        return {
            "file_id": file_id,
            "condition": file.condition,
            "inference_status": "error",
            "message": f"Error checking inference status: {str(e)}",
            "task_id": file.task_id,
        }


@router.delete("/files/{file_id}")
async def delete_signal_file(file_id: int, db: Session = Depends(get_db)):
    """Delete a signal file and its associated data"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
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
            detail=f"Error deleting file: {str(e)}",
        )


@router.get("/files/{file_id}/download")
async def download_file(file_id: int, db: Session = Depends(get_db)):
    """Download/serve a signal file for viewing - No authentication required"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    if not os.path.exists(file.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk"
        )

    return FileResponse(
        path=file.file_path,
        filename=file.original_filename,
        media_type="application/octet-stream",
    )
