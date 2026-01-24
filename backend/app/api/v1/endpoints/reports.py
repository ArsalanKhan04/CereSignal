"""
Report management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime
import os

from app.core.database import get_db
from app.core.auth import get_current_active_user
from app.models.report import EEGReport
from app.models.signal import SignalFile
from app.models.auth import AuthUser, UserType
from app.models.user import User
from app.models.notification import Notification
from app.schemas.report import (
    EEGReportCreate,
    EEGReportUpdate,
    EEGReportResponse,
    EEGReportListResponse,
)
from app.services.pdf_service import pdf_generator

router = APIRouter()


@router.post("/", response_model=EEGReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    report_data: EEGReportCreate,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new EEG report"""

    # Check if file exists and belongs to the user
    signal_file = (
        db.query(SignalFile)
        .join(User)
        .filter(
            SignalFile.id == report_data.file_id,
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
        )
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

        db.add(db_report)

        if notification:
            db.add(notification)

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
        # Patients can only see their own reports
        if current_user.user_type == UserType.PATIENT.value:
            # Find the patient's User record
            patient_user = (
                db.query(User)
                .filter(User.patient_auth_user_id == current_user.id)
                .first()
            )

            if not patient_user:
                return []  # No patient record found, return empty list

            # Get reports for files belonging to this patient
            reports = (
                db.query(EEGReport)
                .join(SignalFile)
                .filter(SignalFile.user_id == patient_user.id)
            )
        elif current_user.user_type == UserType.TECHNICIAN.value:
            reports = db.query(EEGReport).join(SignalFile)
        else:
            # Doctors see reports for their managed patients
            reports = (
                db.query(EEGReport)
                .join(SignalFile)
                .join(User)
                .filter(
                    or_(User.auth_user_id == current_user.id, User.auth_user_id == None)
                )
            )

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
    report_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a specific report by ID"""

    report = (
        db.query(EEGReport)
        .join(SignalFile)
        .join(User)
        .filter(
            EEGReport.id == report_id,
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
        )
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )

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
    report_id: int,
    report_data: EEGReportUpdate,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update an existing report"""

    report = (
        db.query(EEGReport)
        .join(SignalFile)
        .join(User)
        .filter(
            EEGReport.id == report_id,
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
        )
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )

    try:
        # Update report fields
        update_data = report_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(report, field, value)

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
    report_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a report"""

    report = (
        db.query(EEGReport)
        .join(SignalFile)
        .join(User)
        .filter(
            EEGReport.id == report_id,
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
        )
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )

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


@router.get("/file/{file_id}", response_model=Optional[EEGReportResponse])
async def get_report_by_file(
    file_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get report for a specific file"""

    # Check if file exists and belongs to the user
    signal_file = (
        db.query(SignalFile)
        .join(User)
        .filter(
            SignalFile.id == file_id,
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
        )
        .first()
    )

    if not signal_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal file not found or access denied",
        )

    report = db.query(EEGReport).filter(EEGReport.file_id == file_id).first()

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
    report_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate PDF for an existing report"""

    # Get the report
    report = (
        db.query(EEGReport)
        .join(SignalFile)
        .join(User)
        .filter(
            EEGReport.id == report_id,
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None),
        )
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )

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
            "report_id": report_id,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating PDF: {str(e)}",
        )


@router.get("/{report_id}/download-pdf")
async def download_report_pdf(
    report_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Download the PDF for a report"""

    # Get the report
    report_query = (
        db.query(EEGReport)
        .join(SignalFile)
        .join(User)
        .filter(EEGReport.id == report_id)
    )

    if current_user.user_type == UserType.PATIENT.value:
        report_query = report_query.filter(User.patient_auth_user_id == current_user.id)
    elif current_user.user_type == UserType.TECHNICIAN.value:
        report_query = report_query
    else:
        report_query = report_query.filter(
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None)
        )

    report = report_query.first()

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )

    if not report.pdf_file_path or not os.path.exists(report.pdf_file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF file not found. Please generate the PDF first.",
        )

    # Return the PDF file
    filename = os.path.basename(report.pdf_file_path)
    return FileResponse(
        path=report.pdf_file_path, filename=filename, media_type="application/pdf"
    )


@router.get("/{report_id}/pdf-status")
async def get_pdf_status(
    report_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Check if PDF exists for a report"""

    # Get the report
    report_query = (
        db.query(EEGReport)
        .join(SignalFile)
        .join(User)
        .filter(EEGReport.id == report_id)
    )

    if current_user.user_type == UserType.PATIENT.value:
        report_query = report_query.filter(User.patient_auth_user_id == current_user.id)
    elif current_user.user_type == UserType.TECHNICIAN.value:
        report_query = report_query
    else:
        report_query = report_query.filter(
            or_(User.auth_user_id == current_user.id, User.auth_user_id == None)
        )

    report = report_query.first()

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )

    pdf_exists = report.pdf_file_path and os.path.exists(report.pdf_file_path)

    return {
        "report_id": report_id,
        "pdf_exists": pdf_exists,
        "pdf_path": report.pdf_file_path if pdf_exists else None,
    }
