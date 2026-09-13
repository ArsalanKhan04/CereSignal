"""
Demo seed script — creates the demo hospital, its three staff accounts
(admin/tech/doc) and the invitations they registered through. Patients, EEG
files and reports are not seeded; they are created by using the app.
Run: python -m backend.scripts.seed_demo  (from project root)
     or: python seed_demo.py              (from backend/scripts/)
"""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.auth import AuthUser
from app.models.hospital import Hospital, StaffInvitation
from app.models.notification import Notification
from app.models.signal import SignalFile
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DEMO_PASSWORD = "password"
DEMO_PASSWORD_HASH = pwd_context.hash(DEMO_PASSWORD)

NOW = datetime.now(timezone.utc)

# Sample patients seeded by earlier versions of this script, deleted below.
DEMO_PATIENT_MEDICAL_IDS = ["MED-2025-0042", "MED-2025-0087", "MED-2025-0156"]


def seed_demo(db: Session) -> None:
    # ── Hospital ──────────────────────────────────────────────
    hospital = db.query(Hospital).filter(Hospital.code == "neur").first()
    if not hospital:
        # Pin id=1 only on an empty table. Seeding into a database that already
        # has a hospital at id 1 must let the DB assign the next id instead of
        # colliding on the primary key.
        hospital = Hospital(
            id=1 if db.query(Hospital).count() == 0 else None,
            name="Neurolink Diagnostics",
            code="neur",
            address="221B Baker Street, London",
            phone="+44 20 7946 0958",
            email="admin@neurolink.demo.local",
            is_active=True,
        )
        db.add(hospital)
        db.flush()

    # ── Auth Users ────────────────────────────────────────────
    def get_or_create_auth(username: str, **kwargs) -> AuthUser:
        # Keyed on email rather than username: the email is the stable identity
        # of a demo account, so renaming one (admin_nl -> admin) updates the
        # existing row instead of inserting a second one that would collide on
        # the unique email.
        u = db.query(AuthUser).filter(AuthUser.email == kwargs["email"]).first()
        if not u:
            u = AuthUser(username=username, **kwargs)
            db.add(u)
            db.flush()
            return u

        # Realign credentials so a database seeded before a username or
        # password change picks the new ones up without needing --fresh.
        if u.username != username:
            taken = db.query(AuthUser).filter(
                AuthUser.username == username, AuthUser.id != u.id
            ).first()
            if taken:
                # A real account already owns the name. Renaming would abort the
                # seed — and this runs on every backend start — so leave it.
                print(f"  ! username '{username}' is taken; keeping '{u.username}'")
            else:
                u.username = username
        u.hashed_password = kwargs["hashed_password"]
        db.flush()
        return u

    admin = get_or_create_auth(
        "admin",
        email="admin@neurolink.demo.local",
        hashed_password=DEMO_PASSWORD_HASH,
        user_type="admin",
        first_name="Sarah",
        last_name="Mitchell",
        hospital_id=hospital.id,
        is_active=True,
    )

    technician = get_or_create_auth(
        "tech",
        email="jenny.tech@demo.local",
        hashed_password=DEMO_PASSWORD_HASH,
        user_type="technician",
        first_name="Jennifer",
        last_name="Park",
        specialization="EEG Technology",
        hospital_id=hospital.id,
        is_active=True,
    )

    doctor = get_or_create_auth(
        "doc",
        email="david.chen@demo.local",
        hashed_password=DEMO_PASSWORD_HASH,
        user_type="doctor",
        first_name="David",
        last_name="Chen",
        title="Dr.",
        specialization="Clinical Neurophysiology",
        hospital_id=hospital.id,
        is_active=True,
    )

    # ── Staff Invitations ─────────────────────────────────────
    for email, role, token, used in [
        ("jenny.tech@demo.local", "technician", "invite-demo-tech-001", True),
        ("david.chen@demo.local", "doctor", "invite-demo-doc-001", True),
    ]:
        exists = db.query(StaffInvitation).filter(StaffInvitation.token == token).first()
        if not exists:
            inv = StaffInvitation(
                hospital_id=hospital.id,
                invited_email=email,
                role=role,
                token=token,
                expires_at=NOW + timedelta(days=7),
                used_at=NOW - timedelta(days=5) if used else None,
                created_by=admin.id,
            )
            db.add(inv)

    # ── Remove earlier demo sample data ───────────────────────
    # Earlier seeds inserted three sample patients plus signal_files pointing at
    # /demo/*.edf — storage objects that were never written, so opening one in
    # the viewer failed with "Invalid object path". Neither is seeded any more;
    # remove what previous runs left behind, oldest dependency first.
    stale_files = db.query(SignalFile).filter(SignalFile.file_path.like("/demo/%")).all()
    for sf in stale_files:
        db.delete(sf)
    if stale_files:
        print(f"Removed {len(stale_files)} placeholder demo signal file(s).")

    stale_patients = db.query(User).filter(User.medical_id.in_(DEMO_PATIENT_MEDICAL_IDS)).all()
    # A demo patient that still owns files has had a real EEG uploaded against
    # it. signal_files.user_id is NOT NULL with no delete cascade, so leave that
    # patient (and its data) alone rather than deleting either.
    keep = [p for p in stale_patients if p.signal_files]
    remove = [p for p in stale_patients if not p.signal_files]
    for p in remove:
        db.query(Notification).filter(Notification.patient_id == p.id).delete(
            synchronize_session=False
        )
        db.delete(p)
    if remove:
        print(f"Removed {len(remove)} demo patient(s).")
    for p in keep:
        print(f"Kept demo patient {p.name!r} — it has uploaded EEG files.")

    db.commit()

    # ── Reset sequences ─────────────────────────────────────────
    # Explicit IDs (e.g. hospital=1) don't advance PostgreSQL
    # sequences — new INSERTs would collide. Set each sequence past
    # the current MAX so auto-generated IDs don't conflict.
    # SQLite has no sequences (and no setval), so this is Postgres-only.
    if db.get_bind().dialect.name == "postgresql":
        _tables_with_ids = ["hospitals", "auth_users", "staff_invitations"]
        for t in _tables_with_ids:
            db.execute(text(f"SELECT setval('{t}_id_seq', COALESCE((SELECT MAX(id) FROM {t}), 1), true)"))
        db.commit()

    print("Demo seed complete.")

    # Built from the rows just seeded, so this can never drift from the
    # accounts that actually exist.
    print(f"\nDemo accounts (password: {DEMO_PASSWORD})")
    for u in (admin, technician, doctor):
        print(f"  {u.username:<7} {u.user_type}")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_demo(db)
    finally:
        db.close()
