"""
HTTP-level tests: the unauthenticated smoke routes, the runtime config endpoint,
and upload validation.

Uploads are exercised with skip_inference=True so no Celery dispatch is attempted;
the inference path itself is covered in test_inference_tasks.py.
"""

import io

import pytest

class TestSmokeRoutes:
    def test_root_advertises_the_version_and_docs(self, client):
        response = client.get("/")

        assert response.status_code == 200
        body = response.json()
        assert body["message"] == "Welcome to CereSignal API"
        assert body["docs"] == "/api/v1/docs"
        assert "version" in body

    def test_health_check(self, client):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "service": "cere-signal-api"}

    def test_openapi_schema_builds(self, client):
        # Catches a route whose response_model cannot be generated — a class of
        # error that otherwise only shows up when someone opens /docs.
        assert client.get("/api/v1/openapi.json").status_code == 200


class TestRuntimeConfig:
    """
    One frontend build serves both AI-enabled and manual-entry-only deployments; it
    discovers which at runtime from this endpoint.
    """

    def test_it_is_public(self, client):
        assert client.get("/api/v1/config").status_code == 200

    def test_it_reports_ai_enabled(self, client, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "AI_INFERENCE_ENABLED", True)
        assert client.get("/api/v1/config").json() == {"ai_inference_enabled": True}

    def test_it_reports_ai_disabled(self, client, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "AI_INFERENCE_ENABLED", False)
        assert client.get("/api/v1/config").json() == {"ai_inference_enabled": False}

    def test_it_exposes_nothing_but_the_flag(self, client):
        # It is unauthenticated by design, so the response must stay free of
        # secrets and deployment detail.
        assert set(client.get("/api/v1/config").json()) == {"ai_inference_enabled"}


class TestUploadValidation:
    @pytest.fixture
    def upload(self, client, local_storage, technician_a, auth_headers):
        def _upload(filename, content=b"data", **form):
            return client.post(
                "/api/v1/signals/upload",
                files={"file": (filename, io.BytesIO(content), "application/octet-stream")},
                data={"skip_inference": "true", **form},
                headers=auth_headers(technician_a),
            )

        return _upload

    def test_upload_requires_authentication(self, client):
        response = client.post(
            "/api/v1/signals/upload",
            files={"file": ("a.edf", io.BytesIO(b"data"), "application/octet-stream")},
        )
        assert response.status_code == 401

    @pytest.mark.parametrize("filename", ["notes.pdf", "archive.zip", "script.sh", "noext"])
    def test_disallowed_extensions_are_rejected(self, upload, filename):
        response = upload(filename)

        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"]

    def test_the_rejection_names_the_allowed_types(self, upload):
        detail = upload("notes.pdf").json()["detail"]
        assert ".edf" in detail

    def test_extension_matching_is_case_insensitive(self, upload):
        # .EDF must be accepted, not rejected as an unknown type.
        response = upload("RECORDING.EDF")
        assert response.status_code != 400 or "not allowed" not in response.json().get("detail", "")

    def test_an_oversize_file_is_rejected(self, upload, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "MAX_FILE_SIZE", 10)

        response = upload("big.edf", content=b"x" * 100)

        assert response.status_code == 400
        assert "exceeds maximum" in response.json()["detail"]



class TestValidationErrorShape:
    """
    main.py's RequestValidationError handler rewrites Pydantic errors into
    {"detail", "errors": [{field, message}]}, which is the shape the frontend's
    extractApiErrors() parses.
    """

    def test_a_422_carries_per_field_messages(self, client):
        response = client.post("/api/v1/auth/login", json={"username": "ab"})

        assert response.status_code == 422
        body = response.json()
        assert "detail" in body
        assert isinstance(body["errors"], list)
        assert {"field", "message"} <= set(body["errors"][0])

    def test_a_missing_field_is_reported_with_its_friendly_label(self, client):
        response = client.post("/api/v1/auth/login", json={"username": "alice"})

        messages = [e["message"] for e in response.json()["errors"]]
        assert "Password is required." in messages

class TestUploadAuthorisationErrors:
    """
    upload_signal_file raises 403 for a patient account and 404 for an unknown
    patient from inside a big try block. HTTPException is an Exception, so the
    outer ``except Exception`` used to catch both and re-raise them as 500 with
    the original message stuffed into the detail string — every documented 4xx on
    this endpoint was unreachable, and a routine refusal was logged through
    log_error() as a server fault.

    The handler now re-raises HTTPException ahead of the generic branch. The same
    shape was fixed in five other handlers across signals.py, reports.py and
    users.py; tests/test_users_api.py covers the create_user case.
    """

    @pytest.fixture
    def patient_account(self, db_session, password_hash, hospital_a):
        from app.models.auth import AuthUser, UserType

        account = AuthUser(
            username="patient_acct",
            email="patient_acct@example.test",
            hashed_password=password_hash,
            user_type=UserType.PATIENT.value,
            hospital_id=hospital_a.id,
            is_active=True,
        )
        db_session.add(account)
        db_session.commit()
        db_session.refresh(account)
        return account

    @pytest.fixture
    def post_upload(self, client, local_storage, auth_headers):
        def _post(user, **form):
            return client.post(
                "/api/v1/signals/upload",
                files={"file": ("a.edf", io.BytesIO(b"data"), "application/octet-stream")},
                data={"skip_inference": "true", **form},
                headers=auth_headers(user),
            )

        return _post

    def test_a_patient_is_forbidden_from_uploading(
        self, post_upload, patient_account, make_patient, hospital_a
    ):
        patient = make_patient("Someone", hospital_a)
        response = post_upload(patient_account, patient_id=str(patient.id))

        assert response.status_code == 403
        assert "Patients cannot upload" in response.json()["detail"]

    def test_an_unknown_patient_is_404(self, post_upload, technician_a):
        response = post_upload(technician_a, patient_id="999999")

        assert response.status_code == 404
        assert "Patient not found" in response.json()["detail"]

    def test_the_detail_is_not_wrapped_in_a_server_error_message(
        self, post_upload, technician_a
    ):
        """
        The old behaviour produced "Error uploading file: 404: Patient not found".
        Asserting the prefix is absent catches a re-raise that was added but
        placed after the generic handler.
        """
        response = post_upload(technician_a, patient_id="999999")

        assert "Error uploading file" not in response.json()["detail"]


