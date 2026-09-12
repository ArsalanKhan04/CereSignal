"""
Signal management endpoints
"""

import base64
import os
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.access import (
    forbid_patients,
    get_accessible_file,
    visible_patients,
    visible_signal_files,
)
from app.core.auth import get_current_active_user
from app.core.config import settings
from app.core.database import get_db
from app.core.logging_config import (
    log_error,
    log_file_operation,
    log_request,
    logger,
)
from app.models.auth import AuthUser, UserType
from app.models.report import EEGReport
from app.models.signal import EEGBookmark, Signal, SignalFile
from app.models.user import User
from app.schemas.field_types import OptionalQueryResourceId, PageLimit, PageOffset, ResourceId
from app.schemas.signal import (
    EEGBookmarkCreate,
    EEGBookmarkResponse,
    FileUploadResponse,
    SignalFileResponse,
    SignalLabelUpdate,
    SignalResponse,
)
from app.services.eeg_cache_service import eeg_cache
from app.services.inference_service import inference_service as _inference_service
from app.services.pdf_service import pdf_generator
from app.services.storage_service import ASSETS_BUCKET, SIGNALS_BUCKET, storage_service
from app.utils.file_processing import process_signal_file, save_uploaded_file

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


def _get_inference_service():
    return _inference_service


def _regenerate_report_pdf(db: Session, file: SignalFile) -> None:
    report = db.query(EEGReport).filter(EEGReport.file_id == file.id).first()
    if not report:
        return
    doctor = db.query(AuthUser).filter(AuthUser.id == report.auth_user_id).first()
    if not doctor:
        return
    pdf_path = pdf_generator.generate_report_pdf(report, file, doctor)
    report.pdf_file_path = pdf_path
    db.commit()


@router.post("/upload", response_model=FileUploadResponse)
async def upload_signal_file(
    file: UploadFile = File(...),
    patient_id: int = Form(
        None
    ),  # Optional: specify which patient this file belongs to
    skip_inference: bool = Form(False),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upload a signal file for processing"""
    start_time = time.time()
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    log_request(
        "POST",
        "/signals/upload",
        current_user.id,
        {"filename": file.filename, "patient_id": patient_id},
    )

    logger.debug("Upload requested", extra={"patient_id": patient_id})
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

    # Before the patient_id branch: a patient who omitted patient_id used to fall
    # through to the default-patient path below and upload anyway.
    forbid_patients(current_user, "Patients cannot upload files")

    try:
        # Determine which patient this file belongs to
        if patient_id:
            # For technicians: any patient in their own hospital
            # For doctors: only their assigned patients
            if current_user.user_type == UserType.TECHNICIAN.value:
                user = (
                    visible_patients(db, current_user)
                    .filter(User.id == patient_id)
                    .first()
                )
                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Patient not found",
                    )
            elif current_user.user_type == UserType.DOCTOR.value:
                user = (
                    visible_patients(db, current_user)
                    .filter(User.id == patient_id, User.auth_user_id == current_user.id)
                    .first()
                )
                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Patient not found or you don't have access to this patient",
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only doctors and technicians can upload to a patient",
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
                    hospital_id=current_user.hospital_id,
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
            hospital_id=current_user.hospital_id,
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

            if skip_inference:
                db_file.processing_status = "pending"
                db_file.condition = "processing"
                db.commit()
                logger.info(
                    "Inference skipped",
                    extra={"file_id": db_file.id, "skip_inference": skip_inference},
                )
            else:
                # Start inference task
                try:
                    task_id = _get_inference_service().start_inference(file_path)
                    db_file.task_id = task_id
                    db.commit()
                    logger.info(
                        "Inference task started",
                        extra={"file_id": db_file.id, "task_id": task_id},
                    )
                except Exception as e:
                    logger.warning(
                        "Error starting inference task",
                        extra={"file_id": db_file.id, "error": str(e)},
                    )
                    # Don't fail the upload if inference fails to start
                    db_file.condition = "failed"
                    db.commit()

        except Exception as e:
            # Mark as failed but don't rollback the file record
            db_file.processing_status = "failed"
            db.commit()
            logger.warning(f"Error processing signal file {db_file.id}: {e}")

        duration_ms = (time.time() - start_time) * 1000
        log_file_operation("UPLOAD_SUCCESS", file_path, current_user.id)
        logger.info(
            f"File upload completed | file_id={db_file.id} | duration={duration_ms:.2f}ms"
        )

        return FileUploadResponse(
            message="File uploaded successfully",
            file_id=db_file.id,
            filename=db_file.original_filename,
            file_size=db_file.file_size,
            processing_status=db_file.processing_status,
        )

    except HTTPException:
        # The 4xx raised above is the answer, not a server fault. Without
        # this the generic handler below re-wraps it as a 500.
        raise
    except Exception as e:
        db.rollback()
        log_error(e, f"File upload failed for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading file: {str(e)}",
        )



@router.get("/files/{file_id}/bookmarks", response_model=List[EEGBookmarkResponse])
async def get_file_bookmarks(
    file: SignalFile = Depends(get_accessible_file),
    db: Session = Depends(get_db),
):
    """Get EEG bookmarks for a signal file"""

    bookmarks = (
        db.query(EEGBookmark)
        .filter(EEGBookmark.file_id == file.id)
        .order_by(EEGBookmark.created_at.desc())
        .all()
    )

    response = []
    for bookmark in bookmarks:
        image_url = storage_service.signed_url(bookmark.image_path) if bookmark.image_path else ""
        response.append(
            EEGBookmarkResponse(
                id=bookmark.id,
                file_id=bookmark.file_id,
                comment=bookmark.comment,
                image_url=image_url,
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
    bookmark_data: EEGBookmarkCreate,
    file: SignalFile = Depends(get_accessible_file),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create EEG bookmark for a signal file"""

    forbid_patients(current_user, "Patients cannot create bookmarks")

    if bookmark_data.replace_id:
        bookmark_to_replace = (
            db.query(EEGBookmark)
            .filter(
                EEGBookmark.id == bookmark_data.replace_id,
                EEGBookmark.file_id == file.id,
            )
            .first()
        )
        if not bookmark_to_replace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bookmark to replace not found",
            )
        if bookmark_to_replace.image_path:
            storage_service.delete(ASSETS_BUCKET, bookmark_to_replace.image_path)
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
        file_id=file.id,
        comment=bookmark_data.comment,
        created_by=current_user.id,
        image_path="",
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)

    object_path = f"bookmarks/{file.id}/bookmark_{bookmark.id}.png"
    storage_service.upload(ASSETS_BUCKET, object_path, image_bytes)

    bookmark.image_path = object_path
    db.commit()
    db.refresh(bookmark)

    _regenerate_report_pdf(db, file)

    return EEGBookmarkResponse(
        id=bookmark.id,
        file_id=bookmark.file_id,
        comment=bookmark.comment,
        image_url=storage_service.signed_url(object_path),
        created_at=bookmark.created_at,
        created_by=bookmark.created_by,
    )


