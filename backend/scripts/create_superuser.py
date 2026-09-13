"""
Bootstrap script: create the first dev-admin (superuser) account.

Usage (from backend/ directory):
    python -m scripts.create_superuser
"""

import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.auth import get_password_hash
from app.core.database import SessionLocal
from app.models.auth import AuthUser, UserType


def main():
    print("=== CereSignal: Create Dev Superuser ===\n")

    username = input("Username: ").strip()
    if not username:
        print("Username cannot be empty.")
        sys.exit(1)

    email = input("Email: ").strip()
    if not email:
        print("Email cannot be empty.")
        sys.exit(1)

    first_name = input("First name: ").strip()
    last_name = input("Last name: ").strip()

    password = getpass.getpass("Password (min 6 chars): ")
    if len(password) < 6:
        print("Password must be at least 6 characters.")
        sys.exit(1)

    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    db = SessionLocal()
    try:
        if db.query(AuthUser).filter(AuthUser.username == username).first():
            print(f"Username '{username}' is already taken.")
            sys.exit(1)
        if db.query(AuthUser).filter(AuthUser.email == email).first():
            print(f"Email '{email}' is already registered.")
            sys.exit(1)

        superuser = AuthUser(
            username=username,
            email=email,
            hashed_password=get_password_hash(password),
            user_type=UserType.ADMIN.value,
            first_name=first_name or None,
            last_name=last_name or None,
            is_active=True,
            is_superuser=True,
            hospital_id=None,
        )
        db.add(superuser)
        db.commit()
        print(f"\nSuperuser '{username}' created successfully.")
        print("Log in at /login — you will be redirected to /dev-admin.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
