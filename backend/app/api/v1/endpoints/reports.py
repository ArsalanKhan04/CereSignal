"""
Report management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List, Optional
from datetime import datetime
import os

from app.core.database import get_db
from app.core.access import (
    forbid_patients,
    get_accessible_file,
    get_accessible_report,
    visible_reports,
    visible_signal_files,
)
from app.core.auth import get_current_active_user
from app.models.report import EEGReport, EEGReportVersion
from app.models.signal import SignalFile
from app.models.auth import AuthUser, UserType
from app.models.notification import Notification
from app.schemas.report import (
    EEGReportCreate,
    EEGReportUpdate,
    EEGReportResponse,
    EEGReportListResponse,
    EEGReportVersionResponse,
)
from app.services.pdf_service import pdf_generator


def _snapshot_report(
    db: Session, report: EEGReport, saved_by_auth_user_id: int
) -> EEGReportVersion:
    """Capture the current state of a report as a new version row. Does NOT commit."""
    next_version = (
        db.query(func.count(EEGReportVersion.id))
        .filter(EEGReportVersion.report_id == report.id)
        .scalar()
        or 0
    ) + 1
    version = EEGReportVersion(
        report_id=report.id,
        version_number=next_version,
        saved_by_auth_user_id=saved_by_auth_user_id,
        patient_name=report.patient_name,
        patient_age=report.patient_age,
        patient_gender=report.patient_gender,
        ref_physician=report.ref_physician,
        indications=report.indications,
        technique=report.technique,
        factual_report=report.factual_report,
        impression=report.impression,
        doctor_info=report.doctor_info,
        is_finalized=report.is_finalized,
    )
    db.add(version)
    return version


router = APIRouter()


@router.post("/", response_model=EEGReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    report_data: EEGReportCreate,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new EEG report"""

    forbid_patients(current_user, "Patients cannot create reports")

    # The file must be one this user can reach. file_id arrives in the body, so
    # this uses the scope query directly rather than the path-param dependency.
    signal_file = (
        visible_signal_files(db, current_user)
        .filter(SignalFile.id == report_data.file_id)
        .first()
    )

    if not signal_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal file not found or access denied",
        )

    # Check if report already exists for this file
    existing_report = (
        db.query(EEGReport).filter(EEGReport.file_id == report_data.file_id).first()
    )

    if existing_report:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report already exists for this file",
        )

    try:
        # Create new report
        report_dict = report_data.dict()
        db_report = EEGReport(
            file_id=report_data.file_id,
            auth_user_id=current_user.id,
            hospital_id=current_user.hospital_id,
            patient_name=report_dict["patient_name"],
            patient_age=report_dict.get("patient_age"),
            patient_gender=report_dict.get("patient_gender"),
            ref_physician=report_dict.get("ref_physician"),
            indications=report_dict.get("indications"),
            technique=report_dict.get("technique"),
            factual_report=report_dict.get("factual_report"),
            impression=report_dict["impression"],
            doctor_info=report_dict.get("doctor_info"),
        )

        notification = None
        if current_user.user_type == UserType.DOCTOR.value:
            signal_file.user.auth_user_id = current_user.id
            notification = Notification(
                auth_user_id=current_user.id,
                patient_id=signal_file.user.id,
                message=f"Patient named {signal_file.user.name} has been assigned to you for EEG review",
            )

        if db_report.impression:
            normalized_impression = db_report.impression.strip().lower()
            if normalized_impression in {"normal", "abnormal"}:
                signal_file.condition = normalized_impression

        db.add(db_report)

        if notification:
            db.add(notification)

        db.flush()  # assigns db_report.id without committing
        _snapshot_report(db, db_report, current_user.id)  # version 1

        db.commit()
        db.refresh(db_report)

        # Add additional fields for response
        response_data = db_report.__dict__.copy()
        response_data["file_name"] = signal_file.original_filename
        response_data["doctor_name"] = (
            f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
            or current_user.username
        )

        return EEGReportResponse(**response_data)

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating report: {str(e)}",
        )


