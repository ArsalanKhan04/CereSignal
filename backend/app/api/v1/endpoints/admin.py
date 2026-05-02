"""
Admin endpoints — hospital-scoped staff and invitation management
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin_user
from app.core.database import get_db
from app.models.auth import AuthUser, UserType
from app.models.hospital import Hospital, StaffInvitation
from app.models.report import EEGReport
from app.models.signal import SignalFile
from app.models.user import User
from app.schemas.admin import (
    AdminStatsResponse,
    InviteCreate,
    InviteListResponse,
    InviteResponse,
    StaffMemberResponse,
)
from app.services.email_service import send_invitation_email

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/invite", response_model=InviteResponse, status_code=201)
async def create_invitation(
    data: InviteCreate,
    current_user: AuthUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Invite a doctor or technician to join this hospital"""
    hid = current_user.hospital_id

    # Check for existing active account with this email in this hospital
    existing = db.query(AuthUser).filter(
        AuthUser.email == str(data.email),
        AuthUser.hospital_id == hid,
    ).first()
    if existing:
        raise HTTPException(400, detail="A user with this email already exists in this hospital")

    # Check for already-pending invitation
    pending = db.query(StaffInvitation).filter(
        StaffInvitation.invited_email == str(data.email),
        StaffInvitation.hospital_id == hid,
        StaffInvitation.used_at == None,
        StaffInvitation.expires_at > datetime.now(timezone.utc),
    ).first()
    if pending:
        raise HTTPException(400, detail="A pending invitation already exists for this email")

    token = str(uuid.uuid4())
    invitation = StaffInvitation(
        hospital_id=hid,
        invited_email=str(data.email),
        role=data.role,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        created_by=current_user.id,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    hospital = db.query(Hospital).filter(Hospital.id == hid).first()
    try:
        await send_invitation_email(
            to_email=str(data.email),
            hospital_name=hospital.name if hospital else "Your Hospital",
            role=data.role,
            token=token,
        )
    except Exception as e:
        logger.warning(f"Invitation saved but email failed: {e}")

    return invitation


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    current_user: AuthUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Get hospital-scoped statistics"""
    hid = current_user.hospital_id

    total_doctors = db.query(func.count(AuthUser.id)).filter(
        AuthUser.hospital_id == hid,
        AuthUser.user_type == UserType.DOCTOR.value,
        AuthUser.is_active == True,
    ).scalar() or 0

    total_technicians = db.query(func.count(AuthUser.id)).filter(
        AuthUser.hospital_id == hid,
        AuthUser.user_type == UserType.TECHNICIAN.value,
        AuthUser.is_active == True,
    ).scalar() or 0

    total_patients = db.query(func.count(User.id)).filter(
        User.hospital_id == hid,
        User.is_active == True,
    ).scalar() or 0

    pending_reports = db.query(func.count(SignalFile.id)).filter(
        SignalFile.hospital_id == hid,
        SignalFile.processing_status.in_(["pending", "processing"]),
    ).scalar() or 0

    completed_reports = db.query(func.count(SignalFile.id)).filter(
        SignalFile.hospital_id == hid,
        SignalFile.processing_status == "completed",
    ).scalar() or 0

    pending_invitations = db.query(func.count(StaffInvitation.id)).filter(
        StaffInvitation.hospital_id == hid,
        StaffInvitation.used_at == None,
        StaffInvitation.expires_at > datetime.now(timezone.utc),
    ).scalar() or 0

    return AdminStatsResponse(
        total_patients=total_patients,
        total_doctors=total_doctors,
        total_technicians=total_technicians,
        pending_reports=pending_reports,
        completed_reports=completed_reports,
        pending_invitations=pending_invitations,
    )


@router.get("/staff", response_model=List[StaffMemberResponse])
async def list_staff(
    current_user: AuthUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """List all doctors and technicians in this hospital"""
    staff = db.query(AuthUser).filter(
        AuthUser.hospital_id == current_user.hospital_id,
        AuthUser.user_type.in_([UserType.DOCTOR.value, UserType.TECHNICIAN.value]),
    ).order_by(AuthUser.user_type, AuthUser.last_name).all()
    return staff


@router.put("/staff/{user_id}/toggle-active")
async def toggle_staff_active(
    user_id: int,
    current_user: AuthUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """Activate or deactivate a staff member"""
    member = db.query(AuthUser).filter(
        AuthUser.id == user_id,
        AuthUser.hospital_id == current_user.hospital_id,
        AuthUser.user_type.in_([UserType.DOCTOR.value, UserType.TECHNICIAN.value]),
    ).first()
    if not member:
        raise HTTPException(404, detail="Staff member not found")

    member.is_active = not member.is_active
    db.commit()
    return {"id": member.id, "is_active": member.is_active}


@router.get("/invitations", response_model=List[InviteListResponse])
async def list_invitations(
    current_user: AuthUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    """List all invitations for this hospital (token omitted for security)"""
    invitations = db.query(StaffInvitation).filter(
        StaffInvitation.hospital_id == current_user.hospital_id,
    ).order_by(StaffInvitation.created_at.desc()).all()
    return invitations
