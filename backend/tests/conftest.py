"""
Shared fixtures for the CereSignal backend suite.

Two import-order rules govern this file, and breaking either one makes the tests
write to the developer's real database:

1. ``app/core/config.py`` builds its ``settings`` singleton at import time, and its
   ``env_file = ".env"`` is resolved against the process CWD. Environment variables
   take precedence over the file in pydantic-settings, so the ``os.environ`` block
   below must run *before* anything under ``app`` is imported.
2. ``app/core/database.py`` creates the engine at import time from
   ``settings.DATABASE_URL``. That engine is never used here — every test gets its
   own via the ``engine`` fixture and a ``get_db`` override — but pointing it at a
   throwaway URL means a missed override fails loudly instead of quietly writing to
   ``backend/cere_signal.db``.
"""

import os
import tempfile

# --- must precede every `app.*` import in this module -----------------------------
_SCRATCH = tempfile.mkdtemp(prefix="ceresignal-test-")

os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_SCRATCH, 'unused.db')}"
os.environ["SECRET_KEY"] = "test-secret-key-not-used-in-production"
os.environ["SUPABASE_URL"] = ""
os.environ["OPENAI_API_KEY"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["CERE_LOG_DIR"] = _SCRATCH
# ----------------------------------------------------------------------------------

import numpy as np  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401  (registers all ten tables on Base.metadata)
from app.core.auth import create_access_token, get_password_hash  # noqa: E402
from app.core.database import Base, get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models.auth import AuthUser, UserType  # noqa: E402
from app.models.hospital import Hospital  # noqa: E402
from app.models.report import EEGReport  # noqa: E402
from app.models.signal import SignalFile  # noqa: E402
from app.models.user import User  # noqa: E402

TEST_PASSWORD = "testpass123"


@pytest.fixture(scope="session")
def test_password():
    """The plaintext behind every fixture user's password_hash."""
    return TEST_PASSWORD


@pytest.fixture(scope="session")
def password_hash():
    """
    bcrypt costs ~300ms per hash. Every fixture user shares one, computed once.
    """
    return get_password_hash(TEST_PASSWORD)


@pytest.fixture
def engine():
    """
    A private in-memory engine.

    Note this cannot reuse app.core.database's configuration: it passes
    ``pool_size``/``max_overflow``, which in-memory SQLite's SingletonThreadPool
    rejects with ``TypeError: Invalid argument(s) 'max_overflow'``. StaticPool keeps
    one connection alive so the schema survives across sessions within a test.
    """
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    try:
        yield eng
    finally:
        Base.metadata.drop_all(bind=eng)
        eng.dispose()


@pytest.fixture
def db_session(engine):
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session):
    """TestClient wired to the in-memory database."""

    def override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(fastapi_app) as test_client:
            yield test_client
    finally:
        fastapi_app.dependency_overrides.clear()


# --- tenancy fixtures -------------------------------------------------------------


def _make_hospital(db, name, code):
    hospital = Hospital(name=name, code=code, is_active=True)
    db.add(hospital)
    db.commit()
    db.refresh(hospital)
    return hospital


