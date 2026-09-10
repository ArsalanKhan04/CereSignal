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
