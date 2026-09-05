"""
File storage for all file I/O.

Two interchangeable backends:
  * SupabaseStorageService — the deployed default, keeps the backend stateless.
  * LocalStorageService    — used automatically when SUPABASE_URL is unset, so the
                             app is runnable locally with no cloud account.

Both expose the same five methods; call sites import the module-level
``storage_service`` and never care which one is active.
"""

from contextlib import contextmanager
import os
import shutil
import tempfile
from typing import Generator

from supabase import create_client, Client

SIGNALS_BUCKET = "eeg-signals"
ASSETS_BUCKET = "eeg-assets"

# Where LocalStorageService keeps its files: backend/local_storage/<bucket>/<path>
LOCAL_STORAGE_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "local_storage",
)

# URL prefix that main.py mounts LOCAL_STORAGE_ROOT on, in local mode.
LOCAL_STORAGE_URL_PREFIX = "/static"


class SupabaseStorageService:
    def __init__(self):
        self._client: Client | None = None

    def _get_client(self) -> Client:
        if not self._client:
            from app.core.config import settings
            self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
        return self._client

    def upload(self, bucket: str, object_path: str, data: bytes) -> str:
        """Upload bytes to Supabase Storage, overwriting if exists. Returns object_path."""
        client = self._get_client()
        try:
            client.storage.from_(bucket).remove([object_path])
        except Exception:
            pass
        client.storage.from_(bucket).upload(object_path, data)
        return object_path

    def download(self, bucket: str, object_path: str) -> bytes:
        """Download file bytes from Supabase Storage."""
        return self._get_client().storage.from_(bucket).download(object_path)

    def delete(self, bucket: str, object_path: str) -> None:
        """Delete a file from Supabase Storage. Silent on failure."""
        try:
            self._get_client().storage.from_(bucket).remove([object_path])
        except Exception:
            pass

    def public_url(self, object_path: str) -> str:
        """Return the public CDN URL for an object in eeg-assets (public bucket)."""
        return self._get_client().storage.from_(ASSETS_BUCKET).get_public_url(object_path)

    @contextmanager
    def temp_local_file(
        self, bucket: str, object_path: str, suffix: str = ""
    ) -> Generator[str, None, None]:
        """
        Download a file from Supabase to a local temp file, yield the path,
        then delete the temp file on exit. Use when MNE or reportlab need
        a local file path.
        """
        data = self.download(bucket, object_path)
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            tmp.write(data)
            tmp.flush()
            tmp.close()
            yield tmp.name
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


class LocalStorageService:
    """
    Filesystem-backed storage for local development.

    Mirrors the Supabase bucket layout under LOCAL_STORAGE_ROOT so object paths are
    identical in both modes and nothing else in the app needs to branch.
    """

    def __init__(self, root: str = LOCAL_STORAGE_ROOT):
        self.root = root

    def _path(self, bucket: str, object_path: str) -> str:
        # Guard against object paths escaping the bucket directory.
        full = os.path.normpath(os.path.join(self.root, bucket, object_path))
        bucket_root = os.path.normpath(os.path.join(self.root, bucket))
        if not full.startswith(bucket_root + os.sep) and full != bucket_root:
            raise ValueError(f"Invalid object path: {object_path}")
        return full

    def upload(self, bucket: str, object_path: str, data: bytes) -> str:
        """Write bytes to disk, overwriting if exists. Returns object_path."""
        path = self._path(bucket, object_path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        return object_path

    def download(self, bucket: str, object_path: str) -> bytes:
        """Read file bytes from disk."""
        with open(self._path(bucket, object_path), "rb") as f:
            return f.read()

    def delete(self, bucket: str, object_path: str) -> None:
        """Delete a file from disk. Silent on failure, matching the Supabase backend."""
        try:
            os.unlink(self._path(bucket, object_path))
        except (OSError, ValueError):
            pass

    def public_url(self, object_path: str) -> str:
        """
        Root-relative URL served by the /static mount in main.py.

        Relative on purpose: the frontend prefixes this with the API origin.
        """
        return f"{LOCAL_STORAGE_URL_PREFIX}/{ASSETS_BUCKET}/{object_path}"

    @contextmanager
    def temp_local_file(
        self, bucket: str, object_path: str, suffix: str = ""
    ) -> Generator[str, None, None]:
        """
        Yield a local path for the stored object.

        The file is already on disk, so a copy is only made when the caller needs a
        particular suffix (MNE dispatches on the .edf extension). Unlike the Supabase
        backend this must never delete the stored file — only a temporary copy.
        """
        path = self._path(bucket, object_path)
        if not suffix or path.endswith(suffix):
            yield path
            return

        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.close()
        try:
            shutil.copyfile(path, tmp.name)
            yield tmp.name
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


def _build_storage_service():
    """Pick the backend from config: Supabase when configured, local disk otherwise."""
    from app.core.config import settings

    if settings.SUPABASE_URL:
        return SupabaseStorageService()
    return LocalStorageService()


storage_service = _build_storage_service()

# Backwards-compatible alias — the class was previously named StorageService.
StorageService = SupabaseStorageService
