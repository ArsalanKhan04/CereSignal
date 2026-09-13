"""
Dev Admin endpoints — cross-hospital superuser views
All routes require is_superuser=True via get_current_superuser dependency.
"""

import io
import logging
import zipfile
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_superuser
from app.core.database import get_db
from app.models.auth import AuthUser, UserType
from app.models.contact import ContactSubmission
from app.models.hospital import Hospital
from app.models.report import EEGReport
from app.models.signal import SignalFile
from app.models.user import User
from app.schemas.dev_admin import (
    DevAdminContact,
    DevAdminContactListResponse,
    DevAdminEEGFile,
    DevAdminGlobalStats,
    DevAdminHospitalDetail,
    DevAdminHospitalSummary,
    DevAdminReport,
    DevAdminStaffMember,
)
from app.schemas.field_types import PageLimit, PageOffset, ResourceId
from app.services.storage_service import SIGNALS_BUCKET, storage_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_hospital_summary(hospital: Hospital, db: Session) -> DevAdminHospitalSummary:
    hid = hospital.id
    total_doctors = (
        db.query(func.count(AuthUser.id))
        .filter(AuthUser.hospital_id == hid, AuthUser.user_type == UserType.DOCTOR.value)
        .scalar()
        or 0
    )
    total_technicians = (
        db.query(func.count(AuthUser.id))
        .filter(AuthUser.hospital_id == hid, AuthUser.user_type == UserType.TECHNICIAN.value)
        .scalar()
        or 0
    )
    total_patients = (
        db.query(func.count(User.id))
        .filter(User.hospital_id == hid, User.is_active == True)
        .scalar()
        or 0
    )
    total_files = (
        db.query(func.count(SignalFile.id)).filter(SignalFile.hospital_id == hid).scalar() or 0
    )
    pending_reports = (
        db.query(func.count(EEGReport.id))
        .filter(EEGReport.hospital_id == hid, EEGReport.is_finalized == False)
        .scalar()
        or 0
    )
    completed_reports = (
        db.query(func.count(EEGReport.id))
        .filter(EEGReport.hospital_id == hid, EEGReport.is_finalized == True)
        .scalar()
        or 0
    )
    return DevAdminHospitalSummary(
        id=hospital.id,
        name=hospital.name,
        code=hospital.code,
        address=hospital.address,
        phone=hospital.phone,
        email=hospital.email,
        is_active=hospital.is_active,
        created_at=hospital.created_at,
        total_doctors=total_doctors,
        total_technicians=total_technicians,
        total_patients=total_patients,
        total_files=total_files,
        pending_reports=pending_reports,
        completed_reports=completed_reports,
    )


@router.get("/stats", response_model=DevAdminGlobalStats)
async def get_global_stats(
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Global cross-hospital aggregate statistics"""
    total_hospitals = db.query(func.count(Hospital.id)).scalar() or 0
    active_hospitals = (
        db.query(func.count(Hospital.id)).filter(Hospital.is_active == True).scalar() or 0
    )
    total_doctors = (
        db.query(func.count(AuthUser.id))
        .filter(AuthUser.user_type == UserType.DOCTOR.value)
        .scalar()
        or 0
    )
    total_technicians = (
        db.query(func.count(AuthUser.id))
        .filter(AuthUser.user_type == UserType.TECHNICIAN.value)
        .scalar()
        or 0
    )
    total_patients = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    total_eeg_files = db.query(func.count(SignalFile.id)).scalar() or 0
    total_reports = db.query(func.count(EEGReport.id)).scalar() or 0
    pending_reports = (
        db.query(func.count(EEGReport.id)).filter(EEGReport.is_finalized == False).scalar() or 0
    )
    completed_reports = (
        db.query(func.count(EEGReport.id)).filter(EEGReport.is_finalized == True).scalar() or 0
    )
    unread_contacts = (
        db.query(func.count(ContactSubmission.id))
        .filter(ContactSubmission.is_read == False)
        .scalar()
        or 0
    )

    # Top 6 hospitals by file count for the dashboard bar chart
    hospitals = db.query(Hospital).order_by(Hospital.created_at).all()
    summaries = [_build_hospital_summary(h, db) for h in hospitals]
    top_hospitals = sorted(summaries, key=lambda s: s.total_files, reverse=True)[:6]

    return DevAdminGlobalStats(
        total_hospitals=total_hospitals,
        active_hospitals=active_hospitals,
        total_doctors=total_doctors,
        total_technicians=total_technicians,
        total_patients=total_patients,
        total_eeg_files=total_eeg_files,
        total_reports=total_reports,
        pending_reports=pending_reports,
        completed_reports=completed_reports,
        unread_contacts=unread_contacts,
        hospitals_breakdown=top_hospitals,
    )


@router.get("/hospitals", response_model=List[DevAdminHospitalSummary])
async def list_hospitals(
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """List all hospitals with aggregated stats"""
    hospitals = db.query(Hospital).order_by(Hospital.name).all()
    return [_build_hospital_summary(h, db) for h in hospitals]


@router.get("/hospitals/{hospital_id}", response_model=DevAdminHospitalDetail)
async def get_hospital_detail(
    hospital_id: ResourceId,
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Hospital detail with staff, EEG files, and reports"""
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, detail="Hospital not found")

    summary = _build_hospital_summary(hospital, db)

    staff_rows = (
        db.query(AuthUser)
        .filter(
            AuthUser.hospital_id == hospital_id,
            AuthUser.user_type.in_([UserType.DOCTOR.value, UserType.TECHNICIAN.value]),
        )
        .order_by(AuthUser.user_type, AuthUser.last_name)
        .all()
    )
    staff = [DevAdminStaffMember.model_validate(s) for s in staff_rows]

    file_rows = (
        db.query(SignalFile, User.name.label("patient_name"))
        .outerjoin(User, SignalFile.user_id == User.id)
        .filter(SignalFile.hospital_id == hospital_id)
        .order_by(SignalFile.upload_time.desc())
        .all()
    )
    files = [
        DevAdminEEGFile(
            id=sf.id,
            original_filename=sf.original_filename,
            file_size=sf.file_size,
            processing_status=sf.processing_status,
            condition=sf.condition,
            upload_time=sf.upload_time,
            patient_name=patient_name,
        )
        for sf, patient_name in file_rows
    ]

    report_rows = (
        db.query(
            EEGReport,
            AuthUser.first_name.label("doc_first"),
            AuthUser.last_name.label("doc_last"),
        )
        .outerjoin(AuthUser, EEGReport.auth_user_id == AuthUser.id)
        .filter(EEGReport.hospital_id == hospital_id)
        .order_by(EEGReport.created_at.desc())
        .all()
    )
    reports = [
        DevAdminReport(
            id=r.id,
            patient_name=r.patient_name,
            doctor_name=(
                f"{doc_first or ''} {doc_last or ''}".strip() or None
            ),
            is_finalized=r.is_finalized,
            has_pdf=bool(r.pdf_file_path),
            created_at=r.created_at,
            file_id=r.file_id,
        )
        for r, doc_first, doc_last in report_rows
    ]

    return DevAdminHospitalDetail(
        **summary.model_dump(),
        staff=staff,
        files=files,
        reports=reports,
    )


