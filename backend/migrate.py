"""
Database migration script.
Creates any missing tables and ensures the dev superuser exists.
Pass --reset to drop all tables first (destroys all data).
"""

from app.core.database import engine, Base, SessionLocal
from app.models import *  # noqa: F401,F403 — register all models
from sqlalchemy import text

TABLES = [
    "eeg_report_versions",
    "eeg_bookmarks",
    "eeg_reports",
    # The ProcessingResult model was deleted with the /processing router, but the
    # table lingers in databases created before that. Keep it here so --reset is
    # the one thing that will ever drop it.
    "processing_results",
    "signals",
    "signal_files",
    "notifications",
    "user_sessions",
    "contact_submissions",
    "staff_invitations",
    "users",
    "auth_users",
    "hospitals",
]


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


def _drop_all_tables():
    with engine.connect() as conn:
        is_postgres = "postgresql" in str(engine.url)
        for table in TABLES:
            if is_postgres:
                conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
            else:
                try:
                    conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
                except Exception as e:
                    print(f"  WARN {table}: {e}")
        conn.commit()
    print("All tables dropped.")


def run(*, reset: bool = False):
    if reset:
        _drop_all_tables()

    Base.metadata.create_all(bind=engine)
    print("Tables ensured.")
    _ensure_superuser()


if __name__ == "__main__":
    import sys

    reset = "--reset" in sys.argv
    run(reset=reset)
