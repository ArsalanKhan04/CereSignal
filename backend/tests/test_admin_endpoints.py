"""
Tests for ``app/api/v1/endpoints/admin.py`` — the hospital-admin staff and
invitation surface.

This module had no tests at all. It is the most privilege-sensitive surface in the
app after dev_admin: it mints staff invitations, and it flips other accounts
active/inactive. Every route is gated by ``get_current_admin_user`` and scoped to
``current_user.hospital_id``, so each test here comes in a pair — the admin's own
hospital, and admin_b's.

No email leaves the process: ``send_invitation_email`` is patched out in the one
route that calls it. The route already swallows send failures (admin.py:81), so an
unpatched test would pass while silently attempting a network call.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.auth import UserType
from app.models.hospital import StaffInvitation

BASE = "/api/v1/admin"


@pytest.fixture(autouse=True)
def _no_outbound_email(monkeypatch):
    """admin.py imports the sender by name, so patch it on the endpoint module."""
    async def _noop(**kwargs):
        return None

    monkeypatch.setattr("app.api.v1.endpoints.admin.send_invitation_email", _noop)


@pytest.fixture
def invitation(db_session, hospital_a, admin_a):
    inv = StaffInvitation(
        hospital_id=hospital_a.id,
        invited_email="pending@hospital-a.test",
        role="doctor",
        token="token-a",
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        created_by=admin_a.id,
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


class TestOnlyAdminsReachThisRouter:
    @pytest.mark.parametrize("method,path", [
        ("post", "/invite"), ("get", "/stats"), ("get", "/staff"),
        ("put", "/staff/1/toggle-active"), ("get", "/invitations"),
        ("delete", "/invitations/1"),
    ])
    def test_an_anonymous_caller_is_refused(self, client, method, path):
        assert getattr(client, method)(f"{BASE}{path}").status_code in (401, 403)

    @pytest.mark.parametrize("who", ["doctor_a", "technician_a", "patient_a"])
    def test_non_admin_staff_are_refused(self, client, auth_headers, request, who):
        user = request.getfixturevalue(who)

        r = client.get(f"{BASE}/stats", headers=auth_headers(user))

        assert r.status_code == 403


class TestCreateInvitation:
    def test_an_admin_can_invite_into_their_own_hospital(self, client, auth_headers, admin_a, hospital_a):
        r = client.post(f"{BASE}/invite", headers=auth_headers(admin_a),
                        json={"email": "new.doctor@hospital-a.test", "role": "doctor"})

        assert r.status_code == 201
        body = r.json()
        assert body["hospital_id"] == hospital_a.id
        assert body["role"] == "doctor"
        assert body["token"]

    def test_the_invitation_is_bound_to_the_inviters_hospital(
        self, client, auth_headers, admin_b, hospital_a, hospital_b
    ):
        """
        There is no hospital_id in the request body — it is taken from the token.
        An admin therefore cannot invite into someone else's hospital, and this
        pins that it stays that way.
        """
        r = client.post(f"{BASE}/invite", headers=auth_headers(admin_b),
                        json={"email": "someone@hospital-b.test", "role": "technician"})

        assert r.status_code == 201
        assert r.json()["hospital_id"] == hospital_b.id
        assert r.json()["hospital_id"] != hospital_a.id

    @pytest.mark.parametrize("role", ["admin", "superuser", "patient", "", "DOCTOR"])
    def test_only_doctor_and_technician_can_be_invited(self, client, auth_headers, admin_a, role):
        """An admin must not be able to mint another admin by invitation."""
        r = client.post(f"{BASE}/invite", headers=auth_headers(admin_a),
                        json={"email": "x@hospital-a.test", "role": role})

        assert r.status_code == 422

    def test_inviting_an_existing_user_in_the_same_hospital_is_rejected(
        self, client, auth_headers, admin_a, doctor_a
    ):
        r = client.post(f"{BASE}/invite", headers=auth_headers(admin_a),
                        json={"email": doctor_a.email, "role": "doctor"})

        assert r.status_code == 400

    def test_the_same_email_can_be_invited_by_a_different_hospital(
        self, client, auth_headers, admin_b, doctor_a
    ):
        """Tenants are independent: hospital A's doctor is a stranger to hospital B."""
        r = client.post(f"{BASE}/invite", headers=auth_headers(admin_b),
                        json={"email": doctor_a.email, "role": "doctor"})

        assert r.status_code == 201

    def test_a_duplicate_pending_invitation_is_rejected(self, client, auth_headers, admin_a, invitation):
        r = client.post(f"{BASE}/invite", headers=auth_headers(admin_a),
                        json={"email": invitation.invited_email, "role": "doctor"})

        assert r.status_code == 400

    def test_an_invitation_saved_despite_a_failing_email_still_returns_201(
        self, client, auth_headers, admin_a, monkeypatch
    ):
        """admin.py:80-82 deliberately swallows send failures — the row is the point."""
        async def _boom(**kwargs):
            raise RuntimeError("resend is down")

        monkeypatch.setattr("app.api.v1.endpoints.admin.send_invitation_email", _boom)

        r = client.post(f"{BASE}/invite", headers=auth_headers(admin_a),
                        json={"email": "resilient@hospital-a.test", "role": "doctor"})

        assert r.status_code == 201


