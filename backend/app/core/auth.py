"""
Authentication utilities
"""

import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.auth import AuthUser, UserType
from app.schemas.auth import TokenData

# JWT settings
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

# Security scheme
security = HTTPBearer(auto_error=False)


# bcrypt reads only the first 72 bytes of a password. bcrypt<4, which passlib used
# to wrap, truncated longer ones silently; bcrypt 5 raises ValueError instead. No
# password schema sets a max_length, so truncate here: otherwise a long password is
# a 500, and an account created with one under the old stack can never log in.
BCRYPT_MAX_PASSWORD_BYTES = 72


def _bcrypt_input(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_PASSWORD_BYTES]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(_bcrypt_input(plain_password), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return bcrypt.hashpw(_bcrypt_input(password), bcrypt.gensalt()).decode("utf-8")


def _password_fingerprint(hashed_password: str) -> str:
    """
    A short keyed digest of the stored hash, carried in every token as ``pwd``.

    Changing the password changes the hash, so every token minted before the change
    stops matching — session invalidation without a column to migrate. Keyed, so the
    claim reveals nothing about the hash to whoever reads the token.
    """
    digest = hmac.new(SECRET_KEY.encode(), hashed_password.encode(), hashlib.sha256)
    return digest.hexdigest()[:16]


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


def create_user_token(user: AuthUser) -> str:
    """The session token for a user. get_current_user accepts nothing else."""
    return create_access_token(
        {
            "sub": user.username,
            "user_id": user.id,
            "pwd": _password_fingerprint(user.hashed_password),
        }
    )


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

        token_data = TokenData(username=username, user_id=user_id, pwd=payload.get("pwd"))
        return token_data

    except JWTError:
        raise credentials_exception


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[AuthUser]:
    """Get the current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    try:
        token = credentials.credentials
        token_data = verify_token(token)

        user = db.query(AuthUser).filter(AuthUser.username == token_data.username).first()
        if user is None:
            raise credentials_exception

        # Minted before the password last changed (or not by create_user_token).
        if not token_data.pwd or not hmac.compare_digest(
            token_data.pwd, _password_fingerprint(user.hashed_password)
        ):
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


def get_current_admin_user(current_user: AuthUser = Depends(get_current_active_user)) -> AuthUser:
    """Require that the current user is a hospital ADMIN"""
    if current_user.user_type != UserType.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    if not current_user.hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin must be associated with a hospital"
        )
    return current_user
