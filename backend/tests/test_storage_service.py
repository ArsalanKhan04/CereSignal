"""
Tests for the local-disk storage backend.

LocalStorageService is what runs whenever SUPABASE_URL is unset — i.e. all local
development and the whole test suite. Object paths reaching it come from upload
filenames and from Celery messages, so the traversal guard is a real boundary.
"""

import os

import pytest

from app.services.storage_service import (
    ASSETS_BUCKET,
    SIGNALS_BUCKET,
    LocalStorageService,
)


@pytest.fixture
def service(tmp_path):
    return LocalStorageService(str(tmp_path))


class TestPathTraversalGuard:
    """
    _path must keep every resolved path inside its bucket directory. A caller that
    escapes it could read or overwrite another hospital's recordings, or anything
    else the worker process can reach.
    """

    @pytest.mark.parametrize(
        "object_path",
        [
            "../escaped.edf",
            "../../etc/passwd",
            "signals/../../escaped.edf",
            "a/b/../../../escaped.edf",
            "..",
        ],
    )
    def test_escaping_paths_are_rejected(self, service, object_path):
        with pytest.raises(ValueError, match="Invalid object path"):
            service._path(SIGNALS_BUCKET, object_path)

    def test_an_absolute_path_cannot_redirect_the_write(self, service, tmp_path):
        # os.path.join discards the root when the second argument is absolute, so
        # without the guard this would resolve to /etc/passwd itself.
        with pytest.raises(ValueError, match="Invalid object path"):
            service._path(SIGNALS_BUCKET, "/etc/passwd")

    @pytest.mark.parametrize(
        "object_path",
        [
            "recording.edf",
            "signals/recording.edf",
            "signals/nested/deeper/recording.edf",
            "signals/./recording.edf",
            "signals/sub/../recording.edf",
        ],
    )
    def test_legitimate_paths_resolve_inside_the_bucket(self, service, object_path):
        resolved = service._path(SIGNALS_BUCKET, object_path)
        bucket_root = os.path.join(service.root, SIGNALS_BUCKET)
        assert resolved.startswith(bucket_root + os.sep)

    def test_the_bucket_root_itself_is_allowed(self, service):
        resolved = service._path(SIGNALS_BUCKET, "")
        assert resolved == os.path.join(service.root, SIGNALS_BUCKET)

    def test_delete_swallows_a_rejected_path_rather_than_raising(self, service):
        # Matches the Supabase backend, which is silent on failure.
        service.delete(SIGNALS_BUCKET, "../../etc/passwd")


class TestRoundTrip:
    def test_upload_then_download(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.edf", b"payload")
        assert service.download(SIGNALS_BUCKET, "signals/a.edf") == b"payload"

    def test_upload_returns_the_object_path(self, service):
        assert service.upload(SIGNALS_BUCKET, "signals/a.edf", b"x") == "signals/a.edf"

    def test_upload_creates_intermediate_directories(self, service):
        service.upload(SIGNALS_BUCKET, "deep/nested/path/a.edf", b"x")
        assert service.download(SIGNALS_BUCKET, "deep/nested/path/a.edf") == b"x"

    def test_upload_overwrites(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.edf", b"first")
        service.upload(SIGNALS_BUCKET, "signals/a.edf", b"second")
        assert service.download(SIGNALS_BUCKET, "signals/a.edf") == b"second"

    def test_delete_removes_the_object(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.edf", b"x")
        service.delete(SIGNALS_BUCKET, "signals/a.edf")
        with pytest.raises(FileNotFoundError):
            service.download(SIGNALS_BUCKET, "signals/a.edf")

    def test_deleting_a_missing_object_is_silent(self, service):
        service.delete(SIGNALS_BUCKET, "signals/never-existed.edf")

    def test_buckets_are_separate_namespaces(self, service):
        service.upload(SIGNALS_BUCKET, "same-name", b"signals")
        service.upload(ASSETS_BUCKET, "same-name", b"assets")
        assert service.download(SIGNALS_BUCKET, "same-name") == b"signals"
        assert service.download(ASSETS_BUCKET, "same-name") == b"assets"


class TestPublicUrl:
    def test_it_is_root_relative_so_the_frontend_can_prefix_the_api_origin(self, service):
        assert service.public_url("plots/topomap.png") == "/static/eeg-assets/plots/topomap.png"


class TestTempLocalFile:
    """
    The stored file is already on disk, so a copy is only made when the caller needs
    a particular suffix (MNE dispatches on the .edf extension). The stored original
    must never be deleted — only a temporary copy.
    """

    def test_no_suffix_yields_the_stored_path_directly(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.edf", b"payload")
        expected = service._path(SIGNALS_BUCKET, "signals/a.edf")

        with service.temp_local_file(SIGNALS_BUCKET, "signals/a.edf") as path:
            assert path == expected

    def test_a_matching_suffix_yields_the_stored_path_directly(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.edf", b"payload")
        expected = service._path(SIGNALS_BUCKET, "signals/a.edf")

        with service.temp_local_file(SIGNALS_BUCKET, "signals/a.edf", suffix=".edf") as path:
            assert path == expected

    def test_the_stored_file_survives_the_pass_through_branch(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.edf", b"payload")

        with service.temp_local_file(SIGNALS_BUCKET, "signals/a.edf", suffix=".edf"):
            pass

        assert service.download(SIGNALS_BUCKET, "signals/a.edf") == b"payload"

    def test_a_mismatched_suffix_yields_a_copy(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.dat", b"payload")
        stored = service._path(SIGNALS_BUCKET, "signals/a.dat")

        with service.temp_local_file(SIGNALS_BUCKET, "signals/a.dat", suffix=".edf") as path:
            assert path != stored
            assert path.endswith(".edf")
            with open(path, "rb") as handle:
                assert handle.read() == b"payload"

    def test_only_the_copy_is_cleaned_up(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.dat", b"payload")

        with service.temp_local_file(SIGNALS_BUCKET, "signals/a.dat", suffix=".edf") as path:
            copy_path = path

        assert not os.path.exists(copy_path), "the temporary copy should be removed"
        assert service.download(SIGNALS_BUCKET, "signals/a.dat") == b"payload"

    def test_the_copy_is_cleaned_up_even_when_the_body_raises(self, service):
        service.upload(SIGNALS_BUCKET, "signals/a.dat", b"payload")
        copy_path = None

        with pytest.raises(RuntimeError):
            with service.temp_local_file(SIGNALS_BUCKET, "signals/a.dat", suffix=".edf") as path:
                copy_path = path
                raise RuntimeError("boom")

        assert copy_path is not None
        assert not os.path.exists(copy_path)
        assert service.download(SIGNALS_BUCKET, "signals/a.dat") == b"payload"


class TestBackendSelection:
    def test_local_disk_is_chosen_when_supabase_is_unconfigured(self, monkeypatch):
        from app.core.config import settings
        from app.services import storage_service as storage_module

        monkeypatch.setattr(settings, "SUPABASE_URL", "")
        assert isinstance(storage_module._build_storage_service(), LocalStorageService)

    def test_supabase_is_chosen_when_configured(self, monkeypatch):
        from app.core.config import settings
        from app.services import storage_service as storage_module

        monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
        service = storage_module._build_storage_service()
        assert isinstance(service, storage_module.SupabaseStorageService)
