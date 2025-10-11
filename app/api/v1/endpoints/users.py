"""
User management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.auth import get_current_active_user
from app.models.user import User
from app.models.auth import AuthUser
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse

router = APIRouter()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new patient for the authenticated user"""
    
    # Check if email already exists
    if user_data.email:
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
    
    # Check if medical_id already exists
    if user_data.medical_id:
        existing_user = db.query(User).filter(User.medical_id == user_data.medical_id).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Medical ID already exists"
            )
    
    try:
        # Create new patient associated with the authenticated user
        user_dict = user_data.dict()
        user_dict['auth_user_id'] = current_user.id
        db_user = User(**user_dict)
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return db_user
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating user: {str(e)}"
        )


@router.get("/", response_model=List[UserListResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    current_user: AuthUser = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get list of patients for the authenticated user with optional search"""
    
    query = db.query(User).filter(User.auth_user_id == current_user.id)
    
    if search:
        query = query.filter(
            User.name.ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%") |
            User.medical_id.ilike(f"%{search}%")
        )
    
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Get specific user by ID"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db)
):
    """Update user information"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check email uniqueness if being updated
    if user_data.email and user_data.email != user.email:
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
    
    # Check medical_id uniqueness if being updated
    if user_data.medical_id and user_data.medical_id != user.medical_id:
        existing_user = db.query(User).filter(User.medical_id == user_data.medical_id).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Medical ID already exists"
            )
    
    try:
        # Update user fields
        update_data = user_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        
        db.commit()
        db.refresh(user)
        
        return user
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating user: {str(e)}"
        )


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Delete a user (soft delete by setting is_active=False)"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    try:
        # Soft delete - set is_active to False
        user.is_active = False
        db.commit()
        
        return {"message": "User deactivated successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deactivating user: {str(e)}"
        )


@router.get("/{user_id}/files", response_model=List[dict])
async def get_user_files(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Get all signal files for a specific user"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    files = db.query(User.signal_files).filter(User.id == user_id).all()
    return files