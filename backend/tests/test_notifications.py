"""
Tests for ``app/api/v1/endpoints/notifications.py``.

This module had no tests. Both routes are doctor-only and scoped to
``Notification.auth_user_id == current_user.id``, which makes ``POST
/{notification_id}/read`` a classic IDOR surface: the id is sequential and comes
straight off the URL. The scoping assertions below are the point of this file.
"""

import pytest

from app.models.notification import Notification

BASE = "/api/v1/notifications"


@pytest.fixture
def make_notification(db_session):
    def _make(owner, message="Report ready", is_read=False):
        n = Notification(auth_user_id=owner.id, message=message, is_read=is_read)
        db_session.add(n)
        db_session.commit()
        db_session.refresh(n)
        return n

    return _make


class TestOnlyDoctorsHaveNotifications:
    def test_an_anonymous_caller_is_refused(self, client):
        assert client.get(f"{BASE}/").status_code in (401, 403)

    @pytest.mark.parametrize("who", ["technician_a", "admin_a", "patient_a"])
    def test_everyone_else_is_403(self, client, auth_headers, request, who):
        user = request.getfixturevalue(who)

        assert client.get(f"{BASE}/", headers=auth_headers(user)).status_code == 403

    @pytest.mark.parametrize("who", ["technician_a", "admin_a", "patient_a"])
    def test_everyone_else_is_403_on_mark_read(
        self, client, auth_headers, request, who, make_notification, doctor_a
    ):
        """The role check must come before the lookup, or it leaks existence."""
        note = make_notification(doctor_a)
        user = request.getfixturevalue(who)

        r = client.post(f"{BASE}/{note.id}/read", headers=auth_headers(user))

        assert r.status_code == 403


class TestListing:
    def test_a_doctor_sees_only_their_own(
        self, client, auth_headers, doctor_a, doctor_a2, make_notification
    ):
        make_notification(doctor_a, "mine")
        make_notification(doctor_a2, "theirs")

        rows = client.get(f"{BASE}/", headers=auth_headers(doctor_a)).json()

        assert [r["message"] for r in rows] == ["mine"]

    def test_a_doctor_in_another_hospital_sees_nothing(
        self, client, auth_headers, doctor_a, doctor_b, make_notification
    ):
        make_notification(doctor_a, "hospital a only")

        assert client.get(f"{BASE}/", headers=auth_headers(doctor_b)).json() == []

    def test_an_empty_inbox_is_an_empty_list(self, client, auth_headers, doctor_a):
        assert client.get(f"{BASE}/", headers=auth_headers(doctor_a)).json() == []


class TestMarkRead:
    def test_a_doctor_can_mark_their_own_read(
        self, client, auth_headers, doctor_a, make_notification, db_session
    ):
        note = make_notification(doctor_a)

        r = client.post(f"{BASE}/{note.id}/read", headers=auth_headers(doctor_a))

        assert r.status_code == 200
        assert r.json()["is_read"] is True
        db_session.refresh(note)
        assert note.is_read is True
        assert note.read_at is not None

    def test_marking_an_already_read_one_is_idempotent(
        self, client, auth_headers, doctor_a, make_notification, db_session
    ):
        note = make_notification(doctor_a, is_read=True)

        r = client.post(f"{BASE}/{note.id}/read", headers=auth_headers(doctor_a))

        assert r.status_code == 200
        assert r.json()["is_read"] is True

    def test_a_colleague_cannot_mark_someone_elses_read(
        self, client, auth_headers, doctor_a, doctor_a2, make_notification, db_session
    ):
        """Same hospital, different doctor — a sequential id must not reach across."""
        note = make_notification(doctor_a)

        r = client.post(f"{BASE}/{note.id}/read", headers=auth_headers(doctor_a2))

        assert r.status_code == 404
        db_session.refresh(note)
        assert note.is_read is False

    def test_a_doctor_in_another_hospital_cannot_mark_it_read(
        self, client, auth_headers, doctor_a, doctor_b, make_notification, db_session
    ):
        note = make_notification(doctor_a)

        r = client.post(f"{BASE}/{note.id}/read", headers=auth_headers(doctor_b))

        assert r.status_code == 404
        db_session.refresh(note)
        assert note.is_read is False

    def test_an_unknown_id_is_a_404(self, client, auth_headers, doctor_a):
        assert client.post(f"{BASE}/999999/read",
                           headers=auth_headers(doctor_a)).status_code == 404
