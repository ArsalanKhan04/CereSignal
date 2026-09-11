"""
Multi-tenant isolation: a user of one hospital must not reach another's data.

This is the highest-consequence property in the platform — the rows involved are
patient EEG recordings — and the part of the suite most worth keeping green.

Every per-file and per-report route resolves its path parameter through
``app/core/access.py`` rather than querying by id itself, so these tests exercise
one rule in many places. Two things about that rule are easy to regress and are
asserted exactly rather than loosely:

* the denial code carries information. A row in another hospital is a **404**, so
  a sequential id cannot be walked to discover what another tenant holds; a row
  inside the caller's own hospital but assigned to a colleague is a **403**. An
  assertion of ``in (403, 404)`` would let a leak through.
* read access does not imply write access. A patient may read their own study and
  may not relabel, annotate or delete it (``forbid_patients``).

An earlier revision of this file pinned the *absence* of these checks with
``xfail(strict=True)``, because seven signal routes — and all four routes of a
``processing.py`` that has since been deleted — took no ``current_user`` dependency
at all. Those markers came off when the routes were fixed; what is below is what
they turned into.
"""

import pytest


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


class TestPerFileRoutesAreScoped:
    """
    Every route that takes a ``{file_id}`` resolves it through get_accessible_file,
    so authentication and tenant scoping hold uniformly rather than per-handler.
    The parametrised list is the whole surface: adding a ``/files/{file_id}/...``
    route without the dependency should make this fail.
    """

    FILE_ROUTES = [
        "",
        "/signals",
        "/signal-data",
        "/plot-data",
        "/topomap",
        "/events",
        "/bookmarks",
        "/inference-status",
        "/report-status",
        "/download",
    ]

    @pytest.mark.parametrize("path_suffix", FILE_ROUTES)
    def test_reading_a_file_requires_authentication(
        self, client, file_in_a, path_suffix
    ):
        response = client.get(f"/api/v1/signals/files/{file_in_a.id}{path_suffix}")
        assert response.status_code == 401

    def test_deleting_a_file_requires_authentication(
        self, client, local_storage, file_in_a
    ):
        response = client.delete(f"/api/v1/signals/files/{file_in_a.id}")
        assert response.status_code == 401

    def test_relabelling_a_file_requires_authentication(self, client, file_in_a):
        response = client.patch(
            f"/api/v1/signals/files/{file_in_a.id}/label",
            json={"condition": "normal"},
        )
        assert response.status_code == 401

    @pytest.mark.parametrize("path_suffix", FILE_ROUTES)
    def test_a_doctor_cannot_read_another_hospitals_file(
        self, client, doctor_a, auth_headers, file_in_b, path_suffix
    ):
        response = client.get(
            f"/api/v1/signals/files/{file_in_b.id}{path_suffix}",
            headers=auth_headers(doctor_a),
        )
        assert response.status_code == 404

    def test_a_doctor_cannot_delete_another_hospitals_file(
        self, client, local_storage, doctor_a, auth_headers, file_in_b, db_session
    ):
        from app.models.signal import SignalFile

        response = client.delete(
            f"/api/v1/signals/files/{file_in_b.id}", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 404
        assert db_session.get(SignalFile, file_in_b.id) is not None

    def test_a_doctor_can_delete_their_own_patients_file(
        self, client, local_storage, doctor_a, auth_headers, file_in_a, db_session
    ):
        from app.models.signal import SignalFile

        response = client.delete(
            f"/api/v1/signals/files/{file_in_a.id}", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200
        db_session.expire_all()
        assert db_session.get(SignalFile, file_in_a.id) is None

    def test_a_technician_cannot_read_another_hospitals_file(
        self, client, technician_a, auth_headers, file_in_b
    ):
        response = client.get(
            f"/api/v1/signals/files/{file_in_b.id}", headers=auth_headers(technician_a)
        )
        assert response.status_code == 404


class TestFileDenialDoesNotLeakExistence:
    """
    access.py:102 splits the denial deliberately: 403 says "this row is in your
    hospital but is not yours", which is only safe to say about a row the caller
    already knows exists. Everything else is 404, including ids that exist in
    another hospital — otherwise walking 1..n maps another tenant's inventory.
    """

    def test_another_hospitals_file_is_indistinguishable_from_a_missing_one(
        self, client, doctor_a, auth_headers, file_in_b
    ):
        real = client.get(
            f"/api/v1/signals/files/{file_in_b.id}", headers=auth_headers(doctor_a)
        )
        imaginary = client.get(
            "/api/v1/signals/files/999999", headers=auth_headers(doctor_a)
        )

        assert real.status_code == imaginary.status_code == 404
        assert real.json()["detail"] == imaginary.json()["detail"]

    def test_a_colleagues_patient_in_the_same_hospital_is_403(
        self, client, doctor_a, doctor_a2, auth_headers, make_patient,
        make_signal_file, hospital_a,
    ):
        from app.core.access import DOCTOR_FILE_DENIED

        patient = make_patient("Colleague's Patient", hospital_a, doctor_a2)
        file = make_signal_file(patient, hospital_a, filename="colleague.edf")

        response = client.get(
            f"/api/v1/signals/files/{file.id}", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 403
        assert response.json()["detail"] == DOCTOR_FILE_DENIED

    def test_an_unassigned_patient_in_the_same_hospital_is_readable(
        self, client, doctor_a, auth_headers, make_patient, make_signal_file,
        hospital_a,
    ):
        """
        The or_(auth_user_id == me, auth_user_id IS NULL) arm at access.py:67.
        Studies uploaded before a doctor is assigned must stay reachable, or a
        technician's upload is invisible until someone claims it.
        """
        patient = make_patient("Unassigned", hospital_a, auth_user=None)
        file = make_signal_file(patient, hospital_a, filename="unassigned.edf")

        response = client.get(
            f"/api/v1/signals/files/{file.id}", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200
        assert response.json()["filename"] == "unassigned.edf"

    def test_a_staff_account_with_no_hospital_reaches_nothing(
        self, client, db_session, password_hash, auth_headers, file_in_a
    ):
        """
        `hospital_id == None` compiles to IS NULL, so the naive scoping would hand
        a hospital-less account every orphaned row. access.py:57 returns false()
        instead — and the denial is 404, not 403, since there is no tenant to
        compare against.
        """
        from app.models.auth import AuthUser, UserType

        orphan = AuthUser(
            username="orphan_doctor",
            email="orphan_doctor@example.test",
            hashed_password=password_hash,
            user_type=UserType.DOCTOR.value,
            hospital_id=None,
            is_active=True,
        )
        db_session.add(orphan)
        db_session.commit()
        db_session.refresh(orphan)

        response = client.get(
            f"/api/v1/signals/files/{file_in_a.id}", headers=auth_headers(orphan)
        )
        assert response.status_code == 404

    def test_a_superuser_reaches_every_hospital(
        self, client, superuser, auth_headers, file_in_a, file_in_b
    ):
        for file in (file_in_a, file_in_b):
            response = client.get(
                f"/api/v1/signals/files/{file.id}", headers=auth_headers(superuser)
            )
            assert response.status_code == 200


class TestPatientsCanReadButNotWrite:
    """
    forbid_patients (access.py:168) exists because get_accessible_file answers only
    "may this user see the row". A patient seeing their own study must not be able
    to relabel, annotate or delete it.
    """

    @pytest.fixture
    def own_file(self, make_patient, make_signal_file, hospital_a, patient_a):
        patient = make_patient("Self", hospital_a, patient_auth_user=patient_a)
        return make_signal_file(patient, hospital_a, filename="my_own.edf")

    def test_a_patient_reads_their_own_study(
        self, client, patient_a, auth_headers, own_file
    ):
        response = client.get(
            f"/api/v1/signals/files/{own_file.id}", headers=auth_headers(patient_a)
        )

        assert response.status_code == 200
        assert response.json()["filename"] == "my_own.edf"

    def test_a_patient_cannot_delete_their_own_study(
        self, client, local_storage, patient_a, auth_headers, own_file, db_session
    ):
        from app.models.signal import SignalFile

        response = client.delete(
            f"/api/v1/signals/files/{own_file.id}", headers=auth_headers(patient_a)
        )

        assert response.status_code == 403
        assert db_session.get(SignalFile, own_file.id) is not None

    def test_a_patient_cannot_relabel_their_own_study(
        self, client, patient_a, auth_headers, own_file
    ):
        response = client.patch(
            f"/api/v1/signals/files/{own_file.id}/label",
            json={"condition": "normal"},
            headers=auth_headers(patient_a),
        )
        assert response.status_code == 403

    def test_a_patient_cannot_bookmark_their_own_study(
        self, client, patient_a, auth_headers, own_file
    ):
        response = client.post(
            f"/api/v1/signals/files/{own_file.id}/bookmarks",
            json={"comment": "spike here", "image_base64": "iVBORw0KGgo="},
            headers=auth_headers(patient_a),
        )
        assert response.status_code == 403

    def test_a_patient_cannot_read_another_patients_study(
        self, client, patient_a, auth_headers, file_in_b
    ):
        response = client.get(
            f"/api/v1/signals/files/{file_in_b.id}", headers=auth_headers(patient_a)
        )
        assert response.status_code == 404

    def test_a_patient_account_with_no_users_row_reaches_nothing(
        self, client, patient_a, auth_headers, file_in_a
    ):
        """
        patient_a here has no `users` row pointing back at it, so
        _own_patient_record returns None and the query collapses to false().
        A patient login that matched on hospital instead would see the ward.
        """
        listed = client.get("/api/v1/signals/files", headers=auth_headers(patient_a))
        assert listed.status_code == 200
        assert listed.json() == []

        single = client.get(
            f"/api/v1/signals/files/{file_in_a.id}", headers=auth_headers(patient_a)
        )
        assert single.status_code == 404

        reports = client.get("/api/v1/reports/", headers=auth_headers(patient_a))
        assert reports.status_code == 200
        assert reports.json() == []


class TestReportsAreScopedToOneHospital:
    """
    The report half of access.py. get_accessible_report is 404-only by design
    (access.py:157) — reports.py never returned 403 and the split is not worth
    introducing there.
    """

    @pytest.fixture
    def report_in_a(self, make_report, file_in_a, hospital_a, doctor_a):
        return make_report(file_in_a, hospital_a, doctor_a, patient_name="Patient A")

    @pytest.fixture
    def report_in_b(self, make_report, file_in_b, hospital_b, doctor_b):
        return make_report(file_in_b, hospital_b, doctor_b, patient_name="Patient B")

    def test_listing_requires_authentication(self, client, report_in_a):
        assert client.get("/api/v1/reports/").status_code == 401

    def test_a_doctor_lists_only_their_own_hospitals_reports(
        self, client, doctor_a, auth_headers, report_in_a, report_in_b
    ):
        response = client.get("/api/v1/reports/", headers=auth_headers(doctor_a))

        assert response.status_code == 200
        names = [r["patient_name"] for r in response.json()]
        assert names == ["Patient A"]

    def test_a_technician_lists_their_whole_hospital_and_no_more(
        self, client, technician_a, auth_headers, report_in_a, report_in_b
    ):
        """
        get_reports filtered on SignalFile columns without joining SignalFile for
        technicians, which made SQLAlchemy emit a cross join and hand back every
        report in the table (access.py:74). visible_reports always joins.
        """
        response = client.get("/api/v1/reports/", headers=auth_headers(technician_a))

        assert response.status_code == 200
        names = [r["patient_name"] for r in response.json()]
        assert names == ["Patient A"]

    def test_a_doctor_reads_their_own_hospitals_report(
        self, client, doctor_a, auth_headers, report_in_a
    ):
        response = client.get(
            f"/api/v1/reports/{report_in_a.id}", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200
        assert response.json()["patient_name"] == "Patient A"

    def test_a_patient_lists_only_their_own_reports(
        self, client, patient_a, auth_headers, make_patient, make_signal_file,
        make_report, hospital_a, doctor_a, report_in_b,
    ):
        """
        Reports are scoped through the *file's* owner, not the report's author —
        a patient never authors one, so filtering on EEGReport.auth_user_id would
        show them nothing at all (access.py:88).
        """
        mine = make_patient("Self", hospital_a, patient_auth_user=patient_a)
        my_file = make_signal_file(mine, hospital_a, filename="mine.edf")
        make_report(my_file, hospital_a, doctor_a, patient_name="Self")

        response = client.get("/api/v1/reports/", headers=auth_headers(patient_a))

        assert response.status_code == 200
        names = [r["patient_name"] for r in response.json()]
        assert names == ["Self"]

    def test_a_staff_account_with_no_hospital_lists_no_reports(
        self, client, db_session, password_hash, auth_headers, report_in_a
    ):
        from app.models.auth import AuthUser, UserType

        orphan = AuthUser(
            username="orphan_reader",
            email="orphan_reader@example.test",
            hashed_password=password_hash,
            user_type=UserType.TECHNICIAN.value,
            hospital_id=None,
            is_active=True,
        )
        db_session.add(orphan)
        db_session.commit()
        db_session.refresh(orphan)

        response = client.get("/api/v1/reports/", headers=auth_headers(orphan))

        assert response.status_code == 200
        assert response.json() == []

    def test_a_doctor_cannot_read_another_hospitals_report(
        self, client, doctor_a, auth_headers, report_in_b
    ):
        response = client.get(
            f"/api/v1/reports/{report_in_b.id}", headers=auth_headers(doctor_a)
        )
        assert response.status_code == 404

    def test_a_doctor_cannot_edit_another_hospitals_report(
        self, client, doctor_a, auth_headers, report_in_b, db_session
    ):
        from app.models.report import EEGReport

        response = client.put(
            f"/api/v1/reports/{report_in_b.id}",
            json={"impression": "overwritten"},
            headers=auth_headers(doctor_a),
        )

        assert response.status_code == 404
        db_session.expire_all()
        assert db_session.get(EEGReport, report_in_b.id).impression != "overwritten"

    def test_a_doctor_cannot_delete_another_hospitals_report(
        self, client, doctor_a, auth_headers, report_in_b, db_session
    ):
        from app.models.report import EEGReport

        response = client.delete(
            f"/api/v1/reports/{report_in_b.id}", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 404
        assert db_session.get(EEGReport, report_in_b.id) is not None

    def test_the_by_file_lookup_is_scoped_too(
        self, client, doctor_a, auth_headers, file_in_b, report_in_b
    ):
        """GET /reports/file/{file_id} takes a file id, so it scopes on the file."""
        response = client.get(
            f"/api/v1/reports/file/{file_in_b.id}", headers=auth_headers(doctor_a)
        )
        assert response.status_code == 404

    def test_a_superuser_reaches_every_hospitals_reports(
        self, client, superuser, auth_headers, report_in_a, report_in_b
    ):
        response = client.get("/api/v1/reports/", headers=auth_headers(superuser))

        assert response.status_code == 200
        names = sorted(r["patient_name"] for r in response.json())
        assert names == ["Patient A", "Patient B"]