@router.delete("/files/{file_id}/bookmarks/{bookmark_id}")
async def delete_file_bookmark(
    bookmark_id: ResourceId,
    file: SignalFile = Depends(get_accessible_file),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete EEG bookmark for a signal file"""

    forbid_patients(current_user, "Patients cannot delete bookmarks")

    bookmark = (
        db.query(EEGBookmark)
        .filter(EEGBookmark.id == bookmark_id, EEGBookmark.file_id == file.id)
        .first()
    )
    if not bookmark:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found"
        )

    if bookmark.image_path:
        storage_service.delete(ASSETS_BUCKET, bookmark.image_path)

    db.delete(bookmark)
    db.commit()

    _regenerate_report_pdf(db, file)

    return {"message": "Bookmark deleted"}


@router.get("/files", response_model=List[SignalFileResponse])
async def get_signal_files(
    skip: PageOffset = 0,
    limit: PageLimit = 100,
    patient_id: OptionalQueryResourceId = None,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get list of uploaded signal files for the authenticated user's patients"""

    query = visible_signal_files(db, current_user)
    if patient_id:
        # A patient_id outside the caller's scope simply matches nothing, which is
        # the same answer the rest of this endpoint gives.
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
async def get_file_events(file: SignalFile = Depends(get_accessible_file)):
    """Get events data for a specific file"""

    return {
        "file_id": file.id,
        "filename": file.filename,
        "condition": file.condition,
        "events": file.events or {},
        "focus_points": file.focus_points or [],
    }


@router.get("/files/{file_id}", response_model=SignalFileResponse)
async def get_signal_file(file: SignalFile = Depends(get_accessible_file)):
    """Get specific signal file by ID"""

    return file


@router.get("/files/{file_id}/signals", response_model=List[SignalResponse])
async def get_file_signals(
    file: SignalFile = Depends(get_accessible_file),
    db: Session = Depends(get_db),
):
    """Get all signals from a specific file"""

    signals = db.query(Signal).filter(Signal.file_id == file.id).all()
    return signals


@router.get("/files/{file_id}/signal-data")
async def get_signal_data(
    start_time: float = 0.0,
    duration: float = 10.0,
    file: SignalFile = Depends(get_accessible_file),
    db: Session = Depends(get_db),
):
    """Get signal data for a specific time range"""

    signals = db.query(Signal).filter(Signal.file_id == file.id).all()

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
        "file_id": file.id,
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
    start_time: float = 0.0,
    duration: float = 10.0,
    channels: Optional[str] = None,
    montage: str = "original",
    file: SignalFile = Depends(get_accessible_file),
):
    """Return actual signal samples for plotting (JSON with lists). Channels is optional comma-separated names."""

    # Ensure file is loaded into cache
    try:
        meta = eeg_cache.load_file(file.id, file.file_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load EEG file: {e}",
        )

    # Until preprocessing has converted it, file_path still points at the raw upload:
    # pre-repair montage, wrong channel count, and units MNE could not interpret. Refuse
    # rather than plotting it — check_inference_status swaps the path once the conversion
    # lands. A status rather than a body flag so a client that knows nothing about
    # readiness surfaces this message instead of rendering an empty plot.
    from external.edf_preprocess import conforms_to_layout

    if not conforms_to_layout(meta["ch_names"]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Recording is still being prepared for viewing.",
        )

    # parse channels
    channels_list = None
    if channels:
        channels_list = [c.strip() for c in channels.split(",") if c.strip()]

    try:
        seg = eeg_cache.get_segment(
            file.id, start_time=start_time, duration=duration, channels=channels_list
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
            total_duration = seg.get("total_duration", 0)
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
                "total_duration": total_duration,
            }

        if montage == "original" and seg.get("channels"):
            order_map = {name: idx for idx, name in enumerate(EEG_CHANNEL_ORDER)}
            seg["channels"] = sorted(
                seg["channels"],
                key=lambda ch: order_map.get(
                    ch["channel_name"].upper(), len(order_map)
                ),
            )

        return {"file_id": file.id, "filename": file.filename, "plot_data": seg}
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not loaded in cache"
        )
    except HTTPException:
        # The 4xx raised above is the answer, not a server fault. Without
        # this the generic handler below re-wraps it as a 500.
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error extracting plot data: {e}",
        )


