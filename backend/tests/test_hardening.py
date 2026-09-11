"""
Smaller hardening fixes from the 2026-09-11 security audit, each with no better home.
"""

import logging

import pytest


class TestSecretKeyIsRequired:
    """
    SECRET_KEY used to default to a string published in this repository. A deploy
    missing the variable signed every JWT with it, so anyone could mint a token for
    any username — the dev-admin superuser included.
    """

    @pytest.mark.parametrize(
        "placeholder", ["", "your-secret-key-change-in-production", "change-me-for-local-dev"]
    )
    def test_the_api_refuses_to_start_on_a_placeholder(self, monkeypatch, placeholder):
        from app.core.config import settings
        from app.main import create_application

        monkeypatch.setattr(settings, "SECRET_KEY", placeholder)

        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            create_application()

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
