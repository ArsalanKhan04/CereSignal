"""
Demo seed script — inserts pre-seeded data for the CereSignal guided demo.
Run: python -m backend.scripts.seed_demo  (from project root)
     or: python seed_demo.py              (from backend/scripts/)
"""

import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import SessionLocal
from app.models.auth import AuthUser
from app.models.hospital import Hospital, StaffInvitation
from app.models.user import User
from app.models.signal import SignalFile
from app.models.report import EEGReport
from app.models.notification import Notification

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DEMO_PASSWORD_HASH = pwd_context.hash("Demo@2025!")

NOW = datetime.now(timezone.utc)


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
        u = db.query(AuthUser).filter(AuthUser.username == username).first()
        if not u:
            u = AuthUser(username=username, **kwargs)
            db.add(u)
            db.flush()
        return u

    admin = get_or_create_auth(
        "admin_nl",
        email="admin@neurolink.demo.local",
        hashed_password=DEMO_PASSWORD_HASH,
        user_type="admin",
        first_name="Sarah",
        last_name="Mitchell",
        hospital_id=hospital.id,
        is_active=True,
    )

    technician = get_or_create_auth(
        "jenny_tech",
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
        "dr_chen",
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

    # ── Patients ──────────────────────────────────────────────
    patient_data = [
        dict(
            id=1,
            name="Emily Richardson",
            email="emily.r@demo.local",
            phone="+44 7700 900001",
            medical_id="MED-2025-0042",
            gender="F",
            date_of_birth=datetime(1992, 6, 15),
            blood_type="A+",
            auth_user_id=technician.id,
            hospital_id=hospital.id,
            report_sent=False,
            portal_token="portal-demo-emily-001",
        ),
        dict(
            id=2,
            name="James Okafor",
            email="james.o@demo.local",
            phone="+44 7700 900002",
            medical_id="MED-2025-0087",
            gender="M",
            date_of_birth=datetime(1978, 3, 22),
            blood_type="O+",
            auth_user_id=technician.id,
            hospital_id=hospital.id,
            report_sent=False,
            portal_token="portal-demo-james-002",
        ),
        dict(
            id=3,
            name="Aisha Patel",
            email="aisha.p@demo.local",
            phone="+44 7700 900003",
            medical_id="MED-2025-0156",
            gender="F",
            date_of_birth=datetime(1985, 11, 8),
            blood_type="B+",
            auth_user_id=technician.id,
            hospital_id=hospital.id,
            report_sent=True,
            portal_token="portal-demo-aisha-003",
        ),
    ]
    patients = {}
    # The ids above double as the local lookup keys used further down. Use them
    # as real primary keys only on an empty table, for the same reason as the
    # hospital above.
    _pin_ids = db.query(User).count() == 0
    for pd in patient_data:
        p = db.query(User).filter(User.medical_id == pd["medical_id"]).first()
        if not p:
            p = User(**(pd if _pin_ids else {k: v for k, v in pd.items() if k != "id"}))
            db.add(p)
            db.flush()
        patients[pd["id"]] = p

    # ── Signal Files ──────────────────────────────────────────
    signal_data = [
        dict(id=101, user_id=patients[1].id, hospital_id=hospital.id, filename="emily_eeg_resting.edf",
             original_filename="emily_eeg_resting.edf", file_path="/demo/emily_eeg_resting.edf",
             file_size=512000, file_type="edf", processing_status="completed", condition="abnormal"),
        dict(id=102, user_id=patients[1].id, hospital_id=hospital.id, filename="emily_eeg_sleep.edf",
             original_filename="emily_eeg_sleep.edf", file_path="/demo/emily_eeg_sleep.edf",
             file_size=512000, file_type="edf", processing_status="completed", condition="abnormal"),
        dict(id=201, user_id=patients[2].id, hospital_id=hospital.id, filename="james_eeg_routine.edf",
             original_filename="james_eeg_routine.edf", file_path="/demo/james_eeg_routine.edf",
             file_size=512000, file_type="edf", processing_status="completed", condition="normal"),
        dict(id=301, user_id=patients[3].id, hospital_id=hospital.id, filename="aisha_eeg_followup.edf",
             original_filename="aisha_eeg_followup.edf", file_path="/demo/aisha_eeg_followup.edf",
             file_size=512000, file_type="edf", processing_status="completed", condition="normal"),
    ]
    signals = {}
    for sd in signal_data:
        sf = db.query(SignalFile).filter(SignalFile.id == sd["id"]).first()
        if not sf:
            sf = SignalFile(**sd)
            db.add(sf)
            db.flush()
        signals[sd["id"]] = sf

    # ── EEG Reports ───────────────────────────────────────────
    report_data = [
        dict(
            id=5001,
            file_id=signals[101].id,
            auth_user_id=doctor.id,
            hospital_id=hospital.id,
            patient_name="Emily Richardson",
            patient_age=32,
            patient_gender="F",
            report_date=datetime(2025, 4, 28),
            factual_report=(
                "Background activity shows posterior dominant rhythm at 9 Hz. "
                "Intermittent left temporal sharp waves noted, predominantly at T3. "
                "Occasional spike-and-wave complexes identified at approximately 3 s and 8 s. "
                "No generalized epileptiform discharges seen."
            ),
            impression="abnormal",
            is_finalized=True,
        ),
        dict(
            id=5002,
            file_id=signals[301].id,
            auth_user_id=doctor.id,
            hospital_id=hospital.id,
            patient_name="Aisha Patel",
            patient_age=39,
            patient_gender="F",
            report_date=datetime(2025, 4, 25),
            factual_report=(
                "Well-regulated 10 Hz alpha rhythm present bilaterally. "
                "No epileptiform discharges identified. "
                "Normal sleep architecture observed in sleep sections. "
                "No focal slowing or asymmetry noted."
            ),
            impression="normal",
            is_finalized=True,
        ),
    ]
    for rd in report_data:
        r = db.query(EEGReport).filter(EEGReport.id == rd["id"]).first()
        if not r:
            r = EEGReport(**rd)
            db.add(r)

    # ── Notifications ─────────────────────────────────────────
    notif_data = [
        dict(auth_user_id=doctor.id, message="New patient Emily Richardson assigned to you",
             patient_id=patients[1].id, is_read=False),
        dict(auth_user_id=doctor.id, message="New patient James Okafor assigned to you",
             patient_id=patients[2].id, is_read=False),
        dict(auth_user_id=doctor.id, message="Patient Aisha Patel's EEG report is ready for review",
             patient_id=patients[3].id, is_read=False),
    ]
    existing_notifs = db.query(Notification).filter(
        Notification.auth_user_id == doctor.id
    ).count()
    if existing_notifs == 0:
        for nd in notif_data:
            db.add(Notification(**nd))

    db.commit()

    # ── Reset sequences ─────────────────────────────────────────
    # Explicit IDs (e.g. hospital=1) don't advance PostgreSQL
    # sequences — new INSERTs would collide. Set each sequence past
    # the current MAX so auto-generated IDs don't conflict.
    # SQLite has no sequences (and no setval), so this is Postgres-only.
    if db.get_bind().dialect.name == "postgresql":
        _tables_with_ids = ["hospitals", "auth_users", "users", "signal_files", "eeg_reports", "staff_invitations"]
        for t in _tables_with_ids:
            db.execute(text(f"SELECT setval('{t}_id_seq', COALESCE((SELECT MAX(id) FROM {t}), 1), true)"))
        db.commit()

    print("Demo seed complete.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_demo(db)
    finally:
        db.close()
