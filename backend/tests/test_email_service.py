"""
Transport selection in app/services/email_service.py.

Resend first, then SMTP via fastapi-mail, then (nothing configured) log and return.
A configured transport that fails must raise rather than report a delivery that
never happened. Neither transport is reached here: `resend` is replaced in
sys.modules and FastMail is monkeypatched, so no test touches the network.
"""

import sys
import types

import pytest

from app.core.config import settings
from app.services import email_service


@pytest.fixture
def no_transport(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")
    monkeypatch.setattr(settings, "MAIL_FROM", "")
    monkeypatch.setattr(settings, "MAIL_SERVER", "")


@pytest.fixture
def fake_resend(monkeypatch, no_transport):
    sent = []
    module = types.ModuleType("resend")
    module.Emails = types.SimpleNamespace(send=lambda payload: sent.append(payload))
    monkeypatch.setitem(sys.modules, "resend", module)
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test")
    return sent


@pytest.fixture
def fake_smtp(monkeypatch, no_transport):
    sent = []

    class FakeFastMail:
        def __init__(self, conf):
            self.conf = conf

        async def send_message(self, message):
            sent.append(message)

    import fastapi_mail

    monkeypatch.setattr(fastapi_mail, "FastMail", FakeFastMail)
    monkeypatch.setattr(settings, "MAIL_FROM", "noreply@example.com")
    monkeypatch.setattr(settings, "MAIL_SERVER", "smtp.example.com")
    return sent


SENDERS = [
    pytest.param(
        lambda: email_service.send_patient_portal_email(
            to_email="p@example.com", patient_name="Pat", portal_url="https://x/#/p/tok"
        ),
        id="portal",
    ),
    pytest.param(
        lambda: email_service.send_invitation_email(
            to_email="p@example.com", hospital_name="General", role="doctor", token="tok"
        ),
        id="invitation",
    ),
]


@pytest.mark.parametrize("send", SENDERS)
class TestTransportSelection:
    async def test_resend_is_preferred(self, send, fake_resend, fake_smtp):
        await send()

        assert len(fake_resend) == 1
        assert fake_resend[0]["to"] == ["p@example.com"]
        assert fake_smtp == []

    async def test_resend_failure_falls_back_to_smtp(self, send, fake_resend, fake_smtp, monkeypatch):
        def boom(payload):
            raise RuntimeError("resend down")

        monkeypatch.setattr(sys.modules["resend"].Emails, "send", boom)

        await send()

        assert len(fake_smtp) == 1
        assert fake_smtp[0].recipients[0].email == "p@example.com"

    async def test_smtp_alone(self, send, fake_smtp):
        await send()
        assert len(fake_smtp) == 1

    async def test_smtp_failure_raises(self, send, fake_smtp, monkeypatch):
        import fastapi_mail

        class BrokenFastMail:
            def __init__(self, conf):
                pass

            async def send_message(self, message):
                raise ConnectionError("smtp down")

        monkeypatch.setattr(fastapi_mail, "FastMail", BrokenFastMail)

        with pytest.raises(ConnectionError):
            await send()

    async def test_resend_failing_with_no_smtp_raises(self, send, fake_resend, monkeypatch):
        def boom(payload):
            raise RuntimeError("resend down")

        monkeypatch.setattr(sys.modules["resend"].Emails, "send", boom)

        with pytest.raises(RuntimeError, match="Email delivery failed"):
            await send()

    async def test_nothing_configured_logs_and_returns(self, send, no_transport, caplog):
        await send()
        assert "Email not configured" in caplog.text


class TestInvitationContent:
    async def test_the_link_uses_the_hash_router(self, fake_resend, monkeypatch):
        monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.com")

        await email_service.send_invitation_email(
            to_email="p@example.com", hospital_name="General", role="technician", token="abc"
        )

        [payload] = fake_resend
        assert "https://app.example.com/#/register/invite/abc" in payload["html"]
        assert payload["subject"] == "You've been invited to join General on CereSignal"
