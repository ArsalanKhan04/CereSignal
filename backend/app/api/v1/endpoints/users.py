"""
User management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import date
import os

from app.core.database import get_db
from app.core.auth import get_current_active_user
from app.models.user import User
from app.models.auth import AuthUser, UserType
from app.models.signal import SignalFile
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse

router = APIRouter()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new patient for the authenticated user (doctors and technicians only)"""

    # Only doctors and technicians can create patients
    if current_user.user_type == UserType.PATIENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patients cannot create other users",
        )

    # Check if email already exists
    if user_data.email:
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    # Check if medical_id already exists
    if user_data.medical_id:
        existing_user = (
            db.query(User).filter(User.medical_id == user_data.medical_id).first()
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Medical ID already exists",
            )

    if not user_data.phone or not user_data.phone.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone is required",
        )

    if not user_data.gender:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gender is required",
        )

    if user_data.age is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Age is required",
        )

    if user_data.age < 0 or user_data.age > 130:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Age must be between 0 and 130",
        )

    try:
        # Create new patient associated with the authenticated user
        user_dict = user_data.dict()

        # Handle doctor assignment for technicians
        if current_user.user_type == UserType.TECHNICIAN.value:
            if user_data.doctor_id:
                # Verify the doctor exists and is active
                doctor = (
                    db.query(AuthUser)
                    .filter(
                        AuthUser.id == user_data.doctor_id,
                        AuthUser.user_type == UserType.DOCTOR.value,
                        AuthUser.is_active == True,
                    )
                    .first()
                )
                if not doctor:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid doctor ID or doctor not found",
                    )
                user_dict["auth_user_id"] = user_data.doctor_id
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Doctor assignment is required when creating patients as a technician",
                )
        else:
            # For doctors, assign to themselves
            user_dict["auth_user_id"] = current_user.id

        # Remove doctor_id from dict as it's not a User model field
        user_dict.pop("doctor_id", None)

        # Convert empty strings to None for optional fields to avoid unique constraint issues
        if user_dict.get("medical_id") == "":
            user_dict["medical_id"] = None
        if user_dict.get("email") == "":
            user_dict["email"] = None
        if user_dict.get("phone") == "":
            user_dict["phone"] = None
        if user_dict.get("notes") == "":
            user_dict["notes"] = None
        if user_dict.get("date_of_birth") == "":
            user_dict["date_of_birth"] = None

        if user_dict.get("date_of_birth"):
            birth_date = user_dict["date_of_birth"].date()
            today = date.today()
            if birth_date > today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Date of birth cannot be in the future",
                )
            if user_dict.get("age") is None:
                user_dict["age"] = (
                    today.year
                    - birth_date.year
                    - ((today.month, today.day) < (birth_date.month, birth_date.day))
                )
            else:
                calculated_age = (
                    today.year
                    - birth_date.year
                    - ((today.month, today.day) < (birth_date.month, birth_date.day))
                )
                if user_dict["age"] != calculated_age:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Age does not match date of birth",
                    )

        if user_dict.get("age") is not None and user_dict.get("date_of_birth"):
            birth_date = user_dict["date_of_birth"].date()
            today = date.today()
            calculated_age = (
                today.year
                - birth_date.year
                - ((today.month, today.day) < (birth_date.month, birth_date.day))
            )
            if user_dict["age"] != calculated_age:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Age does not match date of birth",
                )

        db_user = User(**user_dict)

        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        # Attach doctor_name to response
        doc = db.query(AuthUser).filter(AuthUser.id == db_user.auth_user_id).first()
        if doc:
            doc_name = f"{(doc.title + ' ') if doc.title else ''}{doc.first_name or ''} {doc.last_name or ''}".strip()
            setattr(db_user, "doctor_name", doc_name)
        else:
            setattr(db_user, "doctor_name", None)

        return db_user

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating user: {str(e)}",
        )


