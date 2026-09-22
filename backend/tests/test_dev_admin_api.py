"""
The dev-admin portal's hospital detail, downloads and contact inbox.

Every route here is cross-hospital by design, so the only gate is
get_current_superuser. The download routes additionally pin the file or report to
the hospital in the path: a superuser asking for hospital A's file under hospital
B's id must get 404, or the per-hospital download buttons would serve the wrong
tenant's recording.
"""

import io
import zipfile

import pytest

from app.models.contact import ContactSubmission
from app.services.storage_service import SIGNALS_BUCKET

BASE = "/api/v1/dev-admin"


@pytest.fixture
def recording(make_patient, make_signal_file, local_storage, hospital_a, doctor_a):
    """A file in hospital A whose object actually exists in storage."""
    patient = make_patient("Dev Admin Patient", hospital_a, auth_user=doctor_a)
    signal_file = make_signal_file(patient, hospital_a, filename="rec.edf")
    local_storage.upload(SIGNALS_BUCKET, signal_file.file_path, b"EDF-BYTES")
    return signal_file


@pytest.fixture
def report_with_pdf(recording, make_report, local_storage, hospital_a, doctor_a):
    report = make_report(
        recording, hospital_a, doctor_a,
        patient_name="Jane Doe", pdf_file_path="reports/jane.pdf",
    )
    local_storage.upload(SIGNALS_BUCKET, "reports/jane.pdf", b"%PDF-1.4 fake")
    return report


@pytest.fixture
def contacts(db_session):
    rows = [
        ContactSubmission(first_name="Ann", last_name="Read", email="a@example.com", is_read=True),
        ContactSubmission(first_name="Bob", last_name="Unread", email="b@example.com"),
        ContactSubmission(first_name="Cy", last_name="Unread", email="c@example.com"),
    ]
    db_session.add_all(rows)
    db_session.commit()
    for row in rows:
        db_session.refresh(row)
    return rows


class TestOnlyTheSuperuserGetsIn:
    @pytest.mark.parametrize("path", [
        "/hospitals/{hid}",
        "/hospitals/{hid}/download",
        "/contacts",
    ])
    def test_hospital_admin_is_refused(self, client, auth_headers, admin_a, hospital_a, path):
        response = client.get(BASE + path.format(hid=hospital_a.id), headers=auth_headers(admin_a))
        assert response.status_code == 403

    def test_anonymous_is_refused(self, client, hospital_a):
        assert client.get(f"{BASE}/hospitals/{hospital_a.id}").status_code == 401

    def test_contact_toggle_is_refused_to_doctors(self, client, auth_headers, doctor_a, contacts):
        response = client.put(
            f"{BASE}/contacts/{contacts[1].id}/read", headers=auth_headers(doctor_a)
        )
        assert response.status_code == 403
        assert contacts[1].is_read is False


class TestHospitalDetail:
    def test_lists_staff_files_and_reports(
        self, client, auth_headers, superuser, hospital_a, doctor_a, technician_a, report_with_pdf
    ):
        response = client.get(f"{BASE}/hospitals/{hospital_a.id}", headers=auth_headers(superuser))

        assert response.status_code == 200
        body = response.json()
        assert body["code"] == hospital_a.code
        assert {s["id"] for s in body["staff"]} >= {doctor_a.id, technician_a.id}
        assert [f["original_filename"] for f in body["files"]] == ["rec.edf"]
        assert body["files"][0]["patient_name"] == "Dev Admin Patient"
        assert body["total_files"] == 1
        [report] = body["reports"]
        assert report["id"] == report_with_pdf.id
        assert report["has_pdf"] is True

    def test_excludes_other_hospitals_rows(
        self, client, auth_headers, superuser, hospital_b, recording
    ):
        body = client.get(
            f"{BASE}/hospitals/{hospital_b.id}", headers=auth_headers(superuser)
        ).json()
        assert body["files"] == []
        assert body["reports"] == []

    def test_unknown_hospital_is_404(self, client, auth_headers, superuser):
        response = client.get(f"{BASE}/hospitals/999999", headers=auth_headers(superuser))
        assert response.status_code == 404


