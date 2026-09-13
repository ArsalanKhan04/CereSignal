"""
Tests for the report version-history routes in
``app/api/v1/endpoints/reports.py`` — ``GET /{id}/versions``,
``GET /{id}/versions/{version_id}`` and ``POST /{id}/versions/{version_id}/restore``.

The whole feature was untested. It matters twice over: a version row is a snapshot
of a signed clinical document, and ``restore`` is the one route that rewrites a
report wholesale from a caller-supplied id.

Both id path segments are attacker-controlled, so every test that reaches a row
has a twin that reaches for someone else's.
"""

import pytest

from app.models.report import EEGReportVersion

BASE = "/api/v1/reports"


@pytest.fixture
def report_a(db_session, make_signal_file, make_report, make_patient, hospital_a, doctor_a):
    patient = make_patient("Version Patient", hospital_a, auth_user=doctor_a)
    sf = make_signal_file(patient, hospital_a)
    return make_report(sf, hospital_a, doctor_a, patient_name="Version Patient",
                       impression="normal", factual_report="v-live")


@pytest.fixture
def make_version(db_session):
    def _make(report, number, **kwargs):
        fields = {
            "patient_name": report.patient_name,
            "impression": report.impression,
            "factual_report": f"v{number}",
            "is_finalized": False,
        }
        fields.update(kwargs)
        v = EEGReportVersion(
            report_id=report.id, version_number=number,
            saved_by_auth_user_id=report.auth_user_id, **fields,
        )
        db_session.add(v)
        db_session.commit()
        db_session.refresh(v)
        return v

    return _make


class TestListVersions:
    def test_versions_come_back_in_version_order(
        self, client, auth_headers, doctor_a, report_a, make_version
    ):
        make_version(report_a, 2)
        make_version(report_a, 1)
        make_version(report_a, 3)

        rows = client.get(f"{BASE}/{report_a.id}/versions", headers=auth_headers(doctor_a)).json()

        assert [r["version_number"] for r in rows] == [1, 2, 3]

    def test_the_saver_name_is_resolved(
        self, client, auth_headers, doctor_a, report_a, make_version
    ):
        make_version(report_a, 1)

        rows = client.get(f"{BASE}/{report_a.id}/versions", headers=auth_headers(doctor_a)).json()

        expected = f"{doctor_a.first_name or ''} {doctor_a.last_name or ''}".strip() or doctor_a.username
        assert rows[0]["saved_by_name"] == expected

    def test_a_report_with_no_versions_returns_an_empty_list(
        self, client, auth_headers, doctor_a, report_a
    ):
        assert client.get(f"{BASE}/{report_a.id}/versions",
                          headers=auth_headers(doctor_a)).json() == []

    def test_another_hospital_gets_404_not_403(
        self, client, auth_headers, doctor_b, report_a, make_version
    ):
        """404 so a sequential id cannot be used to probe another hospital."""
        make_version(report_a, 1)

        r = client.get(f"{BASE}/{report_a.id}/versions", headers=auth_headers(doctor_b))

        assert r.status_code == 404

    def test_an_anonymous_caller_is_refused(self, client, report_a):
        assert client.get(f"{BASE}/{report_a.id}/versions").status_code in (401, 403)