class TestStats:
    def test_counts_cover_only_the_callers_hospital(
        self, client, auth_headers, admin_a, doctor_a, doctor_a2, technician_a,
        doctor_b, make_patient, hospital_a, hospital_b,
    ):
        make_patient("A One", hospital_a, auth_user=doctor_a)
        make_patient("A Two", hospital_a, auth_user=doctor_a)
        make_patient("B One", hospital_b, auth_user=doctor_b)

        body = client.get(f"{BASE}/stats", headers=auth_headers(admin_a)).json()

        assert body["total_patients"] == 2
        assert body["total_doctors"] == 2          # doctor_a + doctor_a2, not doctor_b
        assert body["total_technicians"] == 1

    def test_two_admins_see_different_numbers(
        self, client, auth_headers, admin_a, admin_b, doctor_a, doctor_b,
        make_patient, hospital_a, hospital_b,
    ):
        make_patient("A One", hospital_a, auth_user=doctor_a)
        make_patient("B One", hospital_b, auth_user=doctor_b)
        make_patient("B Two", hospital_b, auth_user=doctor_b)

        a = client.get(f"{BASE}/stats", headers=auth_headers(admin_a)).json()
        b = client.get(f"{BASE}/stats", headers=auth_headers(admin_b)).json()

        assert (a["total_patients"], b["total_patients"]) == (1, 2)

    def test_pending_invitations_are_counted(self, client, auth_headers, admin_a, invitation):
        body = client.get(f"{BASE}/stats", headers=auth_headers(admin_a)).json()

        assert body["pending_invitations"] == 1


class TestListStaff:
    def test_only_own_hospital_staff_are_listed(
        self, client, auth_headers, admin_a, doctor_a, technician_a, doctor_b
    ):
        usernames = {s["username"] for s in
                     client.get(f"{BASE}/staff", headers=auth_headers(admin_a)).json()}

        assert {doctor_a.username, technician_a.username} <= usernames
        assert doctor_b.username not in usernames

    def test_admins_and_patients_are_not_staff(
        self, client, auth_headers, admin_a, patient_a, doctor_a
    ):
        usernames = {s["username"] for s in
                     client.get(f"{BASE}/staff", headers=auth_headers(admin_a)).json()}

        assert patient_a.username not in usernames
        assert admin_a.username not in usernames


