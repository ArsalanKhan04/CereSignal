"""
Report PDF generation (app/services/pdf_service.py).

Two defects, both reachable by any doctor or technician who can edit a report:

* ReportLab's Paragraph parses its text as markup. Report fields went in raw, so
  ``<img src="/any/path.png"/>`` in the indications embedded whatever image the
  server could read — in local mode, another hospital's bookmark screenshots.
* The PDF was stored at ``reports/<upload name>.pdf``. Two hospitals that each
  uploaded "EEG.edf" wrote the same object, and each downloaded whichever report
  had been built last.
"""

import pytest

from app.services.storage_service import SIGNALS_BUCKET

IMAGE_MARKER = b"/Subtype /Image"


@pytest.fixture
def png_on_disk(tmp_path):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    path = tmp_path / "someone_elses_bookmark.png"
    plt.imsave(path, np.zeros((8, 8)))
    return path


@pytest.fixture
def report_for(make_patient, make_signal_file, make_report):
    def _make(hospital, doctor, filename="EEG.edf", **fields):
        patient = make_patient(f"Patient of {doctor.username}", hospital, doctor)
        signal_file = make_signal_file(patient, hospital, filename=filename)
        return make_report(signal_file, hospital, doctor, **fields)

    return _make


def _generate(client, auth_headers, user, report):
    response = client.post(
        f"/api/v1/reports/{report.id}/generate-pdf", headers=auth_headers(user)
    )
    assert response.status_code == 200, response.text
    return response.json()["pdf_path"]


class TestReportTextIsNotMarkup:
    @pytest.mark.parametrize(
        "field", ["indications", "technique", "factual_report", "impression", "doctor_info"]
    )
    def test_an_img_tag_in_a_report_field_embeds_nothing(
        self, client, local_storage, auth_headers, hospital_a, doctor_a, report_for,
        png_on_disk, field,
    ):
        tag = f'<img src="{png_on_disk}" width="100" height="100"/>'
        report = report_for(hospital_a, doctor_a, **{field: tag})

        pdf_path = _generate(client, auth_headers, doctor_a, report)

        assert IMAGE_MARKER not in local_storage.download(SIGNALS_BUCKET, pdf_path)

    def test_text_that_looks_like_markup_still_renders(
        self, client, local_storage, auth_headers, hospital_a, doctor_a, report_for
    ):
        """Escaping must not turn clinical shorthand like "< 50 uV" into a 500."""
        report = report_for(
            hospital_a, doctor_a, factual_report="amplitude < 50 uV & <unclosed"
        )

        pdf_path = _generate(client, auth_headers, doctor_a, report)

        assert local_storage.download(SIGNALS_BUCKET, pdf_path).startswith(b"%PDF")


class TestPdfPathsAreUniquePerReport:
    def test_same_named_uploads_in_two_hospitals_get_separate_pdfs(
        self, client, local_storage, auth_headers, hospital_a, hospital_b,
        doctor_a, doctor_b, report_for,
    ):
        report_a = report_for(hospital_a, doctor_a, filename="EEG.edf")
        report_b = report_for(hospital_b, doctor_b, filename="EEG.edf")

        path_a = _generate(client, auth_headers, doctor_a, report_a)
        path_b = _generate(client, auth_headers, doctor_b, report_b)

        assert path_a != path_b
        assert path_a.startswith(f"reports/{report_a.id}/")
        assert path_b.startswith(f"reports/{report_b.id}/")

    def test_the_download_keeps_the_upload_name(
        self, client, local_storage, auth_headers, hospital_a, doctor_a, report_for
    ):
        report = report_for(hospital_a, doctor_a, filename="EEG.edf")

        response = client.get(
            f"/api/v1/reports/{report.id}/download-pdf", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200
        assert 'filename="EEG.pdf"' in response.headers["content-disposition"]

    def test_a_legacy_shared_path_is_rebuilt_rather_than_served(
        self, client, local_storage, auth_headers, hospital_a, doctor_a, report_for,
        db_session,
    ):
        """
        Rows written before the fix point at reports/<name>.pdf, which another
        hospital may since have overwritten. download-pdf must not serve it.
        """
        report = report_for(hospital_a, doctor_a, filename="EEG.edf")
        local_storage.upload(SIGNALS_BUCKET, "reports/EEG.pdf", b"another hospital's report")
        report.pdf_file_path = "reports/EEG.pdf"
        db_session.commit()

        response = client.get(
            f"/api/v1/reports/{report.id}/download-pdf", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200
        assert response.content != b"another hospital's report"
        assert response.content.startswith(b"%PDF")
        db_session.refresh(report)
        assert report.pdf_file_path.startswith(f"reports/{report.id}/")
