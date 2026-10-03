"""
The per-file read routes the EEG viewer drives: raw download, channel metadata,
events, the plot-data segment endpoint and the topomap — plus bookmark deletion.

Scoping (401/404 for every one of these) is already pinned by
test_tenancy.TestPerFileRoutesAreScoped. This file covers what each route returns
once it lets the caller in.
"""

import base64
import io

import pytest

from app.models.signal import EEGBookmark, Signal
from app.services.eeg_cache_service import eeg_cache
from app.services.storage_service import ASSETS_BUCKET, SIGNALS_BUCKET

BASE = "/api/v1/signals/files"


def _png_base64(size=(4, 4)):
    """A real PNG: bookmark uploads are decoded, so magic bytes alone are refused."""
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(autouse=True)
def _clean_eeg_cache():
    """
    eeg_cache is a process-wide singleton keyed by file id, and every test builds a
    fresh database whose first file is id 1 again. Without this a test would plot
    the previous test's recording.
    """
    eeg_cache._cache.clear()
    yield
    eeg_cache._cache.clear()


@pytest.fixture
def patient(make_patient, hospital_a, doctor_a):
    return make_patient("Viewer Patient", hospital_a, auth_user=doctor_a)


@pytest.fixture
def stored_file(patient, make_signal_file, local_storage, hospital_a, tiny_edf):
    """A file whose object is the raw (non-conforming) tiny EDF."""
    signal_file = make_signal_file(patient, hospital_a, filename="raw.edf")
    with open(tiny_edf["path"], "rb") as fh:
        local_storage.upload(SIGNALS_BUCKET, signal_file.file_path, fh.read())
    return signal_file


@pytest.fixture
def processed_file(patient, make_signal_file, local_storage, hospital_a, tiny_edf, tmp_path):
    """A file whose object has been through process_edf, so the viewer will plot it."""
    from external.edf_preprocess import process_edf

    out = tmp_path / "processed.edf"
    process_edf(tiny_edf["path"], str(out))

    signal_file = make_signal_file(patient, hospital_a, filename="rec_processed.edf")
    local_storage.upload(SIGNALS_BUCKET, signal_file.file_path, out.read_bytes())
    return signal_file


class TestDownload:
    def test_streams_the_stored_bytes(self, client, auth_headers, doctor_a, stored_file, tiny_edf):
        response = client.get(f"{BASE}/{stored_file.id}/download", headers=auth_headers(doctor_a))

        assert response.status_code == 200
        with open(tiny_edf["path"], "rb") as fh:
            assert response.content == fh.read()
        assert 'filename="raw.edf"' in response.headers["content-disposition"]

    def test_missing_object_is_404(
        self, client, auth_headers, doctor_a, patient, make_signal_file, hospital_a, local_storage
    ):
        signal_file = make_signal_file(patient, hospital_a, filename="gone.edf")
        response = client.get(f"{BASE}/{signal_file.id}/download", headers=auth_headers(doctor_a))

        assert response.status_code == 404
        assert response.json()["detail"] == "File not found in storage"


class TestChannelMetadata:
    @pytest.fixture
    def channels(self, db_session, stored_file):
        rows = [
            Signal(file_id=stored_file.id, channel_name="FP1", sampling_rate=256.0,
                   duration=4.0, data_points=1024),
            Signal(file_id=stored_file.id, channel_name="FP2", sampling_rate=256.0,
                   duration=6.0, data_points=1536),
        ]
        db_session.add_all(rows)
        db_session.commit()
        return rows

    def test_signals_lists_each_channel(self, client, auth_headers, doctor_a, stored_file, channels):
        body = client.get(f"{BASE}/{stored_file.id}/signals", headers=auth_headers(doctor_a)).json()
        assert sorted(s["channel_name"] for s in body) == ["FP1", "FP2"]

    def test_signal_data_reports_the_window_and_longest_duration(
        self, client, auth_headers, doctor_a, stored_file, channels
    ):
        body = client.get(
            f"{BASE}/{stored_file.id}/signal-data",
            params={"start_time": 2, "duration": 3},
            headers=auth_headers(doctor_a),
        ).json()

        assert body["file_info"]["total_duration"] == 6.0
        assert body["time_range"] == {"start": 2.0, "end": 5.0, "duration": 3.0}
        fp1 = next(s for s in body["signals"] if s["channel_name"] == "FP1")
        assert fp1["total_samples"] == 1024

    def test_signal_data_with_no_channels(self, client, auth_headers, doctor_a, stored_file):
        body = client.get(f"{BASE}/{stored_file.id}/signal-data", headers=auth_headers(doctor_a)).json()
        assert body["signals"] == []
        assert body["file_info"]["total_duration"] == 0


class TestEvents:
    def test_defaults_to_empty_containers(self, client, auth_headers, doctor_a, stored_file):
        body = client.get(f"{BASE}/{stored_file.id}/events", headers=auth_headers(doctor_a)).json()
        assert body["events"] == {}
        assert body["focus_points"] == []

    def test_returns_stored_events(
        self, client, auth_headers, doctor_a, db_session, stored_file
    ):
        stored_file.events = {"spikes": [1.5]}
        stored_file.focus_points = [{"t": 1.5}]
        db_session.commit()

        body = client.get(f"{BASE}/{stored_file.id}/events", headers=auth_headers(doctor_a)).json()
        assert body["events"] == {"spikes": [1.5]}
        assert body["focus_points"] == [{"t": 1.5}]


