"""
Authentication endpoints
"""

import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_user_token,
    get_current_active_user,
    get_current_admin_user,
    get_password_hash,
    verify_password,
)
from app.core.config import settings
from app.core.database import get_db
from app.core.logging_config import log_auth, log_error
from app.core.rate_limit import rate_limit
from app.models.auth import AuthUser, UserType
from app.models.hospital import Hospital, StaffInvitation
from app.models.user import User
from app.schemas.admin import (
    HospitalAdminRegister,
    InviteTokenValidation,
    StaffInviteRegister,
)
from app.schemas.auth import (
    AuthUserResponse,
    PasswordChange,
    PatientRegister,
    Token,
    TokenBody,
    UserLogin,
    UserRegister,
)

router = APIRouter()

# A patient portal link is a login, so it cannot stand forever. Measured from
# portal_sent_at; re-sending the email issues a new link and kills the old one.
PORTAL_LINK_TTL = timedelta(days=30)

SIGNUP_LIMIT = rate_limit("signup", limit=5, window_seconds=3600)
TOKEN_LIMIT = rate_limit("token", limit=10, window_seconds=60)


def _as_utc(value: datetime) -> datetime:
    """SQLite drops tzinfo on DateTime(timezone=True) columns, so a value read
    back is naive even though it was stored as UTC. Postgres returns it aware.
    Normalise both to aware UTC so comparisons don't raise TypeError."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@router.post(
    "/register/hospital",
    response_model=AuthUserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(SIGNUP_LIMIT)],
)
async def register_hospital_admin(
    data: HospitalAdminRegister, db: Session = Depends(get_db)
):
    """Register a new hospital and its first admin account"""
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    if db.query(AuthUser).filter(AuthUser.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")

    if db.query(AuthUser).filter(AuthUser.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        # Auto-generate a unique slug from hospital name
        import re
        base_code = re.sub(r"[^a-z0-9]+", "-", data.hospital_name.lower()).strip("-")[:48]
        code = base_code
        suffix = 1
        while db.query(Hospital).filter(Hospital.code == code).first():
            code = f"{base_code}-{suffix}"
            suffix += 1

        hospital = Hospital(
            name=data.hospital_name,
            code=code,
            address=data.hospital_address or None,
            phone=data.hospital_phone or None,
            email=str(data.hospital_email) if data.hospital_email else None,
        )
        db.add(hospital)
        db.flush()  # get hospital.id before creating admin

        admin = AuthUser(
            username=data.username,
            email=str(data.email),
            hashed_password=get_password_hash(data.password),
            user_type=UserType.ADMIN.value,
            first_name=data.first_name,
            last_name=data.last_name,
            hospital_id=hospital.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        return admin

    except Exception as e:
        db.rollback()
        log_error(e, "Error creating hospital")
        raise HTTPException(status_code=500, detail="Error creating hospital")


@router.post(
    "/invite/validate",
    response_model=InviteTokenValidation,
    dependencies=[Depends(TOKEN_LIMIT)],
)
async def validate_invite_token(body: TokenBody, db: Session = Depends(get_db)):
    """Validate a staff invitation token (public, no auth)"""
    invitation = db.query(StaffInvitation).filter(StaffInvitation.token == body.token).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.used_at is not None:
        raise HTTPException(status_code=410, detail="This invitation has already been used")

    if _as_utc(invitation.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invitation has expired")

    hospital = db.query(Hospital).filter(Hospital.id == invitation.hospital_id).first()

    return InviteTokenValidation(
        email=invitation.invited_email,
        role=invitation.role,
        hospital_name=hospital.name if hospital else "Unknown Hospital",
        hospital_id=invitation.hospital_id,
    )


@router.post(
    "/register/invite",
    response_model=AuthUserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(TOKEN_LIMIT)],
)
async def register_from_invite(data: StaffInviteRegister, db: Session = Depends(get_db)):
    """Complete staff registration via an invitation token"""
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    invitation = db.query(StaffInvitation).filter(StaffInvitation.token == data.token).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.used_at is not None:
        raise HTTPException(status_code=410, detail="This invitation has already been used")
    if _as_utc(invitation.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invitation has expired")

    if db.query(AuthUser).filter(AuthUser.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Email is authoritative from the invitation — prevent substitution
    if db.query(AuthUser).filter(AuthUser.email == invitation.invited_email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    try:
        staff = AuthUser(
            username=data.username,
            email=invitation.invited_email,
            hashed_password=get_password_hash(data.password),
            user_type=invitation.role,
            first_name=data.first_name,
            last_name=data.last_name,
            title=data.title or None,
            specialization=data.specialization or None,
            license_number=data.license_number or None,
            phone=data.phone or None,
            about=data.about or None,
            years_experience=data.years_experience,
            hospital_id=invitation.hospital_id,
            is_active=True,
        )
        db.add(staff)
        invitation.used_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(staff)
        return staff

    except Exception as e:
        db.rollback()
        log_error(e, "Error creating staff account")
        raise HTTPException(status_code=500, detail="Error creating staff account")


@router.post(
    "/register", response_model=AuthUserResponse, status_code=status.HTTP_201_CREATED
)
async def register_user(
    user_data: UserRegister,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_admin_user),
):
    """Register a new authentication user (doctor or technician)"""

    # Validate password confirmation
    if user_data.password != user_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match"
        )

    # Validate user type (only doctor and technician can use this endpoint)
    if user_data.user_type == UserType.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use /register/patient endpoint for patient registration",
        )

    # Check if username already exists
    existing_user = (
        db.query(AuthUser).filter(AuthUser.username == user_data.username).first()
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    # Check if email already exists
    existing_email = (
        db.query(AuthUser).filter(AuthUser.email == user_data.email).first()
    )
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Validate required fields for doctors/technicians
    if not user_data.first_name or not user_data.last_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="First name and last name are required for doctors and technicians",
        )

    try:
        # Create new user
        hashed_password = get_password_hash(user_data.password)

        # Convert empty strings to None for optional fields
        # Ensure user_type is the string value (lowercase) - handle both enum and string
        if isinstance(user_data.user_type, UserType):
            user_type_value = user_data.user_type.value
        elif isinstance(user_data.user_type, str):
            user_type_value = user_data.user_type.lower()
        else:
            user_type_value = UserType.DOCTOR.value  # Default fallback

        db_user = AuthUser(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password,
            user_type=user_type_value,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            title=user_data.title if user_data.title else None,
            specialization=(
                user_data.specialization if user_data.specialization else None
            ),
            license_number=(
                user_data.license_number if user_data.license_number else None
            ),
            phone=user_data.phone if user_data.phone else None,
            about=user_data.about if user_data.about else None,
            hospital_affiliation=(
                user_data.hospital_affiliation
                if user_data.hospital_affiliation
                else None
            ),
            years_experience=(
                user_data.years_experience if user_data.years_experience else None
            ),
            hospital_id=current_user.hospital_id,
        )

        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        return db_user

    except Exception as e:
        db.rollback()
        log_error(e, "Error creating user")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating user",
        )


@router.post(
    "/register/patient",
    response_model=AuthUserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(SIGNUP_LIMIT)],
)
async def register_patient(
    patient_data: PatientRegister, db: Session = Depends(get_db)
):
    """Register a new patient (creates both AuthUser and User records)"""

    # Validate password confirmation
    if patient_data.password != patient_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match"
        )

    # Check if username already exists
    existing_user = (
        db.query(AuthUser).filter(AuthUser.username == patient_data.username).first()
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    # Check if email already exists in AuthUser
    existing_email_auth = (
        db.query(AuthUser).filter(AuthUser.email == patient_data.email).first()
    )
    if existing_email_auth:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Check if email already exists in User
    if patient_data.email:
        existing_email_user = (
            db.query(User).filter(User.email == patient_data.email).first()
        )
        if existing_email_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    # Check if medical_id already exists
    if patient_data.medical_id:
        existing_medical_id = (
            db.query(User).filter(User.medical_id == patient_data.medical_id).first()
        )
        if existing_medical_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Medical ID already exists",
            )

    try:
        # Create AuthUser for patient
        hashed_password = get_password_hash(patient_data.password)
        db_auth_user = AuthUser(
            username=patient_data.username,
            email=patient_data.email,
            hashed_password=hashed_password,
            user_type=UserType.PATIENT.value,  # Use enum value (lowercase string 'patient')
            first_name=None,  # Patients use 'name' field instead
            last_name=None,
        )

        db.add(db_auth_user)
        db.flush()  # Flush to get the ID

        # Create User record for patient
        user_dict = {
            "name": patient_data.name,
            "email": patient_data.email,
            "phone": patient_data.phone,
            "date_of_birth": patient_data.date_of_birth,
            "age": patient_data.age,
            "gender": patient_data.gender,
            "medical_id": patient_data.medical_id,
            "address": patient_data.address,
            "emergency_contact_name": patient_data.emergency_contact_name,
            "emergency_contact_phone": patient_data.emergency_contact_phone,
            "referred_by": patient_data.referred_by,
            "blood_type": patient_data.blood_type,
            "allergies": patient_data.allergies,
            "medical_conditions": patient_data.medical_conditions,
            "current_medications": patient_data.current_medications,
            "patient_auth_user_id": db_auth_user.id,  # Link patient to their auth account
        }

        # Blank -> None for the plain optional fields. The constrained ones (phone,
        # gender, blood_type, emergency_contact_phone, email) never arrive as "" any
        # more -- BlankAsNone normalises them in the schema -- but address, allergies,
        # medical_id and friends are unconstrained and still reach this point as "".
        for field in [
            "medical_id",
            "email",
            "phone",
            "address",
            "referred_by",
            "emergency_contact_name",
            "emergency_contact_phone",
            "blood_type",
            "allergies",
            "medical_conditions",
            "current_medications",
            "gender",
        ]:
            if field in user_dict and user_dict[field] == "":
                user_dict[field] = None

        if "age" in user_dict and user_dict["age"] == "":
            user_dict["age"] = None

        # Handle date_of_birth: Pydantic should already convert string to datetime,
        # but ensure None is set for empty values
        if "date_of_birth" in user_dict and (
            user_dict["date_of_birth"] == "" or user_dict["date_of_birth"] is None
        ):
            user_dict["date_of_birth"] = None

        db_patient_user = User(**user_dict)
        db.add(db_patient_user)
        db.commit()
        db.refresh(db_auth_user)

        return db_auth_user

    except Exception as e:
        db.rollback()
        log_error(e, "Error creating patient")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating patient",
        )


@router.post(
    "/login",
    response_model=Token,
    dependencies=[Depends(rate_limit("login", limit=10, window_seconds=60))],
)
async def login_user(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Login user and return access token"""

    # Authenticate user
    user = (
        db.query(AuthUser)
        .filter(AuthUser.username == user_credentials.username)
        .first()
    )

    if not user or not verify_password(user_credentials.password, user.hashed_password):
        log_auth("LOGIN", username=user_credentials.username, success=False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        log_auth(
            "LOGIN_INACTIVE", user_id=user.id, username=user.username, success=False
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    access_token = create_user_token(user)

    log_auth("LOGIN", user_id=user.id, username=user.username, success=True)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


DESKTOP_USERNAME = "desktop"


@router.post("/desktop-session", response_model=Token)
async def desktop_session(
    x_desktop_secret: str = Header(""),
    db: Session = Depends(get_db),
):
    """
    Sign the desktop app in as its local doctor, with no login form.

    main.js generates DESKTOP_SESSION_SECRET per launch and gives it only to this
    process and its own window, so nothing else on the machine can call this. Outside
    desktop mode the route does not exist.
    """
    if not (settings.DESKTOP_MODE and settings.DESKTOP_SESSION_SECRET):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if not hmac.compare_digest(
        x_desktop_secret.encode(), settings.DESKTOP_SESSION_SECRET.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid desktop session secret",
        )

    user = db.query(AuthUser).filter(AuthUser.username == DESKTOP_USERNAME).first()
    if not user:
        # Staff need a hospital: app/core/access.py scopes a hospital-less account to nothing.
        hospital = db.query(Hospital).filter(Hospital.code == "desktop").first()
        if not hospital:
            hospital = Hospital(name="Desktop", code="desktop", is_active=True)
            db.add(hospital)
            db.flush()
        user = AuthUser(
            username=DESKTOP_USERNAME,
            email="desktop@desktop.local",
            # Random and never shown, so this account can never use /auth/login.
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),
            user_type=UserType.DOCTOR.value,
            first_name="Desktop",
            last_name="Doctor",
            hospital_id=hospital.id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    access_token = create_user_token(user)
    log_auth("DESKTOP_SESSION", user_id=user.id, username=user.username, success=True)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@router.post("/patient-portal", response_model=Token, dependencies=[Depends(TOKEN_LIMIT)])
async def patient_portal_access(body: TokenBody, db: Session = Depends(get_db)):
    """Exchange a patient portal token for a session JWT (public, no auth required)."""
    token = body.token
    patient = db.query(User).filter(User.portal_token == token).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid portal link")
    if (
        patient.portal_sent_at is None
        or _as_utc(patient.portal_sent_at) + PORTAL_LINK_TTL < datetime.now(timezone.utc)
    ):
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="This portal link has expired"
        )

    auth_user = None
    if patient.patient_auth_user_id:
        auth_user = db.query(AuthUser).filter(AuthUser.id == patient.patient_auth_user_id).first()

    if not auth_user:
        base_username = f"patient-{patient.id}"
        username = base_username
        suffix = 1
        while db.query(AuthUser).filter(AuthUser.username == username).first():
            username = f"{base_username}-{suffix}"
            suffix += 1

        email = patient.email
        if email and db.query(AuthUser).filter(AuthUser.email == email).first():
            email = None
        if not email:
            email = f"patient-{patient.id}@placeholder.local"

        auth_user = AuthUser(
            username=username,
            email=email,
            hashed_password=get_password_hash(str(token)),
            user_type=UserType.PATIENT.value,
        )
        db.add(auth_user)
        db.flush()
        patient.patient_auth_user_id = auth_user.id

    if not auth_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")

    auth_user.last_login = datetime.now(timezone.utc)
    db.commit()

    access_token = create_user_token(auth_user)
    return {"access_token": access_token, "token_type": "bearer", "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.get("/me", response_model=AuthUserResponse)
async def get_current_user_info(
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get current user information"""
    response = AuthUserResponse.model_validate(current_user)
    if current_user.hospital_id:
        hospital = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
        if hospital:
            response.hospital_name = hospital.name
    return response


@router.put("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Change user password"""

    # Validate new password confirmation
    if password_data.new_password != password_data.confirm_new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="New passwords do not match"
        )

    # Verify current password
    if not verify_password(
        password_data.current_password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    try:
        # Update password
        current_user.hashed_password = get_password_hash(password_data.new_password)
        db.commit()

        return {"message": "Password changed successfully"}

    except Exception as e:
        db.rollback()
        log_error(e, "Error changing password")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error changing password",
        )


@router.post("/logout")
async def logout_user(current_user: AuthUser = Depends(get_current_active_user)):
    """Logout user (client should discard token)"""
    return {"message": "Successfully logged out"}


@router.get("/doctors", response_model=List[AuthUserResponse])
async def get_doctors(
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get list of all doctors (for technicians to assign patients)"""

    # Only technicians and doctors can access this endpoint
    if current_user.user_type not in [UserType.TECHNICIAN.value, UserType.DOCTOR.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only technicians and doctors can access this endpoint",
        )

    doctors = (
        db.query(AuthUser)
        .filter(
            AuthUser.user_type == UserType.DOCTOR.value,
            AuthUser.is_active == True,
            AuthUser.hospital_id == current_user.hospital_id,
        )
        .all()
    )

    return doctors
