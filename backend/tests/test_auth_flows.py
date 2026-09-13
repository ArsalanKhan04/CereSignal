"""
Tests for the ``app/api/v1/endpoints/auth.py`` routes that had no coverage:
invite-token validation, patient-portal token exchange, /me, change-password,
logout and /doctors.

Three of these are unauthenticated and take a secret straight off the URL
(``/invite/{token}``, ``/patient-portal/{token}``), which makes their failure
modes the interesting part: an expired or spent token must be refused, and a
wrong token must not distinguish itself from a missing one.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.auth import verify_password
from app.models.hospital import StaffInvitation

BASE = "/api/v1/auth"


@pytest.fixture
def invite(db_session, hospital_a, admin_a):
    def _make(token="invite-token", used=False, expires_in_days=7, role="doctor"):
        inv = StaffInvitation(
            hospital_id=hospital_a.id,
            invited_email=f"{token}@hospital-a.test",
            role=role,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(days=expires_in_days),
            used_at=datetime.now(timezone.utc) if used else None,
            created_by=admin_a.id,
        )
        db_session.add(inv)
        db_session.commit()
        db_session.refresh(inv)
        return inv

    return _make


class TestValidateInviteToken:
    def test_a_live_token_returns_the_hospital_and_role(self, client, invite, hospital_a):
        inv = invite(role="technician")

        body = client.get(f"{BASE}/invite/{inv.token}").json()

        assert body["role"] == "technician"
        assert body["hospital_name"] == hospital_a.name
        assert body["hospital_id"] == hospital_a.id
        assert body["email"] == inv.invited_email

    def test_an_unknown_token_is_a_404(self, client):
        assert client.get(f"{BASE}/invite/no-such-token").status_code == 404

    def test_an_already_used_token_is_410(self, client, invite):
        inv = invite(token="spent", used=True)

        assert client.get(f"{BASE}/invite/{inv.token}").status_code == 410

    def test_an_expired_token_is_410(self, client, invite):
        inv = invite(token="stale", expires_in_days=-1)

        assert client.get(f"{BASE}/invite/{inv.token}").status_code == 410

    def test_it_needs_no_authentication(self, client, invite):
        """Deliberately public — the invitee has no account yet."""
        inv = invite(token="public")

        assert client.get(f"{BASE}/invite/{inv.token}").status_code == 200


class TestPatientPortalAccess:
    def test_a_valid_portal_token_mints_a_session(
        self, client, make_patient, hospital_a, doctor_a, patient_a, db_session
    ):
        patient = make_patient("Portal Patient", hospital_a, auth_user=doctor_a,
                               patient_auth_user=patient_a)
        patient.portal_token = "portal-secret"
        db_session.commit()

        r = client.get(f"{BASE}/patient-portal/{patient.portal_token}")

        assert r.status_code == 200
        assert r.json()["token_type"] == "bearer"
        assert r.json()["access_token"]

    def test_the_minted_token_actually_works(
        self, client, make_patient, hospital_a, doctor_a, patient_a, db_session
    ):
        patient = make_patient("Portal Patient", hospital_a, auth_user=doctor_a,
                               patient_auth_user=patient_a)
        patient.portal_token = "portal-secret"
        db_session.commit()

        token = client.get(f"{BASE}/patient-portal/{patient.portal_token}").json()["access_token"]
        me = client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {token}"})

        assert me.status_code == 200
        assert me.json()["user_type"] == "patient"

    def test_an_unknown_token_is_a_404(self, client):
        assert client.get(f"{BASE}/patient-portal/not-a-real-token").status_code == 404

    def test_a_patient_with_no_auth_account_gets_one_created(
        self, client, make_patient, hospital_a, doctor_a, db_session
    ):
        """The portal is the patient's first contact — there is no prior login."""
        patient = make_patient("Fresh Patient", hospital_a, auth_user=doctor_a)
        patient.portal_token = "first-visit"
        db_session.commit()
        assert patient.patient_auth_user_id is None

        r = client.get(f"{BASE}/patient-portal/first-visit")

        assert r.status_code == 200
        db_session.refresh(patient)
        assert patient.patient_auth_user_id is not None

    def test_an_inactive_account_is_refused(
        self, client, make_patient, hospital_a, doctor_a, patient_a, db_session
    ):
        patient = make_patient("Blocked", hospital_a, auth_user=doctor_a,
                               patient_auth_user=patient_a)
        patient.portal_token = "blocked-token"
        patient_a.is_active = False
        db_session.commit()

        assert client.get(f"{BASE}/patient-portal/blocked-token").status_code == 403

    def test_the_token_is_not_guessable_from_the_patient_id(
        self, client, make_patient, hospital_a, doctor_a, db_session
    ):
        """
        The old /auth/patient-login took a bare integer. Pinning that a patient id
        is not a credential.
        """
        patient = make_patient("Sequential", hospital_a, auth_user=doctor_a)
        patient.portal_token = "an-unguessable-value"
        db_session.commit()

        assert client.get(f"{BASE}/patient-portal/{patient.id}").status_code == 404