@router.get("/contacts", response_model=DevAdminContactListResponse)
async def list_contacts(
    skip: PageOffset = 0,
    limit: PageLimit = 20,
    unread_only: bool = False,
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """List contact form submissions with pagination"""
    query = db.query(ContactSubmission)
    if unread_only:
        query = query.filter(ContactSubmission.is_read == False)

    total = query.count()
    unread_count = (
        db.query(func.count(ContactSubmission.id))
        .filter(ContactSubmission.is_read == False)
        .scalar()
        or 0
    )
    items = query.order_by(ContactSubmission.created_at.desc()).offset(skip).limit(limit).all()

    return DevAdminContactListResponse(
        items=[DevAdminContact.model_validate(c) for c in items],
        total=total,
        unread_count=unread_count,
    )


@router.put("/contacts/{contact_id}/read", response_model=DevAdminContact)
async def toggle_contact_read(
    contact_id: ResourceId,
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Toggle is_read on a contact submission"""
    contact = db.query(ContactSubmission).filter(ContactSubmission.id == contact_id).first()
    if not contact:
        raise HTTPException(404, detail="Contact submission not found")

    contact.is_read = not contact.is_read
    db.commit()
    db.refresh(contact)
    return DevAdminContact.model_validate(contact)


@router.get("/hospitals/{hospital_id}/files/{file_id}/download")
async def download_hospital_file(
    hospital_id: ResourceId,
    file_id: ResourceId,
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Download a single EEG signal file"""
    signal_file = (
        db.query(SignalFile)
        .filter(SignalFile.id == file_id, SignalFile.hospital_id == hospital_id)
        .first()
    )
    if not signal_file:
        raise HTTPException(404, detail="File not found")

    try:
        data = storage_service.download(SIGNALS_BUCKET, signal_file.file_path)
    except Exception as e:
        logger.error(f"Failed to download file {file_id}: {e}")
        raise HTTPException(500, detail="File download failed")

    return StreamingResponse(
        iter([data]),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{signal_file.original_filename}"'
        },
    )


@router.get("/hospitals/{hospital_id}/reports/{report_id}/download")
async def download_hospital_report(
    hospital_id: ResourceId,
    report_id: ResourceId,
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Download a single EEG report PDF"""
    report = (
        db.query(EEGReport)
        .filter(EEGReport.id == report_id, EEGReport.hospital_id == hospital_id)
        .first()
    )
    if not report:
        raise HTTPException(404, detail="Report not found")
    if not report.pdf_file_path:
        raise HTTPException(404, detail="PDF not available for this report")

    try:
        data = storage_service.download(SIGNALS_BUCKET, report.pdf_file_path)
    except Exception as e:
        logger.error(f"Failed to download report {report_id}: {e}")
        raise HTTPException(500, detail="PDF download failed")

    safe_name = f"report_{report.patient_name.replace(' ', '_')}_{report_id}.pdf"
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.get("/hospitals/{hospital_id}/download")
async def bulk_download_hospital(
    hospital_id: ResourceId,
    _: AuthUser = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Stream a ZIP archive of all EEG files and PDFs for a hospital"""
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(404, detail="Hospital not found")

    signal_files = (
        db.query(SignalFile).filter(SignalFile.hospital_id == hospital_id).all()
    )
    reports = (
        db.query(EEGReport)
        .filter(EEGReport.hospital_id == hospital_id, EEGReport.pdf_file_path != None)
        .all()
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for sf in signal_files:
            try:
                data = storage_service.download(SIGNALS_BUCKET, sf.file_path)
                if data:
                    zf.writestr(f"edf/{sf.original_filename}", data)
            except Exception as e:
                logger.warning(f"Skipping file {sf.id} in ZIP: {e}")

        for r in reports:
            try:
                data = storage_service.download(SIGNALS_BUCKET, r.pdf_file_path)
                if data:
                    safe_name = r.patient_name.replace(" ", "_").replace("/", "_")
                    zf.writestr(f"reports/{safe_name}_{r.id}.pdf", data)
            except Exception as e:
                logger.warning(f"Skipping report {r.id} in ZIP: {e}")

    buf.seek(0)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"ceresignal_{hospital.code}_{timestamp}.zip"

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