@router.get("/files/{file_id}/topomap")
async def get_file_topomap(file: SignalFile = Depends(get_accessible_file)):
    """Return generated topomap PNG for a file if it exists"""

    # Name it after file_path, not filename: preprocessing swaps file_path to
    # "<name>_processed.edf" (see check_inference_status) and leaves filename at the
    # raw upload, while the topomap is generated from the processed recording. Keying
    # off filename looked for "<name>_topomap.png" and never matched.
    base = os.path.splitext(os.path.basename(file.file_path))[0]
    object_path = f"topomaps/{base}_topomap.png"

    try:
        data = storage_service.download(ASSETS_BUCKET, object_path)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topomap not found for this file",
        )

    return Response(content=data, media_type="image/png")


@router.get("/stats")
async def get_signal_stats(
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get statistics for the dashboard"""

    # Same scope as the file list, so the dashboard totals match what it shows.
    files = visible_signal_files(db, current_user).all()

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
                "uploaded_at": (
                    file.upload_time.isoformat() if file.upload_time else None
                ),
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
    unique_patients = len({file.user_id for file in files if file.user_id})

    return {
        "total_files": len(files),
        "total_patients": unique_patients,
        "condition_counts": condition_counts,
        "recent_files": recent_files,
        "file_stats": file_stats,
    }


@router.get("/files/{file_id}/inference-status")
async def check_inference_status(
    file_id: ResourceId,
    file: SignalFile = Depends(get_accessible_file),
    db: Session = Depends(get_db),
):
    """Check the status of inference for a specific file"""

    report_task_id = None

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
        task_status = _get_inference_service().get_task_status(file.task_id)
        report_task_id = None

        # If task is completed, update the database
        report_task_id = None
        if task_status["status"] in ["completed", "failed"]:
            if task_status["status"] == "completed":
                result = task_status.get("result", {})

                if isinstance(result, dict) and result.get("stage") == "preprocessed":
                    # EDF conversion finished — swap file path and chain to infer
                    if result.get("processed_file_path"):
                        file.file_path = result["processed_file_path"]
                        eeg_cache.evict(file_id)

                    inference_id = result.get("inference_task_id")
                    report_id = result.get("report_task_id")
                    if inference_id:
                        file.task_id = inference_id
                    if report_id and not file.report_task_id:
                        file.report_task_id = report_id
                    db.commit()

                    return {
                        "file_id": file_id,
                        "condition": file.condition,
                        "inference_status": "processing",
                        "message": "EDF converted, inference in progress",
                        "task_id": file.task_id,
                        "report_task_id": file.report_task_id,
                    }

                report_task_id = result.get("report_task_id")

                # Store the report task ID for later polling
                if report_task_id and not file.report_task_id:
                    file.report_task_id = report_task_id

                if result and "result" in result:
                    # Map inference result to condition. processing_status tracks signal
                    # processing, not the LLM write-up — the report is a separate task with
                    # its own /report-status — so it settles here. Leaving it on "processing"
                    # kept the clients polling forever and counted finished files as pending.
                    if result["result"].lower() == "normal":
                        file.condition = "normal"
                        file.processing_status = "completed"
                    elif result["result"].lower() == "abnormal":
                        file.condition = "abnormal"
                        file.processing_status = "completed"
                    elif result["result"].lower() == "pending_review":
                        # AI inference disabled — the file processed fine, it just
                        # awaits a manual label from the doctor/technician.
                        file.condition = "pending_review"
                        file.processing_status = "completed"
                    else:
                        file.condition = "failed"
                        file.processing_status = "failed"

                    # Store events data if available
                    if "events" in result and result["events"]:
                        file.events = result["events"]

                    # Store focus points if available
                    if "focus_points" in result and result["focus_points"]:
                        file.focus_points = result["focus_points"]
                else:
                    file.condition = "failed"
                    file.processing_status = "failed"
            else:  # failed
                file.condition = "failed"
                file.processing_status = "failed"

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
async def get_file_report_status(
    file_id: ResourceId,
    file: SignalFile = Depends(get_accessible_file),
    db: Session = Depends(get_db),
):
    """
    Check the status of the LLM report generation task for a specific file.
    If completed, stores the report in the database.
    """
    try:
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
        status_data = _get_inference_service().get_task_status(file.report_task_id)

        if not status_data:
            raise HTTPException(status_code=404, detail="Report task not found")

        # If task completed, store the report
        if status_data["status"] == "completed":
            result = status_data.get("result") or {}
            factual_report = result.get("factual_report", "")
            impression = result.get("impression", "")

            # _generate_report (inference/infer.py) swallows LLM failures and returns
            # blank text so that inference still completes. Blank is a failed
            # generation, not a report: reporting it as completed made the form
            # announce "AI-generated report loaded successfully" over empty fields.
            # Both fields are required, matching the already-stored check above — a
            # half-blank report would fail that check on every later poll instead.
            if factual_report and impression:
                file.factual_report = factual_report
                file.impression = impression
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

            return {
                "file_id": file_id,
                "report_status": "failed",
                "message": "AI report generation produced no text",
                "has_report": False,
            }

        # Task still pending or failed
        return {
            "file_id": file_id,
            "report_status": status_data["status"],
            "message": status_data.get("message", ""),
            "has_report": False,
        }

    except HTTPException:
        # The 4xx raised above is the answer, not a server fault. Without
        # this the generic handler below re-wraps it as a 500.
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error checking report status: {str(e)}"
        )


@router.delete("/files/{file_id}")
async def delete_signal_file(
    file: SignalFile = Depends(get_accessible_file),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a signal file and its associated data"""

    forbid_patients(current_user, "Patients cannot delete files")


    try:
        # Delete signal file from Supabase Storage
        storage_service.delete(SIGNALS_BUCKET, file.file_path)

        # Delete bookmark images from assets bucket
        for bookmark in file.bookmarks:
            if bookmark.image_path:
                storage_service.delete(ASSETS_BUCKET, bookmark.image_path)

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
async def download_file(file: SignalFile = Depends(get_accessible_file)):
    """Download/serve a signal file for viewing"""


    try:
        data = storage_service.download(SIGNALS_BUCKET, file.file_path)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage"
        )

    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file.original_filename}"'},
    )


@router.patch("/files/{file_id}/label", response_model=SignalFileResponse)
async def update_file_label(
    label_data: SignalLabelUpdate,
    file: SignalFile = Depends(get_accessible_file),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update label for a signal file"""

    # get_accessible_file has already settled which files this user may touch;
    # what follows only rejects the roles that may not label at all.

    # Patients used to be allowed here, which made this the one write route of ten
    # that let a patient change their own record - a portal session could set its
    # own study to "normal". The rule lives in forbid_patients so it stays in one
    # place; four hand-copied access checks drifting apart is what access.py was
    # written to end.
    forbid_patients(current_user, "Patients cannot relabel files")

    # Admins are excluded deliberately - they can see their hospital's files but
    # not relabel them.
    if current_user.user_type not in (
        UserType.DOCTOR.value,
        UserType.TECHNICIAN.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update labels",
        )

    condition = label_data.condition.strip().lower()
    if condition not in {"normal", "abnormal"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="condition must be 'normal' or 'abnormal'",
        )

    file.condition = condition
    file.processing_status = "completed"

    report = db.query(EEGReport).filter(EEGReport.file_id == file.id).first()
    if report:
        report.impression = condition

    db.commit()
    db.refresh(file)

    return file
