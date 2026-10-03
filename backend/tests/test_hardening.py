"""
Smaller hardening fixes from the 2026-09-11 security audit, each with no better home.
"""

import logging

import pytest

from app.core.config import PLACEHOLDER_SECRET_KEYS


class TestSecretKeyIsRequired:
    """
    SECRET_KEY used to default to a string published in this repository. A deploy
    missing the variable signed every JWT with it, so anyone could mint a token for
    any username — the dev-admin superuser included.
    """

    # Driven off PLACEHOLDER_SECRET_KEYS itself rather than a copy of it, so a value
    # added to that set is covered the moment it lands. A hardcoded list here would
    # silently stop testing the newest placeholder — the one most likely to be in use.
    @pytest.mark.parametrize("placeholder", sorted(PLACEHOLDER_SECRET_KEYS))
    def test_the_api_refuses_to_start_on_a_placeholder(self, monkeypatch, placeholder):
        from app.core.config import settings
        from app.main import create_application

        monkeypatch.setattr(settings, "SECRET_KEY", placeholder)

        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            create_application()

    def test_every_key_that_has_ever_shipped_is_still_listed(self):
        """
        Both of these were real defaults in this repository's history. Removing one
        from the set would let a deploy that still carries it start up again.
        """
        assert "your-secret-key-change-in-production" in PLACEHOLDER_SECRET_KEYS
        assert "change-me-for-local-dev" in PLACEHOLDER_SECRET_KEYS
        assert "" in PLACEHOLDER_SECRET_KEYS

    def test_a_real_key_starts(self, monkeypatch):
        from app.core.config import settings
        from app.main import create_application

        monkeypatch.setattr(settings, "SECRET_KEY", "a" * 64)

        assert create_application() is not None


class TestEmailHtmlIsEscaped:
    """
    Hospital names come from the public signup form. Interpolated raw, they let
    anyone put their own markup and links into an invitation sent as CereSignal.
    """

    def test_the_invitation_escapes_the_hospital_name(self):
        from app.services.email_service import _build_html

        body = _build_html(
            '<a href="https://evil.example">Click</a>', "Doctor", "https://app/#/x"
        )

        assert '<a href="https://evil.example">' not in body
        assert "&lt;a href=&quot;https://evil.example&quot;&gt;" in body

    def test_the_portal_email_escapes_the_patient_name(self):
        from app.services.email_service import _build_portal_html

        body = _build_portal_html("<img src=x onerror=alert(1)>", "https://app/#/p/t")

        assert "<img src=x" not in body
        assert "&lt;img src=x" in body


class TestClientLogIngestion:
    """/logs/client is unauthenticated, so what it accepts is attacker-controlled."""

    def test_an_oversize_message_is_rejected(self, client):
        response = client.post(
            "/api/v1/logs/client", json={"level": "error", "message": "x" * 2001}
        )
        assert response.status_code == 422

    def test_a_newline_cannot_forge_a_second_log_line(self, client, caplog):
        forged = "boom\n2026-09-11 00:00:00 | INFO | AUTH: LOGIN | status=SUCCESS"

        with caplog.at_level(logging.WARNING, logger="ceresignal"):
            response = client.post(
                "/api/v1/logs/client", json={"level": "warn", "message": forged}
            )

        assert response.status_code == 200
        messages = [r.getMessage() for r in caplog.records if r.name == "ceresignal"]
        assert any("boom\\n2026" in m for m in messages)
        assert all("\n" not in m for m in messages)


class TestSignupPasswordLength:
    """Signup accepted 6 characters while change-password demanded 8."""

    def test_a_seven_character_patient_password_is_rejected(self, client):
        response = client.post(
            "/api/v1/auth/register/patient",
            json={
                "username": "newpatient",
                "email": "newpatient@example.test",
                "password": "1234567",
                "confirm_password": "1234567",
                "name": "New Patient",
            },
        )
        assert response.status_code == 422

    def test_existing_six_character_passwords_can_still_log_in(self, client):
        """Login keeps min_length=6, so no one who registered earlier is locked out."""
        response = client.post(
            "/api/v1/auth/login", json={"username": "nobody", "password": "123456"}
        )
        assert response.status_code == 401


class TestPublicRoutesAreRateLimited:
    """Nothing limited password guessing, token guessing or signup spam."""

    def _login(self, client):
        return client.post(
            "/api/v1/auth/login", json={"username": "nobody", "password": "wrong-password"}
        )

    def test_the_eleventh_login_in_a_minute_is_refused(self, client):
        for _ in range(10):
            assert self._login(client).status_code == 401

        response = self._login(client)

        assert response.status_code == 429
        assert int(response.headers["Retry-After"]) > 0

    def test_limits_do_not_share_a_budget(self, client):
        for _ in range(10):
            self._login(client)
        assert self._login(client).status_code == 429

        response = client.post("/api/v1/auth/patient-portal", json={"token": "nope"})

        assert response.status_code == 404

    def test_the_counter_forgets_after_its_window(self, monkeypatch):
        from fastapi import HTTPException
        from starlette.requests import Request

        from app.core import rate_limit

        clock = [1000.0]
        monkeypatch.setattr(rate_limit.time, "monotonic", lambda: clock[0])
        check = rate_limit.rate_limit("window-test", limit=1, window_seconds=60)
        request = Request({"type": "http", "client": ("203.0.113.9", 1)})

        check(request)
        with pytest.raises(HTTPException):
            check(request)
        clock[0] += 61
        check(request)


class TestServerErrorsDoNotEchoExceptions:
    """22 handlers put str(e) in the 500 detail: SQL, storage paths, client errors."""

    def test_a_pdf_failure_hides_its_message(
        self, client, monkeypatch, auth_headers, make_patient, make_signal_file,
        make_report, hospital_a, doctor_a,
    ):
        from app.api.v1.endpoints import reports

        def explode(*args, **kwargs):
            raise RuntimeError("/srv/secret/storage/path violates constraint uq_x")

        monkeypatch.setattr(reports.pdf_generator, "generate_report_pdf", explode)
        patient = make_patient("Patient A", hospital_a, doctor_a)
        report = make_report(make_signal_file(patient, hospital_a), hospital_a, doctor_a)

        response = client.post(
            f"/api/v1/reports/{report.id}/generate-pdf", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 500
        assert "secret" not in response.text
        assert response.json()["detail"] == "Error generating PDF"


class TestHospitalZipEntries:
    """original_filename went into the archive verbatim."""

    def test_names_cannot_traverse_or_collide(
        self, client, local_storage, auth_headers, superuser, make_patient,
        make_signal_file, hospital_a, doctor_a, db_session,
    ):
        import io
        import zipfile

        from app.services.storage_service import SIGNALS_BUCKET

        patient = make_patient("Patient A", hospital_a, doctor_a)
        files = []
        for stored in ("one.edf", "two.edf"):
            signal_file = make_signal_file(patient, hospital_a, filename=stored)
            signal_file.original_filename = "../../x.edf"
            local_storage.upload(SIGNALS_BUCKET, signal_file.file_path, stored.encode())
            files.append(signal_file)
        db_session.commit()

        response = client.get(
            f"/api/v1/dev-admin/hospitals/{hospital_a.id}/download",
            headers=auth_headers(superuser),
        )

        assert response.status_code == 200
        names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
        assert sorted(n for n in names if n.startswith("edf/")) == sorted(
            f"edf/{f.id}_x.edf" for f in files
        )
        assert not any(".." in n for n in names)
