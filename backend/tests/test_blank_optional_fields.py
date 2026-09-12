"""
Blank input on an optional field means "not provided", not 422.

Pydantic v2 applies `pattern` to every non-None value, so a field declared

    phone: Optional[str] = Field(None, pattern=...)

used to reject "". An HTML form serialises an untouched input as "", so leaving
Phone blank on the doctor / technician / staff-invite registration pages returned
422 "Please enter a valid phone number." against a field nothing marked required —
seven of them landed in backend/logs/ceresignal.log in one sitting. The schemas now
annotate those fields with BlankAsNone (app/schemas/field_types.py), which maps
blank and whitespace-only input to None *before* the constraints run.

The negative cases matter as much as the positive ones: blank must still be an
error wherever None is not a storable value, and a malformed value must still be
rejected. Both directions are covered below.
"""

import pytest
from pydantic import ValidationError

from app.schemas.admin import HospitalAdminRegister, InviteCreate, StaffInviteRegister
from app.schemas.auth import PatientRegister, UserRegister
from app.schemas.report import EEGReportCreate, EEGReportUpdate
from app.schemas.user import UserCreate, UserUpdate

CREDS = {
    "username": "abcuser",
    "password": "password123",
    "confirm_password": "password123",
}


class TestBlankConstrainedFieldsBecomeNone:
    @pytest.mark.parametrize("blank", ["", "   ", "\t"])
    def test_user_register_phone(self, blank):
        assert UserRegister(**CREDS, email="a@b.com", phone=blank).phone is None

    @pytest.mark.parametrize("blank", ["", "   "])
    def test_staff_invite_phone(self, blank):
        """The exact payload behind the 422s in the log."""
        invite = StaffInviteRegister(
            **CREDS, first_name="A", last_name="B", phone=blank
        )
        assert invite.phone is None

    @pytest.mark.parametrize(
        "field", ["phone", "gender", "emergency_contact_phone", "blood_type"]
    )
    def test_patient_register_fields(self, field):
        patient = PatientRegister(**CREDS, email="a@b.com", name="N", **{field: ""})
        assert getattr(patient, field) is None

    @pytest.mark.parametrize(
        "field", ["email", "phone", "gender", "emergency_contact_phone", "blood_type"]
    )
    def test_user_create_and_update_fields(self, field):
        assert getattr(UserCreate(name="N", **{field: ""}), field) is None
        assert getattr(UserUpdate(**{field: ""}), field) is None

    def test_report_patient_gender(self):
        created = EEGReportCreate(file_id=1, patient_name="P", patient_gender="")
        assert created.patient_gender is None
        assert EEGReportUpdate(patient_gender="").patient_gender is None

    def test_hospital_signup_still_normalises(self):
        """This one worked before, via a bespoke validator now replaced by the shared type."""
        signup = HospitalAdminRegister(
            **CREDS,
            hospital_name="HH",
            first_name="A",
            last_name="B",
            email="a@b.com",
            hospital_address="",
            hospital_phone="",
            hospital_email="",
        )
        assert (signup.hospital_address, signup.hospital_phone, signup.hospital_email) == (
            None,
            None,
            None,
        )


class TestRealValuesSurvive:
    def test_a_valid_phone_is_kept(self):
        assert UserRegister(
            **CREDS, email="a@b.com", phone="+92 300 1234567"
        ).phone == "+92 300 1234567"

    def test_email_is_still_normalised(self):
        assert UserCreate(name="N", email="A@B.COM").email == "a@b.com"

    def test_a_real_gender_is_kept(self):
        assert UserCreate(name="N", gender="F").gender == "F"


class TestMalformedValuesAreStillRejected:
    @pytest.mark.parametrize(
        "field,value",
        [
            ("phone", "abc"),
            ("gender", "X"),
            ("blood_type", "Z+"),
            ("email", "nope"),
            ("emergency_contact_phone", "12"),
        ],
    )
    def test_user_create(self, field, value):
        with pytest.raises(ValidationError):
            UserCreate(name="N", **{field: value})


