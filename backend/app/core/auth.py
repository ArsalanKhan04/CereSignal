"""
Authentication utilities
"""

from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError  # <-- Added import to catch race condition

from app.core.config import settings
from app.core.database import get_db
from app.models.auth import AuthUser, UserType
from app.schemas.auth import TokenData

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

# Security scheme
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> TokenData:
    """Verify and decode a JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user_id = payload.get("user_id")
        
        if username is None or user_id is None:
            raise credentials_exception
        
        token_data = TokenData(username=username, user_id=user_id)
        return token_data
        
    except JWTError:
        raise credentials_exception


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[AuthUser]:
    """Get the current authenticated user"""
    if settings.DESKTOP_MODE:
        desktop_user = db.query(AuthUser).filter(AuthUser.username == "desktop").first()
        if desktop_user:
            return desktop_user
            
        # --- FIX: Added try/except to handle race condition ---
        try:
            desktop_user = AuthUser(
                username="desktop",
                email="desktop@local",
                hashed_password=get_password_hash("desktop"),
                user_type=UserType.TECHNICIAN.value,
                is_active=True,
                is_superuser=False,
            )
            db.add(desktop_user)
            db.commit()
            db.refresh(desktop_user)
            return desktop_user
        except IntegrityError:
            # Another concurrent request already created the user!
            db.rollback() # Clear the failed transaction
            # Fetch the newly created user instead
            desktop_user = db.query(AuthUser).filter(AuthUser.username == "desktop").first()
            if desktop_user:
                return desktop_user
        # ------------------------------------------------------
        
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        if settings.DESKTOP_MODE:
            return None
        raise credentials_exception
    
    try:
        token = credentials.credentials
        token_data = verify_token(token)
        
        user = db.query(AuthUser).filter(AuthUser.username == token_data.username).first()
        if user is None:
            raise credentials_exception
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Inactive user"
            )
        
        return user
        
    except JWTError:
        raise credentials_exception


def get_current_active_user(current_user: Optional[AuthUser] = Depends(get_current_user)) -> Optional[AuthUser]:
    """Get the current active user"""
    if settings.DESKTOP_MODE and current_user is None:
        return None

    if not current_user or not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


def get_current_superuser(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
    """Get the current superuser"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user