@router.get("/", response_model=List[EEGReportListResponse])
async def get_reports(
    skip: int = 0,
    limit: int = 100,
    patient_id: Optional[int] = None,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all reports for the authenticated user"""

    try:
        reports = visible_reports(db, current_user)

        if patient_id is not None:
            reports = reports.filter(SignalFile.user_id == patient_id)

        reports = reports.offset(skip).limit(limit).all()

        # Add additional fields for response
        response_data = []
        for report in reports:
            report_dict = report.__dict__.copy()
            report_dict["file_name"] = report.signal_file.original_filename

            # Get doctor name from report's auth_user
            if report.auth_user:
                doctor_name = (
                    f"{report.auth_user.first_name or ''} {report.auth_user.last_name or ''}".strip()
                    or report.auth_user.username
                )
            else:
                doctor_name = current_user.username
            report_dict["doctor_name"] = doctor_name

            response_data.append(EEGReportListResponse(**report_dict))

        return response_data

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching reports: {str(e)}",
        )


@router.get("/{report_id}", response_model=EEGReportResponse)
async def get_report(
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a specific report by ID"""

    # Add additional fields for response
    response_data = report.__dict__.copy()
    response_data["file_name"] = report.signal_file.original_filename
    response_data["doctor_name"] = (
        f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
        or current_user.username
    )

    return EEGReportResponse(**response_data)


@router.put("/{report_id}", response_model=EEGReportResponse)
async def update_report(
    report_data: EEGReportUpdate,
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update an existing report"""

    forbid_patients(current_user, "Patients cannot edit reports")

    try:
        # Snapshot current state before mutating (so it's recoverable)
        _snapshot_report(db, report, current_user.id)

        # Update report fields
        update_data = report_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(report, field, value)

        if "impression" in update_data and update_data["impression"] is not None:
            normalized_impression = update_data["impression"].strip().lower()
            if normalized_impression in {"normal", "abnormal"}:
                report.signal_file.condition = normalized_impression

        db.commit()
        db.refresh(report)

        # Add additional fields for response
        response_data = report.__dict__.copy()
        response_data["file_name"] = report.signal_file.original_filename
        response_data["doctor_name"] = (
            f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
            or current_user.username
        )

        return EEGReportResponse(**response_data)

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating report: {str(e)}",
        )


@router.delete("/{report_id}")
async def delete_report(
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a report"""

    forbid_patients(current_user, "Patients cannot delete reports")

    try:
        db.delete(report)
        db.commit()

        return {"message": "Report deleted successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting report: {str(e)}",
        )


@router.get("/{report_id}/versions", response_model=List[EEGReportVersionResponse])
async def list_report_versions(
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """List all version snapshots for a report, ordered by version number"""

    versions = (
        db.query(EEGReportVersion)
        .filter(EEGReportVersion.report_id == report.id)
        .order_by(EEGReportVersion.version_number)
        .all()
    )

    result = []
    for v in versions:
        d = {c.key: getattr(v, c.key) for c in v.__table__.columns}
        if v.saved_by:
            d["saved_by_name"] = (
                f"{v.saved_by.first_name or ''} {v.saved_by.last_name or ''}".strip()
                or v.saved_by.username
            )
        result.append(EEGReportVersionResponse(**d))
    return result


@router.get("/{report_id}/versions/{version_id}", response_model=EEGReportVersionResponse)
async def get_report_version(
    version_id: int,
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a single version snapshot"""

    version = (
        db.query(EEGReportVersion)
        .filter(
            EEGReportVersion.id == version_id,
            EEGReportVersion.report_id == report.id,
        )
        .first()
    )

    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    d = {c.key: getattr(version, c.key) for c in version.__table__.columns}
    if version.saved_by:
        d["saved_by_name"] = (
            f"{version.saved_by.first_name or ''} {version.saved_by.last_name or ''}".strip()
            or version.saved_by.username
        )
    return EEGReportVersionResponse(**d)


@router.post("/{report_id}/versions/{version_id}/restore", response_model=EEGReportResponse)
async def restore_report_version(
    version_id: int,
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Restore a report to a historical snapshot. Saves a new version to track the rollback."""

    forbid_patients(current_user, "Patients cannot restore report versions")

    version = (
        db.query(EEGReportVersion)
        .filter(
            EEGReportVersion.id == version_id,
            EEGReportVersion.report_id == report.id,
        )
        .first()
    )

    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    try:
        # Snapshot the current state before overwriting (tracks the rollback event)
        _snapshot_report(db, report, current_user.id)

        # Copy all editable fields from the chosen version back to the live report
        editable_fields = [
            "patient_name", "patient_age", "patient_gender", "ref_physician",
            "indications", "technique", "factual_report", "impression",
            "doctor_info", "is_finalized",
        ]
        for field in editable_fields:
            setattr(report, field, getattr(version, field))

        # Sync signal_file.condition if impression changed
        if report.impression:
            normalized = report.impression.strip().lower()
            if normalized in {"normal", "abnormal"}:
                report.signal_file.condition = normalized

        db.commit()
        db.refresh(report)

        response_data = report.__dict__.copy()
        response_data["file_name"] = report.signal_file.original_filename
        response_data["doctor_name"] = (
            f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
            or current_user.username
        )
        return EEGReportResponse(**response_data)

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error restoring version: {str(e)}",
        )


@router.get("/file/{file_id}", response_model=Optional[EEGReportResponse])
async def get_report_by_file(
    signal_file: SignalFile = Depends(get_accessible_file),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get report for a specific file"""

    report = db.query(EEGReport).filter(EEGReport.file_id == signal_file.id).first()

    if not report:
        return None

    # Add additional fields for response
    response_data = report.__dict__.copy()
    response_data["file_name"] = signal_file.original_filename
    response_data["doctor_name"] = (
        f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
        or current_user.username
    )

    return EEGReportResponse(**response_data)


@router.post("/{report_id}/generate-pdf")
async def generate_report_pdf(
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate PDF for an existing report"""

    forbid_patients(current_user, "Patients cannot generate report PDFs")

    # Get the report
    try:
        # Get signal file and doctor info
        signal_file = report.signal_file
        doctor = db.query(AuthUser).filter(AuthUser.id == report.auth_user_id).first()

        if not signal_file or not doctor:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Missing report data",
            )

        # Generate PDF
        pdf_path = pdf_generator.generate_report_pdf(report, signal_file, doctor)

        # Update report with PDF path
        report.pdf_file_path = pdf_path
        db.commit()

        return {
            "message": "PDF generated successfully",
            "pdf_path": pdf_path,
            "report_id": report.id,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating PDF: {str(e)}",
        )


@router.get("/{report_id}/download-pdf")
async def download_report_pdf(
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Download the PDF for a report"""

    from app.services.storage_service import storage_service, SIGNALS_BUCKET

    needs_regen = not report.pdf_file_path

    if needs_regen:
        try:
            signal_file = report.signal_file
            doctor = db.query(AuthUser).filter(AuthUser.id == report.auth_user_id).first()

            if not signal_file or not doctor:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Missing report data",
                )

            pdf_path = pdf_generator.generate_report_pdf(report, signal_file, doctor)
            report.pdf_file_path = pdf_path
            db.commit()
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error generating PDF: {str(e)}",
            )

    try:
        data = storage_service.download(SIGNALS_BUCKET, report.pdf_file_path)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="PDF not found in storage"
        )

    filename = os.path.basename(report.pdf_file_path)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_id}/pdf-status")
async def get_pdf_status(
    report: EEGReport = Depends(get_accessible_report),
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Check if PDF exists for a report"""

    pdf_exists = bool(report.pdf_file_path)

    return {
        "report_id": report.id,
        "pdf_exists": pdf_exists,
        "pdf_path": report.pdf_file_path if pdf_exists else None,
    }