class TestSingleDownloads:
    def test_file_download_streams_the_stored_object(
        self, client, auth_headers, superuser, hospital_a, recording
    ):
        response = client.get(
            f"{BASE}/hospitals/{hospital_a.id}/files/{recording.id}/download",
            headers=auth_headers(superuser),
        )
        assert response.status_code == 200
        assert response.content == b"EDF-BYTES"
        assert 'filename="rec.edf"' in response.headers["content-disposition"]

    def test_file_under_the_wrong_hospital_is_404(
        self, client, auth_headers, superuser, hospital_b, recording
    ):
        response = client.get(
            f"{BASE}/hospitals/{hospital_b.id}/files/{recording.id}/download",
            headers=auth_headers(superuser),
        )
        assert response.status_code == 404

    def test_missing_object_is_500_not_a_crash(
        self, client, auth_headers, superuser, hospital_a, recording, local_storage
    ):
        local_storage.delete(SIGNALS_BUCKET, recording.file_path)
        response = client.get(
            f"{BASE}/hospitals/{hospital_a.id}/files/{recording.id}/download",
            headers=auth_headers(superuser),
        )
        assert response.status_code == 500
        assert response.json()["detail"] == "File download failed"

    def test_report_download_streams_the_pdf(
        self, client, auth_headers, superuser, hospital_a, report_with_pdf
    ):
        response = client.get(
            f"{BASE}/hospitals/{hospital_a.id}/reports/{report_with_pdf.id}/download",
            headers=auth_headers(superuser),
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content == b"%PDF-1.4 fake"
        assert f"report_Jane_Doe_{report_with_pdf.id}.pdf" in response.headers["content-disposition"]

    def test_report_under_the_wrong_hospital_is_404(
        self, client, auth_headers, superuser, hospital_b, report_with_pdf
    ):
        response = client.get(
            f"{BASE}/hospitals/{hospital_b.id}/reports/{report_with_pdf.id}/download",
            headers=auth_headers(superuser),
        )
        assert response.status_code == 404

    def test_report_without_a_pdf_is_404(
        self, client, auth_headers, superuser, hospital_a, doctor_a, recording, make_report
    ):
        report = make_report(recording, hospital_a, doctor_a)
        response = client.get(
            f"{BASE}/hospitals/{hospital_a.id}/reports/{report.id}/download",
            headers=auth_headers(superuser),
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "PDF not available for this report"


class TestBulkDownload:
    def test_zip_holds_the_recordings_and_pdfs(
        self, client, auth_headers, superuser, hospital_a, recording, report_with_pdf
    ):
        response = client.get(
            f"{BASE}/hospitals/{hospital_a.id}/download", headers=auth_headers(superuser)
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        archive = zipfile.ZipFile(io.BytesIO(response.content))
        # The id prefix keeps two uploads of the same name apart in one archive.
        assert archive.read(f"edf/{recording.id}_rec.edf") == b"EDF-BYTES"
        assert archive.read(f"reports/Jane_Doe_{report_with_pdf.id}.pdf") == b"%PDF-1.4 fake"

    def test_a_missing_object_is_skipped_not_fatal(
        self, client, auth_headers, superuser, hospital_a, report_with_pdf, recording, local_storage
    ):
        local_storage.delete(SIGNALS_BUCKET, recording.file_path)
        response = client.get(
            f"{BASE}/hospitals/{hospital_a.id}/download", headers=auth_headers(superuser)
        )

        assert response.status_code == 200
        names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
        assert names == [f"reports/Jane_Doe_{report_with_pdf.id}.pdf"]

    def test_unknown_hospital_is_404(self, client, auth_headers, superuser, local_storage):
        response = client.get(f"{BASE}/hospitals/999999/download", headers=auth_headers(superuser))
        assert response.status_code == 404


class TestContactInbox:
    def test_lists_everything_with_the_unread_count(self, client, auth_headers, superuser, contacts):
        body = client.get(f"{BASE}/contacts", headers=auth_headers(superuser)).json()
        assert body["total"] == 3
        assert body["unread_count"] == 2
        assert len(body["items"]) == 3

    def test_unread_only_filters(self, client, auth_headers, superuser, contacts):
        body = client.get(
            f"{BASE}/contacts", params={"unread_only": True}, headers=auth_headers(superuser)
        ).json()
        assert body["total"] == 2
        assert {c["last_name"] for c in body["items"]} == {"Unread"}

    def test_pagination(self, client, auth_headers, superuser, contacts):
        body = client.get(
            f"{BASE}/contacts", params={"skip": 1, "limit": 1}, headers=auth_headers(superuser)
        ).json()
        assert body["total"] == 3
        assert len(body["items"]) == 1

    def test_toggle_flips_read_both_ways(self, client, auth_headers, superuser, contacts):
        url = f"{BASE}/contacts/{contacts[1].id}/read"

        assert client.put(url, headers=auth_headers(superuser)).json()["is_read"] is True
        assert client.put(url, headers=auth_headers(superuser)).json()["is_read"] is False

    def test_toggle_unknown_contact_is_404(self, client, auth_headers, superuser):
        response = client.put(f"{BASE}/contacts/999999/read", headers=auth_headers(superuser))
        assert response.status_code == 404