@router.get("/", response_model=List[UserListResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get list of patients for the authenticated user with optional search"""

    # Patients can only see their own record
    if current_user.user_type == UserType.PATIENT.value:
        patient_user = (
            db.query(User).filter(User.patient_auth_user_id == current_user.id).first()
        )
        if patient_user:
            return [patient_user]
        return []

    # Technicians can see all active patients
    if current_user.user_type == UserType.TECHNICIAN.value:
        query = db.query(User).filter(User.is_active == True)
    else:
        # Doctors see only patients assigned to them
        query = db.query(User).filter(
            User.auth_user_id == current_user.id, User.is_active == True
        )

    if search:
        query = query.filter(
            User.name.ilike(f"%{search}%")
            | User.email.ilike(f"%{search}%")
            | User.medical_id.ilike(f"%{search}%")
        )

    users = query.offset(skip).limit(limit).all()
    # Attach doctor name for each patient if available
    for u in users:
        doc = db.query(AuthUser).filter(AuthUser.id == u.auth_user_id).first()
        if doc:
            doc_name = f"{(doc.title + ' ') if doc.title else ''}{doc.first_name or ''} {doc.last_name or ''}".strip()
            setattr(u, "doctor_name", doc_name)
        else:
            setattr(u, "doctor_name", None)
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get specific user by ID"""

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Patients can only access their own record
    if current_user.user_type == UserType.PATIENT.value:
        if user.patient_auth_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access your own record",
            )
    # Doctors can only access their managed patients; technicians can access any patient
    else:
        if (
            current_user.user_type == UserType.DOCTOR.value
            and user.auth_user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access patients you manage",
            )

    # Attach doctor_name
    doc = db.query(AuthUser).filter(AuthUser.id == user.auth_user_id).first()
    if doc:
        doc_name = f"{(doc.title + ' ') if doc.title else ''}{doc.first_name or ''} {doc.last_name or ''}".strip()
        setattr(user, "doctor_name", doc_name)
    else:
        setattr(user, "doctor_name", None)
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update user information"""

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Patients can only update their own record
    if current_user.user_type == UserType.PATIENT.value:
        if user.patient_auth_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own record",
            )
    # Doctors can only update their managed patients; technicians can update any patient
    else:
        if (
            current_user.user_type == UserType.DOCTOR.value
            and user.auth_user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update patients you manage",
            )

    # Check email uniqueness if being updated
    if user_data.email and user_data.email != user.email:
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

    if user_data.phone is not None and not user_data.phone.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone is required",
        )

    if user_data.gender is not None and not user_data.gender:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gender is required",
        )

    if user_data.age is not None and (user_data.age < 0 or user_data.age > 130):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Age must be between 0 and 130",
        )

    # Check medical_id uniqueness if being updated
    if user_data.medical_id and user_data.medical_id != user.medical_id:
        existing_user = (
            db.query(User).filter(User.medical_id == user_data.medical_id).first()
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Medical ID already exists",
            )

    try:
        # Update user fields
        update_data = user_data.dict(exclude_unset=True)

        # Handle doctor reassignment separately
        doctor_id = update_data.pop("doctor_id", None)
        if doctor_id is not None:
            # Only technicians can reassign patients to a different doctor
            if current_user.user_type != UserType.TECHNICIAN.value:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only technicians can reassign patients to a different doctor",
                )
            # Verify doctor exists and is active
            doctor = (
                db.query(AuthUser)
                .filter(
                    AuthUser.id == doctor_id,
                    AuthUser.user_type == UserType.DOCTOR.value,
                    AuthUser.is_active == True,
                )
                .first()
            )
            if not doctor:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid doctor ID or doctor not found",
                )
            user.auth_user_id = doctor_id

        # Convert empty strings to None for optional fields to avoid unique constraint issues
        for field in ["medical_id", "email", "phone", "notes"]:
            if field in update_data and update_data[field] == "":
                update_data[field] = None

        if update_data.get("date_of_birth") == "":
            update_data["date_of_birth"] = None

        if update_data.get("date_of_birth"):
            birth_date = update_data["date_of_birth"].date()
            today = date.today()
            if birth_date > today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Date of birth cannot be in the future",
                )
            if update_data.get("age") is None:
                update_data["age"] = (
                    today.year
                    - birth_date.year
                    - ((today.month, today.day) < (birth_date.month, birth_date.day))
                )
            else:
                calculated_age = (
                    today.year
                    - birth_date.year
                    - ((today.month, today.day) < (birth_date.month, birth_date.day))
                )
                if update_data["age"] != calculated_age:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Age does not match date of birth",
                    )

        if update_data.get("age") is not None and update_data.get("date_of_birth"):
            birth_date = update_data["date_of_birth"].date()
            today = date.today()
            calculated_age = (
                today.year
                - birth_date.year
                - ((today.month, today.day) < (birth_date.month, birth_date.day))
            )
            if update_data["age"] != calculated_age:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Age does not match date of birth",
                )

        for field, value in update_data.items():
            setattr(user, field, value)

        db.commit()
        db.refresh(user)
        # Attach doctor_name to response
        doc = db.query(AuthUser).filter(AuthUser.id == user.auth_user_id).first()
        if doc:
            doc_name = f"{(doc.title + ' ') if doc.title else ''}{doc.first_name or ''} {doc.last_name or ''}".strip()
            setattr(user, "doctor_name", doc_name)
        else:
            setattr(user, "doctor_name", None)

        return user

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating user: {str(e)}",
        )


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a user and all associated files (soft delete user, hard delete files)"""

    # Only doctors and technicians can delete patients
    if current_user.user_type == UserType.PATIENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Patients cannot delete users"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Doctors can only delete managed patients; technicians can delete any patient
    if (
        current_user.user_type == UserType.DOCTOR.value
        and user.auth_user_id != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete patients you manage",
        )

    try:
        # Delete all associated signal files first (both physical files and database records)
        signal_files = db.query(SignalFile).filter(SignalFile.user_id == user_id).all()
        for file in signal_files:
            # Delete physical file from disk
            if os.path.exists(file.file_path):
                try:
                    os.remove(file.file_path)
                except OSError as e:
                    print(f"Warning: Could not delete file {file.file_path}: {e}")

            # Delete from database (cascade will handle related records)
            db.delete(file)

        # Soft delete - set is_active to False
        user.is_active = False
        db.commit()

        return {"message": "User and associated files deleted successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting user and files: {str(e)}",
        )


@router.get("/{user_id}/files", response_model=List[dict])
async def get_user_files(
    user_id: int,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all signal files for a specific user"""

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Patients can only access their own files
    if current_user.user_type == UserType.PATIENT.value:
        if user.patient_auth_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access your own files",
            )
    # Doctors can only access files of their managed patients; technicians can access any patient's files
    else:
        if (
            current_user.user_type == UserType.DOCTOR.value
            and user.auth_user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only access files of patients you manage",
            )

    files = db.query(User.signal_files).filter(User.id == user_id).all()
    return files
