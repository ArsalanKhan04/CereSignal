"""
File storage for all file I/O.

Two interchangeable backends:
  * SupabaseStorageService — the deployed default, keeps the backend stateless.
  * LocalStorageService    — used automatically when SUPABASE_URL is unset, so the
                             app is runnable locally with no cloud account.

Both expose the same five methods; call sites import the module-level
``storage_service`` and never care which one is active.

Nothing is served publicly. The only objects a browser loads directly are assets
(bookmark screenshots), and it gets them through a short-lived signed URL. Both
buckets are private; everything else goes through an authenticated API route.
"""

import hashlib
import hmac
import os
import shutil
import tempfile
import time
from contextlib import contextmanager
from typing import Generator
from urllib.parse import quote

from supabase import Client, create_client

from app.core.logging_config import logger

SIGNALS_BUCKET = "eeg-signals"
ASSETS_BUCKET = "eeg-assets"

# Where LocalStorageService keeps its files: backend/local_storage/<bucket>/<path>
LOCAL_STORAGE_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "local_storage",
)

# URL prefix main.py serves signed asset URLs under, in local mode.
LOCAL_STORAGE_URL_PREFIX = "/static"

# How long a signed asset URL stays valid. Long enough for a viewing session; the
# bookmark list is re-fetched (and re-signed) whenever the viewer reopens a study.
SIGNED_URL_TTL_SECONDS = 3600


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
        except Exception as exc:
            # Overwrite semantics: the object usually does not exist yet, so this
            # is expected noise rather than a failure. The upload below is what
            # actually has to succeed.
            logger.debug("storage: pre-upload remove of %s failed: %s", object_path, exc)
        client.storage.from_(bucket).upload(object_path, data)
        return object_path

    def download(self, bucket: str, object_path: str) -> bytes:
        """Download file bytes from Supabase Storage."""
        return self._get_client().storage.from_(bucket).download(object_path)

    def delete(self, bucket: str, object_path: str) -> None:
        """Delete a file from Supabase Storage. Silent on failure."""
        try:
            self._get_client().storage.from_(bucket).remove([object_path])
        except Exception as exc:
            # Documented as silent on failure — deleting an object that is already
            # gone is not an error worth propagating to the caller.
            logger.warning("storage: delete of %s failed: %s", object_path, exc)

    def signed_url(
        self, object_path: str, expires_in: int = SIGNED_URL_TTL_SECONDS
    ) -> str:
        """Return a short-lived signed URL for an object in eeg-assets (private bucket)."""
        signed = self._get_client().storage.from_(ASSETS_BUCKET).create_signed_url(
            object_path, expires_in
        )
        return signed["signedURL"]

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

    def signed_url(
        self, object_path: str, expires_in: int = SIGNED_URL_TTL_SECONDS
    ) -> str:
        """
        Root-relative signed URL for an object in eeg-assets, served by main.py.

        Relative on purpose: the frontend prefixes this with the API origin. The
        signature is what authorises the request — an <img src> cannot carry the
        bearer token — so the path alone, however guessable, reads nothing.
        """
        expires = int(time.time()) + expires_in
        signature = _local_signature(ASSETS_BUCKET, object_path, expires)
        return (
            f"{LOCAL_STORAGE_URL_PREFIX}/{ASSETS_BUCKET}/{quote(object_path)}"
            f"?expires={expires}&signature={signature}"
        )

    @staticmethod
    def verify_signature(
        bucket: str, object_path: str, expires: int, signature: str
    ) -> bool:
        """True when signature was issued by signed_url() for this object and has not expired."""
        if expires < time.time():
            return False
        expected = _local_signature(bucket, object_path, expires)
        return hmac.compare_digest(expected, signature)

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


def _local_signature(bucket: str, object_path: str, expires: int) -> str:
    """HMAC over the object and its expiry, keyed with the JWT signing secret."""
    from app.core.config import settings

    message = f"{bucket}/{object_path}:{expires}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _build_storage_service():
    """Pick the backend from config: Supabase when configured, local disk otherwise."""
    from app.core.config import settings

    if settings.SUPABASE_URL:
        return SupabaseStorageService()
    return LocalStorageService()


storage_service = _build_storage_service()

# Backwards-compatible alias — the class was previously named StorageService.
StorageService = SupabaseStorageService
