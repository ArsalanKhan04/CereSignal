"""
Tenant and role scoping for signal files, reports and patient records.

Single source of truth for "which rows may this user see". Every endpoint that
reaches a SignalFile, an EEGReport or a patient User by id goes through the
dependencies here, so the rule is written once. Four hand-copied versions of the file check had drifted
apart in signals.py and none of them compared the hospital, which let a doctor at
any hospital read any study whose patient was unassigned.
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy import false, or_
from sqlalchemy.orm import Query, Session

from app.core.auth import get_current_active_user
from app.core.database import get_db
from app.models.auth import AuthUser, UserType
from app.models.report import EEGReport
from app.models.signal import SignalFile
from app.models.user import User
from app.schemas.field_types import ResourceId

FILE_NOT_FOUND = "Signal file not found"
REPORT_NOT_FOUND = "Report not found"
PATIENT_NOT_FOUND = "Patient not found"
DOCTOR_FILE_DENIED = "You can only access files for your patients"
DOCTOR_PATIENT_DENIED = "You can only access your own patients"


def _own_patient_record(db: Session, current_user: AuthUser) -> Optional[User]:
    """The User row a PATIENT auth account logs in as, if any."""
    return db.query(User).filter(User.patient_auth_user_id == current_user.id).first()


def visible_signal_files(db: Session, current_user: AuthUser) -> Query:
    """
    Query over SignalFile restricted to the rows current_user may see.

    Callers may further .filter() on SignalFile columns and .offset()/.limit().
    Do not add a second join on User: the doctor branch already joined it.
    """
    query = db.query(SignalFile)

    if current_user.is_superuser:
        return query

    if current_user.user_type == UserType.PATIENT.value:
        patient = _own_patient_record(db, current_user)
        if not patient:
            return query.filter(false())
        return query.filter(SignalFile.user_id == patient.id)

    # Staff. A staff account with no hospital cannot be scoped to a tenant, and
    # `SignalFile.hospital_id == None` compiles to "hospital_id IS NULL" — which
    # would hand every pre-multi-tenancy row to anyone who happens to have no
    # hospital set. Those rows stay reachable to superusers and to the patient
    # who owns them; nobody else.
    if current_user.hospital_id is None:
        return query.filter(false())

    if current_user.user_type == UserType.TECHNICIAN.value:
        return query.filter(SignalFile.hospital_id == current_user.hospital_id)

    # Doctors, admins and any future staff type: their hospital only, and only
    # patients assigned to them or not yet assigned to anyone.
    return query.join(User, SignalFile.user_id == User.id).filter(
        SignalFile.hospital_id == current_user.hospital_id,
        or_(User.auth_user_id == current_user.id, User.auth_user_id.is_(None)),
    )


def visible_reports(db: Session, current_user: AuthUser) -> Query:
    """
    Query over EEGReport restricted to the rows current_user may see.

    SignalFile is always joined, so callers may filter on SignalFile columns.
    get_reports did that without joining for technicians, which made SQLAlchemy
    emit a cross join and return the whole hospital's reports.
    """
    query = db.query(EEGReport).join(SignalFile, EEGReport.file_id == SignalFile.id)

    if current_user.is_superuser:
        return query

    if current_user.user_type == UserType.PATIENT.value:
        patient = _own_patient_record(db, current_user)
        if not patient:
            return query.filter(false())
        return query.filter(SignalFile.user_id == patient.id)

    if current_user.hospital_id is None:
        return query.filter(false())

    if current_user.user_type == UserType.TECHNICIAN.value:
        return query.filter(EEGReport.hospital_id == current_user.hospital_id)

    return query.join(User, SignalFile.user_id == User.id).filter(
        EEGReport.hospital_id == current_user.hospital_id,
        or_(User.auth_user_id == current_user.id, User.auth_user_id.is_(None)),
    )


def visible_patients(db: Session, current_user: AuthUser) -> Query:
    """
    Query over User (patient records) restricted to the rows current_user may see.

    Same shape as visible_signal_files, with one deliberate difference: admins see
    their whole hospital's patient list, as get_users always gave them. The users.py
    checks this replaces skipped the hospital comparison entirely for staff whose
    hospital_id was NULL, and let a doctor read another doctor's patients.
    """
    query = db.query(User)

    if current_user.is_superuser:
        return query

    if current_user.user_type == UserType.PATIENT.value:
        return query.filter(User.patient_auth_user_id == current_user.id)

    # See visible_signal_files: NULL would compile to IS NULL and match every
    # self-registered patient and every orphan default-patient row.
    if current_user.hospital_id is None:
        return query.filter(false())

    query = query.filter(User.hospital_id == current_user.hospital_id)

    if current_user.user_type in (UserType.TECHNICIAN.value, UserType.ADMIN.value):
        return query

    return query.filter(
        or_(User.auth_user_id == current_user.id, User.auth_user_id.is_(None))
    )


def get_accessible_patient(
    user_id: ResourceId,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> User:
    """
    Path-param dependency returning the patient User row, or raising 404/403 by the
    same rule as get_accessible_file.
    """
    patient = visible_patients(db, current_user).filter(User.id == user_id).first()
    if patient is not None:
        return patient

    in_tenant = (
        current_user.hospital_id is not None
        and not current_user.is_superuser
        and current_user.user_type != UserType.PATIENT.value
        and db.query(User.id)
        .filter(User.id == user_id, User.hospital_id == current_user.hospital_id)
        .first()
    )
    if in_tenant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=DOCTOR_PATIENT_DENIED
        )
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PATIENT_NOT_FOUND)


def _file_denial(db: Session, current_user: AuthUser, file_id: int) -> HTTPException:
    """
    403 only when the row is inside the caller's own hospital; 404 otherwise, so a
    sequential file id cannot be used to probe another hospital's inventory.
    """
    if (
        current_user.is_superuser
        or current_user.hospital_id is None
        or current_user.user_type == UserType.PATIENT.value
    ):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=FILE_NOT_FOUND
        )

    in_tenant = (
        db.query(SignalFile.id)
        .filter(
            SignalFile.id == file_id,
            SignalFile.hospital_id == current_user.hospital_id,
        )
        .first()
    )
    if not in_tenant:
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=FILE_NOT_FOUND
        )
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail=DOCTOR_FILE_DENIED
    )


def get_accessible_file(
    file_id: ResourceId,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> SignalFile:
    """
    Path-param dependency returning the SignalFile, or raising 404/403. Replaces
    the `db.query(SignalFile).filter(id == file_id).first()` + 404 preamble that
    opened every per-file handler.
    """
    file = (
        visible_signal_files(db, current_user).filter(SignalFile.id == file_id).first()
    )
    if file is None:
        raise _file_denial(db, current_user, file_id)
    return file


def get_accessible_report(
    report_id: ResourceId,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> EEGReport:
    """
    Path-param dependency returning the EEGReport, or raising 404. reports.py
    never returned 403 for an out-of-scope report, so this keeps returning 404.
    """
    report = visible_reports(db, current_user).filter(EEGReport.id == report_id).first()
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=REPORT_NOT_FOUND
        )
    return report


def forbid_patients(current_user: AuthUser, detail: str) -> None:
    """
    Read access does not imply write access: a patient may read their own study
    but may not annotate, relabel or delete it.
    """
    if current_user.user_type == UserType.PATIENT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