class TestGetSingleVersion:
    def test_a_version_can_be_fetched(
        self, client, auth_headers, doctor_a, report_a, make_version
    ):
        v = make_version(report_a, 1, factual_report="the old text")

        r = client.get(f"{BASE}/{report_a.id}/versions/{v.id}", headers=auth_headers(doctor_a))

        assert r.status_code == 200
        assert r.json()["factual_report"] == "the old text"

    def test_fetching_does_not_mutate_the_live_report(
        self, client, auth_headers, doctor_a, report_a, make_version, db_session
    ):
        """A GET must be safe — it is next to a restore route that looks almost identical."""
        v = make_version(report_a, 1, factual_report="the old text")

        client.get(f"{BASE}/{report_a.id}/versions/{v.id}", headers=auth_headers(doctor_a))

        db_session.refresh(report_a)
        assert report_a.factual_report == "v-live"

    def test_a_version_belonging_to_another_report_is_a_404(
        self, client, auth_headers, doctor_a, report_a, make_version,
        make_signal_file, make_report, make_patient, hospital_a, db_session
    ):
        """The version id is filtered by report_id, so cross-report ids must not resolve."""
        other_patient = make_patient("Other", hospital_a, auth_user=doctor_a)
        other_report = make_report(make_signal_file(other_patient, hospital_a), hospital_a, doctor_a)
        foreign = make_version(other_report, 1)

        r = client.get(f"{BASE}/{report_a.id}/versions/{foreign.id}", headers=auth_headers(doctor_a))

        assert r.status_code == 404

    def test_an_unknown_version_is_a_404(self, client, auth_headers, doctor_a, report_a):
        assert client.get(f"{BASE}/{report_a.id}/versions/999999",
                          headers=auth_headers(doctor_a)).status_code == 404


class TestRestoreVersion:
    def test_restoring_copies_the_snapshot_onto_the_live_report(
        self, client, auth_headers, doctor_a, report_a, make_version, db_session
    ):
        v = make_version(report_a, 1, factual_report="restored text", impression="abnormal")

        r = client.post(f"{BASE}/{report_a.id}/versions/{v.id}/restore",
                        headers=auth_headers(doctor_a))

        assert r.status_code == 200
        db_session.refresh(report_a)
        assert report_a.factual_report == "restored text"
        assert report_a.impression == "abnormal"

    def test_restoring_snapshots_the_state_it_overwrote(
        self, client, auth_headers, doctor_a, report_a, make_version, db_session
    ):
        """The rollback itself must be recoverable, or a misclick loses the live text."""
        v = make_version(report_a, 1, factual_report="restored text")

        client.post(f"{BASE}/{report_a.id}/versions/{v.id}/restore", headers=auth_headers(doctor_a))

        saved = {row.factual_report for row in
                 db_session.query(EEGReportVersion).filter_by(report_id=report_a.id).all()}
        assert "v-live" in saved

    def test_restoring_syncs_the_signal_file_condition(
        self, client, auth_headers, doctor_a, report_a, make_version, db_session
    ):
        v = make_version(report_a, 1, impression="abnormal")

        client.post(f"{BASE}/{report_a.id}/versions/{v.id}/restore", headers=auth_headers(doctor_a))

        db_session.refresh(report_a)
        assert report_a.signal_file.condition == "abnormal"

    def test_a_patient_cannot_restore(
        self, client, auth_headers, patient_a, report_a, make_version,
        make_patient, hospital_a, doctor_a, db_session
    ):
        """Read access to your own report does not imply the right to rewrite it."""
        make_patient("Version Patient", hospital_a, auth_user=doctor_a,
                     patient_auth_user=patient_a)
        v = make_version(report_a, 1, factual_report="restored text")

        r = client.post(f"{BASE}/{report_a.id}/versions/{v.id}/restore",
                        headers=auth_headers(patient_a))

        assert r.status_code in (403, 404)
        db_session.refresh(report_a)
        assert report_a.factual_report == "v-live"

    def test_another_hospital_cannot_restore(
        self, client, auth_headers, doctor_b, report_a, make_version, db_session
    ):
        v = make_version(report_a, 1, factual_report="restored text")

        r = client.post(f"{BASE}/{report_a.id}/versions/{v.id}/restore",
                        headers=auth_headers(doctor_b))

        assert r.status_code == 404
        db_session.refresh(report_a)
        assert report_a.factual_report == "v-live"

    def test_an_unknown_version_is_a_404(self, client, auth_headers, doctor_a, report_a):
        assert client.post(f"{BASE}/{report_a.id}/versions/999999/restore",
                           headers=auth_headers(doctor_a)).status_code == 404

    def test_an_anonymous_caller_is_refused(self, client, report_a, make_version):
        v = make_version(report_a, 1)

        assert client.post(f"{BASE}/{report_a.id}/versions/{v.id}/restore").status_code in (401, 403)
