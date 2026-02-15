"""
Signal management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import json
import uuid
from datetime import datetime
import base64
import pathlib

from sqlalchemy import or_

from app.core.database import get_db
from app.core.auth import get_current_active_user
from app.models.signal import SignalFile, Signal, EEGBookmark
from app.models.user import User
from app.models.auth import AuthUser, UserType
from app.schemas.signal import (
    SignalFileResponse,
    SignalResponse,
    FileUploadResponse,
    ProcessingRequest,
    EEGBookmarkCreate,
    EEGBookmarkResponse,
)
from app.core.config import settings
from app.utils.file_processing import save_uploaded_file, process_signal_file
from app.services.inference_service import inference_service
from app.services.eeg_cache_service import eeg_cache
from external.edf_preprocess import process_edf
import mne

EEG_CHANNEL_ORDER = [
    "FP1",
    "FP2",
    "F7",
    "F3",
    "FZ",
    "F4",
    "F8",
    "T3",
    "C3",
    "CZ",
    "C4",
    "T4",
    "T5",
    "P3",
    "PZ",
    "P4",
    "T6",
    "O1",
    "O2",
    "A1",
    "A2",
]

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

        matlab_applied = False
        try:
            raw = mne.io.read_raw_edf(file_path, preload=False, verbose=False)
            if len(raw.ch_names) == 24:
                process_edf(file_path, file_path)
                matlab_applied = True
        except Exception as e:
            print(f"Skipping MATLAB preprocessing: {e}")

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
            message="Matlab Script automatically applied"
            if matlab_applied
            else "File uploaded successfully",
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


@router.get("/files/{file_id}/bookmarks", response_model=List[EEGBookmarkResponse])
async def get_file_bookmarks(
    file_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get EEG bookmarks for a signal file"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    if current_user.user_type == UserType.PATIENT.value:
        patient_user = (
            db.query(User).filter(User.patient_auth_user_id == current_user.id).first()
        )
        if not patient_user or file.user_id != patient_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access your own files",
            )
    elif current_user.user_type == UserType.DOCTOR.value:
        owner = (
            db.query(User)
            .filter(
                User.id == file.user_id,
                or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
            )
            .first()
        )
        if not owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access files for your patients",
            )

    bookmarks = (
        db.query(EEGBookmark)
        .filter(EEGBookmark.file_id == file_id)
        .order_by(EEGBookmark.created_at.desc())
        .all()
    )

    response = []
    for bookmark in bookmarks:
        filename = os.path.basename(bookmark.image_path)
        response.append(
            EEGBookmarkResponse(
                id=bookmark.id,
                file_id=bookmark.file_id,
                comment=bookmark.comment,
                image_url=f"/uploads/bookmarks/{file_id}/{filename}",
                created_at=bookmark.created_at,
                created_by=bookmark.created_by,
            )
        )

    return response


@router.post(
    "/files/{file_id}/bookmarks",
    response_model=EEGBookmarkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_file_bookmark(
    file_id: int,
    bookmark_data: EEGBookmarkCreate,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create EEG bookmark for a signal file"""

    file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signal file not found"
        )

    if current_user.user_type == UserType.PATIENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patients cannot create bookmarks",
        )

    if current_user.user_type == UserType.DOCTOR.value:
        owner = (
            db.query(User)
            .filter(
                User.id == file.user_id,
                or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
            )
            .first()
        )
        if not owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access files for your patients",
            )

    if bookmark_data.replace_id:
        bookmark_to_replace = (
            db.query(EEGBookmark)
            .filter(
                EEGBookmark.id == bookmark_data.replace_id,
                EEGBookmark.file_id == file_id,
            )
            .first()
        )
        if not bookmark_to_replace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bookmark to replace not found",
            )
        if bookmark_to_replace.image_path and os.path.exists(
            bookmark_to_replace.image_path
        ):
            os.remove(bookmark_to_replace.image_path)
        db.delete(bookmark_to_replace)
        db.commit()

    image_data = bookmark_data.image_base64
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(image_data)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image data",
        )

    bookmark = EEGBookmark(
        file_id=file_id,
        comment=bookmark_data.comment,
        created_by=current_user.id,
        image_path="",
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)

    bookmark_dir = os.path.join("uploads", "bookmarks", str(file_id))
    os.makedirs(bookmark_dir, exist_ok=True)
    filename = f"bookmark_{bookmark.id}.png"
    image_path = os.path.join(bookmark_dir, filename)

    with open(image_path, "wb") as handle:
        handle.write(image_bytes)

    bookmark.image_path = image_path
    db.commit()
    db.refresh(bookmark)

    return EEGBookmarkResponse(
        id=bookmark.id,
        file_id=bookmark.file_id,
        comment=bookmark.comment,
        image_url=f"/uploads/bookmarks/{file_id}/{filename}",
        created_at=bookmark.created_at,
        created_by=bookmark.created_by,
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
    montage: str = "original",
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

        if montage != "original" and seg.get("channels"):
            try:
                import numpy as np
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to load numpy for montage: {e}",
                )

            raw_channels = {
                ch["channel_name"].upper(): np.array(ch["data"])
                for ch in seg["channels"]
            }
            sampling_rate = seg.get("sampling_rate", 0)
            times = seg.get("times", [])

            def build_channel(name, data):
                return {
                    "channel_name": name,
                    "data": data.tolist(),
                    "sampling_rate": sampling_rate,
                }

            montage_channels = []
            if montage == "bipolar_longitudinal":
                pairs = [
                    ("FP1", "F7"),
                    ("F7", "T3"),
                    ("T3", "T5"),
                    ("T5", "O1"),
                    ("FP2", "F8"),
                    ("F8", "T4"),
                    ("T4", "T6"),
                    ("T6", "O2"),
                    ("FP1", "F3"),
                    ("F3", "C3"),
                    ("C3", "P3"),
                    ("P3", "O1"),
                    ("FP2", "F4"),
                    ("F4", "C4"),
                    ("C4", "P4"),
                    ("P4", "O2"),
                    ("FZ", "CZ"),
                    ("CZ", "PZ"),
                ]
            elif montage == "bipolar_transverse":
                pairs = [
                    ("FP1", "FP2"),
                    ("F7", "F8"),
                    ("F3", "F4"),
                    ("T3", "T4"),
                    ("C3", "C4"),
                    ("T5", "T6"),
                    ("P3", "P4"),
                    ("O1", "O2"),
                    ("A1", "A2"),
                    ("FZ", "CZ"),
                    ("CZ", "PZ"),
                ]
            elif montage == "laplacian":
                pairs = [
                    ("F3", "FP1"),
                    ("F3", "F7"),
                    ("F3", "C3"),
                    ("F4", "FP2"),
                    ("F4", "F8"),
                    ("F4", "C4"),
                    ("C3", "F3"),
                    ("C3", "T3"),
                    ("C3", "P3"),
                    ("C4", "F4"),
                    ("C4", "T4"),
                    ("C4", "P4"),
                    ("P3", "C3"),
                    ("P3", "T5"),
                    ("P3", "O1"),
                    ("P4", "C4"),
                    ("P4", "T6"),
                    ("P4", "O2"),
                ]
            else:
                pairs = []

            for left, right in pairs:
                if left in raw_channels and right in raw_channels:
                    montage_channels.append(
                        build_channel(
                            f"{left}-{right}", raw_channels[left] - raw_channels[right]
                        )
                    )

            seg = {
                "sampling_rate": sampling_rate,
                "channels": montage_channels,
                "times": times,
                "start_time": seg.get("start_time", 0),
                "end_time": seg.get("end_time", 0),
                "n_samples": seg.get("n_samples", 0),
            }

        if montage == "original" and seg.get("channels"):
            order_map = {name: idx for idx, name in enumerate(EEG_CHANNEL_ORDER)}
            seg["channels"] = sorted(
                seg["channels"],
                key=lambda ch: order_map.get(
                    ch["channel_name"].upper(), len(order_map)
                ),
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
        report_task_id = None

        # If task is completed, update the database
        report_task_id = None
        if task_status["status"] in ["completed", "failed"]:
            if task_status["status"] == "completed":
                result = task_status.get("result", {})
                report_task_id = result.get("report_task_id")

                # Store the report task ID for later polling
                if report_task_id and not file.report_task_id:
                    file.report_task_id = report_task_id

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
            "report_task_id": file.report_task_id or report_task_id,
        }

    except Exception as e:
        return {
            "file_id": file_id,
            "condition": file.condition,
            "inference_status": "error",
            "message": f"Error checking inference status: {str(e)}",
            "task_id": file.task_id,
            "report_task_id": report_task_id,
        }