def _make_auth_user(db, password_hash, *, username, user_type, hospital, **kwargs):
    user = AuthUser(
        username=username,
        email=f"{username}@example.test",
        hashed_password=password_hash,
        user_type=user_type,
        hospital_id=hospital.id if hospital else None,
        is_active=kwargs.pop("is_active", True),
        is_superuser=kwargs.pop("is_superuser", False),
        **kwargs,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def hospital_a(db_session):
    return _make_hospital(db_session, "Hospital A", "HOSP-A")


@pytest.fixture
def hospital_b(db_session):
    return _make_hospital(db_session, "Hospital B", "HOSP-B")


@pytest.fixture
def doctor_a(db_session, password_hash, hospital_a):
    return _make_auth_user(
        db_session, password_hash,
        username="doctor_a", user_type=UserType.DOCTOR.value, hospital=hospital_a,
    )


@pytest.fixture
def doctor_a2(db_session, password_hash, hospital_a):
    """
    A second doctor in hospital A. access.py splits its denials on the hospital —
    404 across tenants, 403 within one — so the 403 arm needs a colleague to own
    the patient the caller is refused.
    """
    return _make_auth_user(
        db_session, password_hash,
        username="doctor_a2", user_type=UserType.DOCTOR.value, hospital=hospital_a,
    )


@pytest.fixture
def doctor_b(db_session, password_hash, hospital_b):
    return _make_auth_user(
        db_session, password_hash,
        username="doctor_b", user_type=UserType.DOCTOR.value, hospital=hospital_b,
    )


@pytest.fixture
def technician_a(db_session, password_hash, hospital_a):
    return _make_auth_user(
        db_session, password_hash,
        username="tech_a", user_type=UserType.TECHNICIAN.value, hospital=hospital_a,
    )


@pytest.fixture
def admin_a(db_session, password_hash, hospital_a):
    return _make_auth_user(
        db_session, password_hash,
        username="admin_a", user_type=UserType.ADMIN.value, hospital=hospital_a,
    )


@pytest.fixture
def patient_a(db_session, password_hash, hospital_a):
    """A PATIENT auth account. Its `users` row is attached by make_patient."""
    return _make_auth_user(
        db_session, password_hash,
        username="patient_a", user_type=UserType.PATIENT.value, hospital=hospital_a,
    )


@pytest.fixture
def patient_b(db_session, password_hash, hospital_b):
    return _make_auth_user(
        db_session, password_hash,
        username="patient_b", user_type=UserType.PATIENT.value, hospital=hospital_b,
    )


@pytest.fixture
def superuser(db_session, password_hash):
    return _make_auth_user(
        db_session, password_hash,
        username="root", user_type=UserType.ADMIN.value, hospital=None,
        is_superuser=True,
    )


@pytest.fixture
def inactive_user(db_session, password_hash, hospital_a):
    return _make_auth_user(
        db_session, password_hash,
        username="dormant", user_type=UserType.DOCTOR.value, hospital=hospital_a,
        is_active=False,
    )


@pytest.fixture
def auth_headers():
    """
    Mint a real token rather than overriding get_current_user.

    get_current_user, get_current_active_user, get_current_superuser and
    get_current_admin_user are four separate callables — overriding the base one does
    not short-circuit the others — so exercising the real chain is both simpler and a
    truer test.
    """

    def _headers(user):
        token = create_access_token({"sub": user.username, "user_id": user.id})
        return {"Authorization": f"Bearer {token}"}

    return _headers


@pytest.fixture
def make_patient(db_session):
    """
    Create a patient (users row) owned by an auth user.

    The two auth columns are not interchangeable. ``auth_user_id`` is the treating
    doctor, which is what visible_signal_files scopes a doctor's rows on;
    ``patient_auth_user_id`` is the patient's own login, which is what
    _own_patient_record (access.py:29) resolves a PATIENT token to. A patient who
    logs in and finds nothing usually has only the first one set.
    """

    def _make(name, hospital, auth_user=None, patient_auth_user=None):
        patient = User(
            name=name,
            hospital_id=hospital.id if hospital else None,
            auth_user_id=auth_user.id if auth_user else None,
            patient_auth_user_id=patient_auth_user.id if patient_auth_user else None,
        )
        db_session.add(patient)
        db_session.commit()
        db_session.refresh(patient)
        return patient

    return _make


@pytest.fixture
def make_signal_file(db_session):
    """Create a signal_files row belonging to a patient."""

    def _make(patient, hospital, filename="recording.edf", **kwargs):
        signal_file = SignalFile(
            user_id=patient.id,
            hospital_id=hospital.id if hospital else None,
            filename=filename,
            original_filename=filename,
            file_path=f"signals/{filename}",
            file_size=1024,
            file_type=".edf",
            **kwargs,
        )
        db_session.add(signal_file)
        db_session.commit()
        db_session.refresh(signal_file)
        return signal_file

    return _make


@pytest.fixture
def make_report(db_session):
    """Create an eeg_reports row for a signal file."""

    def _make(signal_file, hospital, author, patient_name="Report Patient", **kwargs):
        report = EEGReport(
            file_id=signal_file.id,
            auth_user_id=author.id,
            hospital_id=hospital.id if hospital else None,
            patient_name=patient_name,
            **kwargs,
        )
        db_session.add(report)
        db_session.commit()
        db_session.refresh(report)
        return report

    return _make


# --- storage --------------------------------------------------------------------


@pytest.fixture
def local_storage(tmp_path, monkeypatch):
    """
    Point the storage singleton at a temp tree.

    storage_service is built at import (storage_service.py:176), so the module
    attribute is what has to be replaced — patching the class would have no effect on
    the already-constructed instance. Modules that did `from ... import
    storage_service` at the top hold their own reference and are patched too;
    without that, every upload test wrote into the developer's real
    backend/local_storage.
    """
    from app.api.v1.endpoints import dev_admin, signals
    from app.services import storage_service as storage_module
    from app.utils import file_processing

    service = storage_module.LocalStorageService(str(tmp_path))
    for module in (storage_module, signals, file_processing, dev_admin):
        monkeypatch.setattr(module, "storage_service", service)
    return service


# --- EDF ------------------------------------------------------------------------


@pytest.fixture
def tiny_edf(tmp_path):
    """
    Synthesize a small EDF carrying the two quirks of the real sample recordings.

    The committed samples are 7.3 MB each and gitignored, so tests build their own:

    * physical dimension is ``uM``, not ``uV``. MNE does not recognise ``uM``, skips
      its own uV->V conversion, and hands back physical units directly. This is the
      reason process_edf's ``* 1e-6`` is correct rather than redundant.
    * the channel layout is not the 22-channel 10-20 set process_edf produces, so
      needs_preprocessing() returns True and the reshape path is exercised.
    """
    import pyedflib

    n_channels = 24
    sfreq = 256
    n_seconds = 4
    n_samples = sfreq * n_seconds

    rng = np.random.default_rng(seed=1377)
    # Amplitudes in the same range as the real files (~tens of uV physical units).
    data = rng.normal(loc=0.0, scale=10.0, size=(n_channels, n_samples))

    path = tmp_path / "tiny.edf"
    writer = pyedflib.EdfWriter(str(path), n_channels, file_type=pyedflib.FILETYPE_EDFPLUS)
    try:
        writer.setSignalHeaders([
            {
                "label": f"CH{i + 1}",
                "dimension": "uM",          # deliberately not "uV" — see docstring
                "sample_frequency": sfreq,
                "physical_max": 56.0,
                "physical_min": -56.0,
                "digital_max": 32767,
                "digital_min": -32768,
                "transducer": "",
                "prefilter": "",
            }
            for i in range(n_channels)
        ])
        writer.writeSamples(data)
    finally:
        writer.close()

    return {"path": str(path), "data": data, "sfreq": sfreq, "n_channels": n_channels}