class TestUploadIsScopedToTheUploadersHospital:
    """
    The technician branch resolved patient_id with no hospital filter, so a study
    could be attached to another hospital's patient record; a patient who left out
    patient_id fell through to the default-patient path and uploaded anyway; and
    that default patient was created with no hospital at all.
    """

    @pytest.fixture
    def post_upload(self, client, local_storage, auth_headers):
        def _post(user, **form):
            return client.post(
                "/api/v1/signals/upload",
                files={"file": ("a.edf", io.BytesIO(b"data"), "application/octet-stream")},
                data={"skip_inference": "true", **form},
                headers=auth_headers(user),
            )

        return _post

    def test_a_technician_cannot_upload_to_another_hospitals_patient(
        self, post_upload, technician_a, make_patient, hospital_b, doctor_b, db_session
    ):
        from app.models.signal import SignalFile

        foreign = make_patient("Patient B", hospital_b, doctor_b)

        response = post_upload(technician_a, patient_id=str(foreign.id))

        assert response.status_code == 404
        assert db_session.query(SignalFile).filter_by(user_id=foreign.id).count() == 0

    def test_a_technician_uploads_to_their_own_hospitals_patient(
        self, post_upload, technician_a, make_patient, hospital_a
    ):
        patient = make_patient("Patient A", hospital_a)

        response = post_upload(technician_a, patient_id=str(patient.id))

        assert response.status_code == 200

    def test_a_patient_cannot_upload_by_omitting_patient_id(
        self, post_upload, patient_a, db_session
    ):
        from app.models.signal import SignalFile

        response = post_upload(patient_a)

        assert response.status_code == 403
        assert db_session.query(SignalFile).count() == 0

    def test_the_default_patient_belongs_to_the_uploaders_hospital(
        self, post_upload, doctor_a, hospital_a, db_session
    ):
        from app.models.user import User

        response = post_upload(doctor_a)

        assert response.status_code == 200
        default = db_session.query(User).filter_by(auth_user_id=doctor_a.id).one()
        assert default.hospital_id == hospital_a.id

    def test_stored_names_carry_enough_randomness_not_to_collide(
        self, post_upload, doctor_a, db_session
    ):
        """
        Every hospital's uploads share one namespace and upload() overwrites. With
        3 hex characters two same-named files replaced each other 1 time in 4096.
        """
        from app.models.signal import SignalFile

        post_upload(doctor_a)
        post_upload(doctor_a)

        paths = [f.file_path for f in db_session.query(SignalFile).all()]
        assert len(set(paths)) == 2
        for path in paths:
            suffix = path.rsplit("_", 1)[1].split(".")[0]
            assert len(suffix) >= 16


class TestBookmarkImagesAreSigned:
    """
    Bookmark screenshots were handed out as public_url(): a public Supabase bucket
    in deployment, an unauthenticated /static path locally.
    """

    PNG = "iVBORw0KGgo="  # base64 of the PNG magic bytes; content is not inspected

    @pytest.fixture
    def own_file(self, make_patient, make_signal_file, hospital_a, doctor_a):
        patient = make_patient("Patient A", hospital_a, doctor_a)
        return make_signal_file(patient, hospital_a)

    def test_the_returned_url_is_signed_and_serves_the_image(
        self, client, local_storage, doctor_a, auth_headers, own_file
    ):
        created = client.post(
            f"/api/v1/signals/files/{own_file.id}/bookmarks",
            json={"comment": "spike", "image_base64": self.PNG},
            headers=auth_headers(doctor_a),
        )
        assert created.status_code == 201
        url = created.json()["image_url"]
        assert "signature=" in url and "expires=" in url

        # No Authorization header: the signature is the credential.
        assert client.get(url).status_code == 200
        assert client.get(url.split("?")[0]).status_code == 403

    def test_listed_bookmarks_are_signed_too(
        self, client, local_storage, doctor_a, auth_headers, own_file
    ):
        client.post(
            f"/api/v1/signals/files/{own_file.id}/bookmarks",
            json={"comment": "spike", "image_base64": self.PNG},
            headers=auth_headers(doctor_a),
        )

        listed = client.get(
            f"/api/v1/signals/files/{own_file.id}/bookmarks",
            headers=auth_headers(doctor_a),
        )

        assert listed.status_code == 200
        assert "signature=" in listed.json()[0]["image_url"]
