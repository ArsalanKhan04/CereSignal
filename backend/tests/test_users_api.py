"""
POST /users/ validation, and the 4xx responses that used to surface as 500.

create_user raises four HTTPException(400)s from inside a try block whose outer
``except Exception`` re-wrapped them as "Error creating user: 400: ...". The same
shape was fixed in six handlers across signals.py, reports.py and users.py; this
file covers the users.py side, tests/test_signals_api.py the upload side.
"""

import pytest


@pytest.fixture
def post_user(client, auth_headers):
    def _post(user, **fields):
        # phone, gender and age are all required ahead of the try block, so
        # every payload here carries them or the test never reaches the
        # validation it means to exercise.
        payload = {
            "name": "New Patient",
            "age": 40,
            "phone": "+15550100",
            "gender": "F",
            **fields,
        }
        return client.post("/api/v1/users/", json=payload, headers=auth_headers(user))

    return _post


class TestCreateUserValidationErrorsAreNot500:
    def test_a_technician_naming_an_unknown_doctor_gets_400(
        self, post_user, technician_a
    ):
        response = post_user(technician_a, doctor_id=999999)

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid doctor ID or doctor not found"

    def test_a_technician_cannot_assign_another_hospitals_doctor(
        self, post_user, technician_a, doctor_b
    ):
        """
        The doctor lookup filters on the technician's own hospital, so a real
        doctor id from elsewhere is refused the same way a bogus one is.
        """
        response = post_user(technician_a, doctor_id=doctor_b.id)

        assert response.status_code == 400

    def test_a_future_date_of_birth_gets_400(self, post_user, doctor_a):
        response = post_user(doctor_a, date_of_birth="2999-01-01T00:00:00")

        assert response.status_code == 400
        assert response.json()["detail"] == "Date of birth cannot be in the future"

    def test_an_age_that_contradicts_the_date_of_birth_gets_400(
        self, post_user, doctor_a
    ):
        response = post_user(doctor_a, date_of_birth="1990-01-01T00:00:00", age=7)

        assert response.status_code == 400
        assert response.json()["detail"] == "Age does not match date of birth"

    def test_the_detail_is_not_wrapped_in_a_server_error_message(
        self, post_user, technician_a
    ):
        response = post_user(technician_a, doctor_id=999999)

        assert "Error creating user" not in response.json()["detail"]


class TestCreateUserHappyPath:
    """Proves the guard did not turn a working path into a refusal."""

    def test_a_doctor_creates_a_patient_assigned_to_themselves(
        self, post_user, doctor_a, db_session
    ):
        from app.models.user import User

        response = post_user(doctor_a, name="Assigned Patient")

        assert response.status_code == 201
        created = db_session.query(User).filter(User.name == "Assigned Patient").one()
        assert created.auth_user_id == doctor_a.id

    def test_a_technician_may_leave_a_patient_unassigned(
        self, post_user, technician_a, db_session
    ):
        from app.models.user import User

        response = post_user(technician_a, name="Unassigned Patient")

        assert response.status_code == 201
        created = db_session.query(User).filter(User.name == "Unassigned Patient").one()
        assert created.auth_user_id is None


class TestReportDeliveryActions:
    """mark-report-sent and send-portal-email. Scoping is in test_tenancy.py."""

    @pytest.fixture
    def patient(self, make_patient, hospital_a, doctor_a, db_session):
        patient = make_patient("Delivery Patient", hospital_a, auth_user=doctor_a)
        patient.email = "delivery@example.com"
        db_session.commit()
        return patient

    @pytest.fixture
    def sent(self, monkeypatch):
        """Capture outgoing portal emails; nothing leaves the process."""
        calls = []

        async def fake_send(**kwargs):
            calls.append(kwargs)

        monkeypatch.setattr(
            "app.services.email_service.send_patient_portal_email", fake_send
        )
        return calls

    def test_mark_report_sent_sets_the_flag(self, client, auth_headers, doctor_a, patient, db_session):
        response = client.post(
            f"/api/v1/users/{patient.id}/mark-report-sent", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200
        assert response.json()["report_sent"] is True
        db_session.refresh(patient)
        assert patient.report_sent is True

    def test_a_patient_cannot_mark_their_own_report_sent(
        self, client, auth_headers, patient_a, patient, db_session
    ):
        patient.patient_auth_user_id = patient_a.id
        db_session.commit()

        response = client.post(
            f"/api/v1/users/{patient.id}/mark-report-sent", headers=auth_headers(patient_a)
        )
        assert response.status_code == 403

    def test_portal_email_mints_a_token_and_sends_its_link(
        self, client, auth_headers, doctor_a, patient, sent, db_session
    ):
        response = client.post(
            f"/api/v1/users/{patient.id}/send-portal-email", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200, response.text
        db_session.refresh(patient)
        assert patient.portal_token
        assert patient.report_sent is True
        assert patient.portal_sent_at is not None
        [call] = sent
        assert call["to_email"] == "delivery@example.com"
        assert call["portal_url"].endswith(f"/#/patient/portal/{patient.portal_token}")

    def test_portal_email_reissues_the_token(
        self, client, auth_headers, doctor_a, patient, sent, db_session
    ):
        """Every send mints a fresh link, so the previous one stops working."""
        patient.portal_token = "existing-token"
        db_session.commit()

        client.post(f"/api/v1/users/{patient.id}/send-portal-email", headers=auth_headers(doctor_a))

        db_session.refresh(patient)
        assert patient.portal_token != "existing-token"
        assert not sent[0]["portal_url"].endswith("/existing-token")
        assert sent[0]["portal_url"].endswith(f"/{patient.portal_token}")

    def test_portal_email_without_an_address_is_400(
        self, client, auth_headers, doctor_a, patient, sent, db_session
    ):
        patient.email = None
        db_session.commit()

        response = client.post(
            f"/api/v1/users/{patient.id}/send-portal-email", headers=auth_headers(doctor_a)
        )
        assert response.status_code == 400
        assert sent == []

    def test_a_failed_send_is_500_and_marks_nothing(
        self, client, auth_headers, doctor_a, patient, monkeypatch, db_session
    ):
        async def broken_send(**kwargs):
            raise RuntimeError("smtp down")

        monkeypatch.setattr(
            "app.services.email_service.send_patient_portal_email", broken_send
        )

        response = client.post(
            f"/api/v1/users/{patient.id}/send-portal-email", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 500
        db_session.refresh(patient)
        assert patient.report_sent is not True