class TestToggleStaffActive:
    def test_an_admin_can_deactivate_their_own_hospitals_doctor(
        self, client, auth_headers, admin_a, doctor_a, db_session
    ):
        r = client.put(f"{BASE}/staff/{doctor_a.id}/toggle-active", headers=auth_headers(admin_a))

        assert r.status_code == 200
        assert r.json()["is_active"] is False
        db_session.refresh(doctor_a)
        assert doctor_a.is_active is False

    def test_toggling_twice_restores_the_original_state(
        self, client, auth_headers, admin_a, doctor_a
    ):
        client.put(f"{BASE}/staff/{doctor_a.id}/toggle-active", headers=auth_headers(admin_a))
        r = client.put(f"{BASE}/staff/{doctor_a.id}/toggle-active", headers=auth_headers(admin_a))

        assert r.json()["is_active"] is True

    def test_an_admin_cannot_touch_another_hospitals_doctor(
        self, client, auth_headers, admin_b, doctor_a, db_session
    ):
        """A sequential id must not let admin_b reach into hospital A."""
        r = client.put(f"{BASE}/staff/{doctor_a.id}/toggle-active", headers=auth_headers(admin_b))

        assert r.status_code == 404
        db_session.refresh(doctor_a)
        assert doctor_a.is_active is True

    def test_an_admin_cannot_deactivate_another_admin(
        self, client, auth_headers, admin_a, db_session, password_hash, hospital_a
    ):
        """The route filters to doctors and technicians, so admins are out of reach."""
        from tests.conftest import _make_auth_user
        other = _make_auth_user(db_session, password_hash, username="admin_a2",
                                user_type=UserType.ADMIN.value, hospital=hospital_a)

        r = client.put(f"{BASE}/staff/{other.id}/toggle-active", headers=auth_headers(admin_a))

        assert r.status_code == 404

    def test_an_unknown_id_is_a_404(self, client, auth_headers, admin_a):
        assert client.put(f"{BASE}/staff/999999/toggle-active",
                          headers=auth_headers(admin_a)).status_code == 404


class TestListInvitations:
    def test_the_token_is_never_returned_in_the_listing(
        self, client, auth_headers, admin_a, invitation
    ):
        """
        The token is the whole credential — anyone holding it can join the hospital.
        InviteResponse returns it once at creation; the listing must not.
        """
        rows = client.get(f"{BASE}/invitations", headers=auth_headers(admin_a)).json()

        assert len(rows) == 1
        assert "token" not in rows[0]
        assert invitation.token not in str(rows)

    def test_another_hospitals_invitations_are_invisible(
        self, client, auth_headers, admin_b, invitation
    ):
        assert client.get(f"{BASE}/invitations", headers=auth_headers(admin_b)).json() == []


class TestDeleteInvitation:
    def test_an_admin_can_delete_their_own_pending_invitation(
        self, client, auth_headers, admin_a, invitation, db_session
    ):
        r = client.delete(f"{BASE}/invitations/{invitation.id}", headers=auth_headers(admin_a))

        assert r.status_code == 200
        assert db_session.query(StaffInvitation).filter_by(id=invitation.id).first() is None

    def test_another_hospitals_admin_cannot_delete_it(
        self, client, auth_headers, admin_b, invitation, db_session
    ):
        r = client.delete(f"{BASE}/invitations/{invitation.id}", headers=auth_headers(admin_b))

        assert r.status_code == 404
        assert db_session.query(StaffInvitation).filter_by(id=invitation.id).first() is not None

    def test_an_accepted_invitation_cannot_be_deleted(
        self, client, auth_headers, admin_a, invitation, db_session
    ):
        invitation.used_at = datetime.now(timezone.utc)
        db_session.commit()

        r = client.delete(f"{BASE}/invitations/{invitation.id}", headers=auth_headers(admin_a))

        assert r.status_code == 400

    def test_an_unknown_id_is_a_404(self, client, auth_headers, admin_a):
        assert client.delete(f"{BASE}/invitations/999999",
                             headers=auth_headers(admin_a)).status_code == 404