@router.get("/files/{file_id}/report-status")
async def get_file_report_status(file_id: int, db: Session = Depends(get_db)):
    """
    Check the status of the LLM report generation task for a specific file.
    If completed, stores the report in the database.
    """
    try:
        file = db.query(SignalFile).filter(SignalFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="Signal file not found")

        # If no report task ID, report generation hasn't started
        if not file.report_task_id:
            return {
                "file_id": file_id,
                "report_status": "not_started",
                "message": "Report generation not started",
                "has_report": bool(file.factual_report),
            }

        # If already has report data, return it
        if file.factual_report and file.impression:
            return {
                "file_id": file_id,
                "report_status": "completed",
                "message": "Report ready",
                "has_report": True,
                "report": {
                    "factual_report": file.factual_report,
                    "impression": file.impression,
                },
            }

        # Check task status
        status_data = inference_service.get_task_status(file.report_task_id)

        if not status_data:
            raise HTTPException(status_code=404, detail="Report task not found")

        # If task completed, store the report
        if status_data["status"] == "completed":
            result = status_data.get("result", {})
            if result:
                file.factual_report = result.get("factual_report", "")
                file.impression = result.get("impression", "")
                db.commit()

                return {
                    "file_id": file_id,
                    "report_status": "completed",
                    "message": "Report ready",
                    "has_report": True,
                    "report": {
                        "factual_report": file.factual_report,
                        "impression": file.impression,
                    },
                }

        # Task still pending or failed
        return {
            "file_id": file_id,
            "report_status": status_data["status"],
            "message": status_data.get("message", ""),
            "has_report": False,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error checking report status: {str(e)}"
        )


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
