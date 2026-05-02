"""
Bootstrap script: create the first hospital + admin account.

Usage (from backend/ directory):
    python -m scripts.create_admin
    # or
    python scripts/create_admin.py
"""

import sys
import os
import getpass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.core.auth import get_password_hash
from app.models.hospital import Hospital
from app.models.auth import AuthUser, UserType


def main():
    print("=== CereSignal: Create First Hospital Admin ===\n")

    hospital_name = input("Hospital name: ").strip()
    hospital_code = input("Hospital code (letters/numbers/hyphens, e.g. city-general): ").strip()
    hospital_address = input("Address (optional, press Enter to skip): ").strip() or None
    hospital_phone = input("Phone (optional): ").strip() or None
    hospital_email = input("Hospital email (optional): ").strip() or None

    print()
    admin_first = input("Admin first name: ").strip()
    admin_last = input("Admin last name: ").strip()
    admin_username = input("Admin username: ").strip()
    admin_email = input("Admin email: ").strip()
    admin_password = getpass.getpass("Admin password: ")
    confirm = getpass.getpass("Confirm password: ")

    if admin_password != confirm:
        print("Passwords do not match. Aborting.")
        sys.exit(1)

    db = SessionLocal()
    try:
        if db.query(Hospital).filter(Hospital.code == hospital_code).first():
            print(f"Hospital code '{hospital_code}' is already in use.")
            sys.exit(1)

        if db.query(AuthUser).filter(AuthUser.username == admin_username).first():
            print(f"Username '{admin_username}' is already taken.")
            sys.exit(1)

        hospital = Hospital(
            name=hospital_name,
            code=hospital_code,
            address=hospital_address,
            phone=hospital_phone,
            email=hospital_email,
        )
        db.add(hospital)
        db.flush()

        admin = AuthUser(
            username=admin_username,
            email=admin_email,
            hashed_password=get_password_hash(admin_password),
            user_type=UserType.ADMIN.value,
            first_name=admin_first,
            last_name=admin_last,
            hospital_id=hospital.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()

        print(f"\nDone! Hospital '{hospital_name}' created with admin '{admin_username}'.")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