class TestMe:
    def test_it_returns_the_caller(self, client, auth_headers, doctor_a):
        body = client.get(f"{BASE}/me", headers=auth_headers(doctor_a)).json()

        assert body["username"] == doctor_a.username
        assert body["user_type"] == "doctor"

    def test_the_hospital_name_is_resolved(self, client, auth_headers, doctor_a, hospital_a):
        assert client.get(f"{BASE}/me", headers=auth_headers(doctor_a)).json()["hospital_name"] == hospital_a.name

    def test_the_password_hash_is_never_returned(self, client, auth_headers, doctor_a):
        body = client.get(f"{BASE}/me", headers=auth_headers(doctor_a)).json()

        assert "hashed_password" not in body
        assert "password" not in body

    def test_an_anonymous_caller_is_refused(self, client):
        assert client.get(f"{BASE}/me").status_code in (401, 403)


class TestChangePassword:
    def _payload(self, current, new, confirm=None):
        return {"current_password": current, "new_password": new,
                "confirm_new_password": confirm if confirm is not None else new}

    def test_a_correct_current_password_changes_it(
        self, client, auth_headers, doctor_a, test_password, db_session
    ):
        r = client.put(f"{BASE}/change-password", headers=auth_headers(doctor_a),
                       json=self._payload(test_password, "a-brand-new-password"))

        assert r.status_code == 200
        db_session.refresh(doctor_a)
        assert verify_password("a-brand-new-password", doctor_a.hashed_password)

    def test_a_wrong_current_password_is_rejected(
        self, client, auth_headers, doctor_a, db_session
    ):
        r = client.put(f"{BASE}/change-password", headers=auth_headers(doctor_a),
                       json=self._payload("not-my-password", "a-brand-new-password"))

        assert r.status_code == 400
        db_session.refresh(doctor_a)
        assert not verify_password("a-brand-new-password", doctor_a.hashed_password)

    def test_a_mismatched_confirmation_is_rejected(
        self, client, auth_headers, doctor_a, test_password, db_session
    ):
        r = client.put(f"{BASE}/change-password", headers=auth_headers(doctor_a),
                       json=self._payload(test_password, "new-password-one", "new-password-two"))

        assert r.status_code == 400
        db_session.refresh(doctor_a)
        assert verify_password(test_password, doctor_a.hashed_password)

    def test_a_short_new_password_is_rejected(
        self, client, auth_headers, doctor_a, test_password
    ):
        r = client.put(f"{BASE}/change-password", headers=auth_headers(doctor_a),
                       json=self._payload(test_password, "short"))

        assert r.status_code == 422

    def test_an_anonymous_caller_is_refused(self, client):
        assert client.put(f"{BASE}/change-password",
                          json=self._payload("a", "bbbbbbbbbb")).status_code in (401, 403)


class TestLogout:
    def test_an_authenticated_caller_gets_a_confirmation(self, client, auth_headers, doctor_a):
        assert client.post(f"{BASE}/logout", headers=auth_headers(doctor_a)).status_code == 200

    def test_an_anonymous_caller_is_refused(self, client):
        assert client.post(f"{BASE}/logout").status_code in (401, 403)

    def test_the_token_still_works_afterwards(self, client, auth_headers, doctor_a):
        """
        Logout is client-side only — there is no server-side revocation list. Pinning
        that, so nobody assumes the endpoint invalidates anything.
        """
        headers = auth_headers(doctor_a)
        client.post(f"{BASE}/logout", headers=headers)

        assert client.get(f"{BASE}/me", headers=headers).status_code == 200


class TestListDoctors:
    def test_a_technician_sees_their_hospitals_doctors(
        self, client, auth_headers, technician_a, doctor_a, doctor_a2
    ):
        usernames = {d["username"] for d in
                     client.get(f"{BASE}/doctors", headers=auth_headers(technician_a)).json()}

        assert {doctor_a.username, doctor_a2.username} <= usernames

    def test_another_hospitals_doctors_are_invisible(
        self, client, auth_headers, technician_a, doctor_b
    ):
        usernames = {d["username"] for d in
                     client.get(f"{BASE}/doctors", headers=auth_headers(technician_a)).json()}

        assert doctor_b.username not in usernames

    def test_inactive_doctors_are_omitted(
        self, client, auth_headers, technician_a, doctor_a, db_session
    ):
        doctor_a.is_active = False
        db_session.commit()

        usernames = {d["username"] for d in
                     client.get(f"{BASE}/doctors", headers=auth_headers(technician_a)).json()}

        assert doctor_a.username not in usernames

    @pytest.mark.parametrize("who", ["patient_a", "admin_a"])
    def test_patients_and_admins_are_refused(self, client, auth_headers, request, who):
        user = request.getfixturevalue(who)

        assert client.get(f"{BASE}/doctors", headers=auth_headers(user)).status_code == 403

    def test_an_anonymous_caller_is_refused(self, client):
        assert client.get(f"{BASE}/doctors").status_code in (401, 403)
