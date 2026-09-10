"""
Multi-tenant isolation: a user of one hospital must not reach another's data.

This is the highest-consequence property in the platform — the rows involved are
patient EEG recordings — and the part of the suite most worth keeping green.

The second half of this file documents a gap rather than a guarantee. Seven routes
in app/api/v1/endpoints/signals.py, and all four in processing.py, take only
``db: Session = Depends(get_db)``: no authentication, no hospital scoping. Those
tests are marked ``xfail(strict=True)``, so they fail today by design and will fail
*again* — as XPASS — the moment the routes are fixed, forcing the marker to be
removed rather than quietly rotting. See the plan's Follow-ups.
"""

import pytest

OPEN_ROUTE_REASON = (
    "route takes no current_user dependency — unauthenticated callers can reach "
    "another hospital's data by guessing an integer id"
)


@pytest.fixture
def file_in_a(make_patient, make_signal_file, hospital_a, doctor_a):
    patient = make_patient("Patient A", hospital_a, doctor_a)
    return make_signal_file(patient, hospital_a, filename="hospital_a.edf")


@pytest.fixture
def file_in_b(make_patient, make_signal_file, hospital_b, doctor_b):
    patient = make_patient("Patient B", hospital_b, doctor_b)
    return make_signal_file(patient, hospital_b, filename="hospital_b.edf")


class TestFileListingIsScopedToOneHospital:
    """GET /signals/files filters on hospital_id. This part works."""

    def test_a_doctor_sees_their_own_hospitals_files(
        self, client, doctor_a, auth_headers, file_in_a, file_in_b
    ):
        response = client.get("/api/v1/signals/files", headers=auth_headers(doctor_a))

        assert response.status_code == 200
        filenames = [f["filename"] for f in response.json()]
        assert filenames == ["hospital_a.edf"]

    def test_a_doctor_does_not_see_another_hospitals_files(
        self, client, doctor_b, auth_headers, file_in_a, file_in_b
    ):
        response = client.get("/api/v1/signals/files", headers=auth_headers(doctor_b))

        assert response.status_code == 200
        filenames = [f["filename"] for f in response.json()]
        assert "hospital_a.edf" not in filenames

    def test_a_technician_sees_every_file_in_their_hospital_only(
        self, client, technician_a, auth_headers, file_in_a, file_in_b
    ):
        response = client.get("/api/v1/signals/files", headers=auth_headers(technician_a))

        assert response.status_code == 200
        filenames = [f["filename"] for f in response.json()]
        assert filenames == ["hospital_a.edf"]

    def test_a_doctor_with_no_hospital_sees_nothing_from_a_real_hospital(
        self, client, db_session, password_hash, auth_headers, file_in_a
    ):
        from app.models.auth import AuthUser, UserType

        orphan = AuthUser(
            username="orphan",
            email="orphan@example.test",
            hashed_password=password_hash,
            user_type=UserType.DOCTOR.value,
            hospital_id=None,
            is_active=True,
        )
        db_session.add(orphan)
        db_session.commit()
        db_session.refresh(orphan)

        response = client.get("/api/v1/signals/files", headers=auth_headers(orphan))

        assert response.status_code == 200
        assert response.json() == []

    def test_listing_requires_authentication(self, client, file_in_a):
        assert client.get("/api/v1/signals/files").status_code == 401


class TestDevAdminRequiresSuperuser:
    """The cross-hospital portal is gated by get_current_superuser."""

    def test_a_superuser_gets_in(self, client, superuser, auth_headers):
        response = client.get(
            "/api/v1/dev-admin/hospitals", headers=auth_headers(superuser)
        )
        assert response.status_code == 200

    def test_a_hospital_admin_is_forbidden(self, client, admin_a, auth_headers):
        response = client.get(
            "/api/v1/dev-admin/hospitals", headers=auth_headers(admin_a)
        )
        assert response.status_code == 403

    def test_a_doctor_is_forbidden(self, client, doctor_a, auth_headers):
        response = client.get(
            "/api/v1/dev-admin/hospitals", headers=auth_headers(doctor_a)
        )
        assert response.status_code == 403

    def test_anonymous_is_unauthorised(self, client):
        assert client.get("/api/v1/dev-admin/hospitals").status_code == 401


class TestUnauthenticatedSignalRoutes:
    """
    Every test here asserts the property the routes *should* have. They are expected
    to fail until the routes gain a current_user dependency.
    """

    @pytest.mark.xfail(strict=True, reason=OPEN_ROUTE_REASON)
    @pytest.mark.parametrize(
        "path_suffix",
        [
            "",
            "/signals",
            "/signal-data",
            "/topomap",
            "/inference-status",
            "/report-status",
            "/download",
        ],
    )
    def test_reading_a_file_should_require_authentication(
        self, client, file_in_a, path_suffix
    ):
        response = client.get(f"/api/v1/signals/files/{file_in_a.id}{path_suffix}")
        assert response.status_code in (401, 403)

    @pytest.mark.xfail(strict=True, reason=OPEN_ROUTE_REASON)
    def test_deleting_a_file_should_require_authentication(
        self, client, local_storage, file_in_a
    ):
        response = client.delete(f"/api/v1/signals/files/{file_in_a.id}")
        assert response.status_code in (401, 403)

    @pytest.mark.xfail(strict=True, reason=OPEN_ROUTE_REASON)
    def test_a_doctor_should_not_read_another_hospitals_file(
        self, client, doctor_a, auth_headers, file_in_b
    ):
        response = client.get(
            f"/api/v1/signals/files/{file_in_b.id}", headers=auth_headers(doctor_a)
        )
        assert response.status_code in (403, 404)

    @pytest.mark.xfail(strict=True, reason=OPEN_ROUTE_REASON)
    def test_a_doctor_should_not_delete_another_hospitals_file(
        self, client, local_storage, doctor_a, auth_headers, file_in_b
    ):
        response = client.delete(
            f"/api/v1/signals/files/{file_in_b.id}", headers=auth_headers(doctor_a)
        )
        assert response.status_code in (403, 404)


class TestUnauthenticatedProcessingRoutes:
    """
    The /processing router is not used by the frontend, but it is mounted and open.
    """

    @pytest.mark.xfail(strict=True, reason=OPEN_ROUTE_REASON)
    def test_processing_status_should_require_authentication(self, client, file_in_a):
        response = client.get(f"/api/v1/processing/status/{file_in_a.id}")
        assert response.status_code in (401, 403)


class TestTheGapIsRealNotTheoretical:
    """
    The mirror image of the xfail block: these assert what actually happens today,
    so the exposure is visible in the test output rather than only in a skip reason.

    When the routes are fixed these will fail and should be deleted along with the
    xfail markers above.
    """

    def test_an_anonymous_caller_can_currently_read_a_files_metadata(
        self, client, file_in_a
    ):
        response = client.get(f"/api/v1/signals/files/{file_in_a.id}")

        assert response.status_code == 200
        assert response.json()["filename"] == "hospital_a.edf"

    def test_an_anonymous_caller_can_currently_delete_a_file(
        self, client, local_storage, file_in_a
    ):
        from app.models.signal import SignalFile

        response = client.delete(f"/api/v1/signals/files/{file_in_a.id}")

        assert response.status_code == 200
        remaining = client.get(f"/api/v1/signals/files/{file_in_a.id}")
        assert remaining.status_code == 404