class TestBlankIsStillAnErrorWhereNoneIsInvalid:
    """
    `name` is min_length=1 and `users.name` is nullable=False, so normalising "" to
    None here would turn a clean 422 into a 500 on insert. `role` is required.
    """

    def test_user_create_name(self):
        with pytest.raises(ValidationError):
            UserCreate(name="")

    def test_user_update_name(self):
        with pytest.raises(ValidationError):
            UserUpdate(name="")

    def test_report_patient_name(self):
        with pytest.raises(ValidationError):
            EEGReportCreate(file_id=1, patient_name="")
        with pytest.raises(ValidationError):
            EEGReportUpdate(patient_name="")

    def test_invite_role(self):
        with pytest.raises(ValidationError):
            InviteCreate(email="a@b.com", role="")

    def test_register_username(self):
        with pytest.raises(ValidationError):
            UserRegister(
                username="",
                password="password123",
                confirm_password="password123",
                email="a@b.com",
            )


class TestThroughTheApi:
    def test_registering_a_doctor_with_a_blank_phone_succeeds(
        self, client, auth_headers, admin_a
    ):
        """The reported bug, end to end: this returned 422 before."""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "blankphone",
                "email": "blankphone@example.com",
                "password": "password123",
                "confirm_password": "password123",
                "first_name": "Blank",
                "last_name": "Phone",
                "user_type": "doctor",
                "phone": "",
                "title": "",
                "specialization": "",
                "license_number": "",
            },
            headers=auth_headers(admin_a),
        )

        assert response.status_code == 201, response.json()
        assert response.json()["phone"] is None

    def test_a_malformed_phone_is_still_refused(self, client, auth_headers, admin_a):
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "badphone",
                "email": "badphone@example.com",
                "password": "password123",
                "confirm_password": "password123",
                "first_name": "Bad",
                "last_name": "Phone",
                "user_type": "doctor",
                "phone": "abc",
            },
            headers=auth_headers(admin_a),
        )

        assert response.status_code == 422
        assert response.json()["errors"][0]["field"] == "phone"

    def test_creating_a_patient_with_a_blank_blood_type_stores_null(
        self, client, auth_headers, doctor_a
    ):
        response = client.post(
            "/api/v1/users/",
            json={
                "name": "Blank Blood Type",
                "phone": "+15550100",
                "gender": "F",
                "age": 40,
                "blood_type": "",
                "emergency_contact_phone": "",
            },
            headers=auth_headers(doctor_a),
        )

        assert response.status_code == 201, response.json()
        assert response.json()["blood_type"] is None
        assert response.json()["emergency_contact_phone"] is None

    def test_blanking_a_patients_phone_on_update_is_still_refused(
        self, client, auth_headers, doctor_a, make_patient, hospital_a
    ):
        """
        Sent-but-blank must stay an error. The guard used to be unreachable for ""
        because the schema 422'd first; it now keys off model_fields_set instead.
        """
        patient = make_patient("Phone Holder", hospital_a, auth_user=doctor_a)

        response = client.put(
            f"/api/v1/users/{patient.id}",
            json={"phone": ""},
            headers=auth_headers(doctor_a),
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Phone is required"

    def test_blanking_a_patients_gender_on_update_is_still_refused(
        self, client, auth_headers, doctor_a, make_patient, hospital_a
    ):
        patient = make_patient("Gender Holder", hospital_a, auth_user=doctor_a)

        response = client.put(
            f"/api/v1/users/{patient.id}",
            json={"gender": ""},
            headers=auth_headers(doctor_a),
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Gender is required"

    def test_blanking_an_optional_field_on_update_clears_it(
        self, client, auth_headers, doctor_a, make_patient, hospital_a
    ):
        patient = make_patient("Blood Type Holder", hospital_a, auth_user=doctor_a)

        response = client.put(
            f"/api/v1/users/{patient.id}",
            json={"blood_type": ""},
            headers=auth_headers(doctor_a),
        )

        assert response.status_code == 200, response.json()
        assert response.json()["blood_type"] is None
