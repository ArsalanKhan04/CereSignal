"""
Tests for ``app/api/v1/endpoints/contact.py``.

One route, deliberately unauthenticated — it backs the public marketing contact
form. That is exactly why it is worth pinning: an open write endpoint's field
limits are the only thing standing between a form post and the database.

``test_hardening.py`` already covers the oversize-message case; this file covers
the rest of the shape.
"""

import pytest

from app.models.contact import ContactSubmission

BASE = "/api/v1/contact/"

MINIMAL = {"first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.test"}


class TestSubmitContact:
    def test_a_minimal_submission_is_stored(self, client, db_session):
        r = client.post(BASE, json=MINIMAL)

        assert r.status_code == 201
        row = db_session.query(ContactSubmission).one()
        assert (row.first_name, row.email) == ("Ada", "ada@example.test")

    def test_every_optional_field_round_trips(self, client):
        payload = dict(MINIMAL, hospital="St Elsewhere", role="Neurologist",
                       country="Pakistan", volume="50-100", interest="Pilot",
                       message="Please get in touch.")

        body = client.post(BASE, json=payload).json()

        for key, value in payload.items():
            assert body[key] == value

    def test_it_needs_no_authentication(self, client):
        assert client.post(BASE, json=MINIMAL).status_code == 201

    @pytest.mark.parametrize("missing", ["first_name", "last_name", "email"])
    def test_the_required_fields_are_required(self, client, missing):
        payload = {k: v for k, v in MINIMAL.items() if k != missing}

        assert client.post(BASE, json=payload).status_code == 422

    @pytest.mark.parametrize("email", ["not-an-email", "@example.test", ""])
    def test_a_malformed_email_is_rejected(self, client, email):
        assert client.post(BASE, json=dict(MINIMAL, email=email)).status_code == 422

    @pytest.mark.parametrize("field,limit", [
        ("first_name", 100), ("last_name", 100), ("hospital", 255),
        ("role", 100), ("country", 100), ("volume", 50), ("interest", 100),
    ])
    def test_each_field_has_an_enforced_ceiling(self, client, field, limit):
        assert client.post(BASE, json=dict(MINIMAL, **{field: "x" * (limit + 1)})).status_code == 422

    def test_a_submission_at_the_ceiling_is_accepted(self, client):
        assert client.post(BASE, json=dict(MINIMAL, message="x" * 5000)).status_code == 201

    def test_submissions_do_not_overwrite_each_other(self, client, db_session):
        client.post(BASE, json=MINIMAL)
        client.post(BASE, json=dict(MINIMAL, first_name="Grace"))

        assert db_session.query(ContactSubmission).count() == 2

    def test_the_stored_message_is_not_interpreted_as_markup(self, client, db_session):
        """It is rendered back in the dev-admin portal, so it must stay inert text."""
        client.post(BASE, json=dict(MINIMAL, message="<script>alert(1)</script>"))

        row = db_session.query(ContactSubmission).one()
        assert row.message == "<script>alert(1)</script>"
