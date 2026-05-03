"""
Idempotent script: create the dev-admin superuser if it doesn't already exist.
Reads credentials from environment variables:
  SUPERUSER_USERNAME  (default: admin)
  SUPERUSER_PASSWORD  (required)

Safe to run on every deployment — no-ops if the user already exists.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.core.auth import get_password_hash
from app.models.auth import AuthUser, UserType


def main():
    username = os.environ.get("SUPERUSER_USERNAME", "admin")
    password = os.environ.get("SUPERUSER_PASSWORD", "")

    if not password:
        print("SUPERUSER_PASSWORD env var is required.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(AuthUser).filter(AuthUser.username == username).first()
        if existing:
            if not existing.is_superuser:
                existing.is_superuser = True
                db.commit()
                print(f"Superuser flag added to existing user '{username}'.")
            else:
                print(f"Superuser '{username}' already exists — skipping.")
            return

        superuser = AuthUser(
            username=username,
            email=f"{username}@ceresignal.internal",
            hashed_password=get_password_hash(password),
            user_type=UserType.ADMIN.value,
            first_name="Dev",
            last_name="Admin",
            is_active=True,
            is_superuser=True,
            hospital_id=None,
        )
        db.add(superuser)
        db.commit()
        print(f"Superuser '{username}' created successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
