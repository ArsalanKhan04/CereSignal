"""
Database migration script.
Creates any missing tables and ensures the dev superuser exists.
Safe to run repeatedly — idempotent (preserves existing data).
"""

from app.core.database import engine, Base, SessionLocal
from app.models import *  # noqa: F401,F403 — register all models


def _ensure_superuser():
    """Idempotent: create the dev-admin superuser if missing."""
    import os
    from app.core.auth import get_password_hash
    from app.models.auth import AuthUser, UserType

    username = os.environ.get("SUPERUSER_USERNAME", "admin")
    password = os.environ.get("SUPERUSER_PASSWORD", "")

    if not password:
        print("SKIP superuser — SUPERUSER_PASSWORD not set")
        return

    db = SessionLocal()
    try:
        existing = db.query(AuthUser).filter(AuthUser.username == username).first()
        if existing:
            if not existing.is_superuser:
                existing.is_superuser = True
                db.commit()
                print(f"Superuser flag added to '{username}'.")
            else:
                print(f"Superuser '{username}' already exists.")
            return

        su = AuthUser(
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
        db.add(su)
        db.commit()
        print(f"Superuser '{username}' created.")
    finally:
        db.close()


def run():
    # Create tables that don't exist yet (idempotent — skips existing ones)
    Base.metadata.create_all(bind=engine)
    print("Tables ensured.")

    # Ensure dev superuser
    _ensure_superuser()


if __name__ == "__main__":
    run()