class TestPlotData:
    def test_an_unconverted_recording_is_409(self, client, auth_headers, doctor_a, stored_file):
        response = client.get(f"{BASE}/{stored_file.id}/plot-data", headers=auth_headers(doctor_a))

        assert response.status_code == 409
        assert "still being prepared" in response.json()["detail"]

    def test_a_missing_object_is_500(
        self, client, auth_headers, doctor_a, patient, make_signal_file, hospital_a, local_storage
    ):
        signal_file = make_signal_file(patient, hospital_a, filename="gone.edf")
        response = client.get(f"{BASE}/{signal_file.id}/plot-data", headers=auth_headers(doctor_a))
        assert response.status_code == 500

    def test_original_montage_returns_the_window_in_display_order(
        self, client, auth_headers, doctor_a, processed_file
    ):
        response = client.get(
            f"{BASE}/{processed_file.id}/plot-data",
            params={"start_time": 1, "duration": 2},
            headers=auth_headers(doctor_a),
        )

        assert response.status_code == 200
        seg = response.json()["plot_data"]
        names = [ch["channel_name"] for ch in seg["channels"]]
        assert names[:2] == ["FP1", "FP2"]
        assert seg["start_time"] == 1.0
        assert seg["end_time"] == 3.0
        assert len(seg["channels"][0]["data"]) == int(2 * seg["sampling_rate"])

    def test_channel_filter(self, client, auth_headers, doctor_a, processed_file):
        seg = client.get(
            f"{BASE}/{processed_file.id}/plot-data",
            params={"channels": "C3, C4"},
            headers=auth_headers(doctor_a),
        ).json()["plot_data"]

        assert sorted(ch["channel_name"] for ch in seg["channels"]) == ["C3", "C4"]

    def test_bipolar_montage_subtracts_the_pair(self, client, auth_headers, doctor_a, processed_file):
        headers = auth_headers(doctor_a)
        original = client.get(f"{BASE}/{processed_file.id}/plot-data", headers=headers).json()
        bipolar = client.get(
            f"{BASE}/{processed_file.id}/plot-data",
            params={"montage": "bipolar_longitudinal"},
            headers=headers,
        ).json()

        raw = {ch["channel_name"]: ch["data"] for ch in original["plot_data"]["channels"]}
        derived = {ch["channel_name"]: ch["data"] for ch in bipolar["plot_data"]["channels"]}
        assert "FP1-F7" in derived
        expected = [a - b for a, b in zip(raw["FP1"], raw["F7"], strict=True)]
        assert derived["FP1-F7"] == pytest.approx(expected)

    def test_unknown_montage_yields_no_channels(self, client, auth_headers, doctor_a, processed_file):
        seg = client.get(
            f"{BASE}/{processed_file.id}/plot-data",
            params={"montage": "no-such-montage"},
            headers=auth_headers(doctor_a),
        ).json()["plot_data"]
        assert seg["channels"] == []


class TestTopomap:
    def test_keyed_off_file_path_not_filename(
        self, client, auth_headers, doctor_a, processed_file, local_storage
    ):
        # file_path is signals/rec_processed.edf; the topomap is named after that.
        local_storage.upload(ASSETS_BUCKET, "topomaps/rec_processed_topomap.png", b"\x89PNG")

        response = client.get(f"{BASE}/{processed_file.id}/topomap", headers=auth_headers(doctor_a))
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.content == b"\x89PNG"

    def test_missing_topomap_is_404(self, client, auth_headers, doctor_a, stored_file):
        response = client.get(f"{BASE}/{stored_file.id}/topomap", headers=auth_headers(doctor_a))
        assert response.status_code == 404


class TestDeleteBookmark:
    @pytest.fixture
    def bookmark(self, client, auth_headers, doctor_a, stored_file, db_session):
        png = _png_base64()
        response = client.post(
            f"{BASE}/{stored_file.id}/bookmarks",
            json={"comment": "spike here", "image_base64": f"data:image/png;base64,{png}"},
            headers=auth_headers(doctor_a),
        )
        assert response.status_code == 201
        return db_session.get(EEGBookmark, response.json()["id"])

    def test_removes_the_row_and_the_image(
        self, client, auth_headers, doctor_a, stored_file, bookmark, db_session, local_storage
    ):
        image_path = bookmark.image_path
        response = client.delete(
            f"{BASE}/{stored_file.id}/bookmarks/{bookmark.id}", headers=auth_headers(doctor_a)
        )

        assert response.status_code == 200
        db_session.expire_all()
        assert db_session.get(EEGBookmark, bookmark.id) is None
        with pytest.raises(FileNotFoundError):
            local_storage.download(ASSETS_BUCKET, image_path)

    def test_a_patient_cannot_delete_even_on_their_own_file(
        self, client, auth_headers, patient_a, patient, stored_file, bookmark, db_session,
    ):
        # Link the recording's patient record to patient_a's login, so read access is
        # granted and it is forbid_patients that refuses the write.
        patient.patient_auth_user_id = patient_a.id
        db_session.commit()

        response = client.delete(
            f"{BASE}/{stored_file.id}/bookmarks/{bookmark.id}", headers=auth_headers(patient_a)
        )
        assert response.status_code == 403
        assert db_session.get(EEGBookmark, bookmark.id) is not None

    def test_a_bookmark_on_another_file_is_404(
        self, client, auth_headers, doctor_a, patient, make_signal_file, hospital_a, bookmark
    ):
        other = make_signal_file(patient, hospital_a, filename="other.edf")
        response = client.delete(
            f"{BASE}/{other.id}/bookmarks/{bookmark.id}", headers=auth_headers(doctor_a)
        )
        assert response.status_code == 404
