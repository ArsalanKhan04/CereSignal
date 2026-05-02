"""
Supabase Storage service for all file I/O.
Replaces local disk writes so the backend stays stateless.
"""

from contextlib import contextmanager
import os
import tempfile
from typing import Generator

from supabase import create_client, Client

SIGNALS_BUCKET = "eeg-signals"
ASSETS_BUCKET = "eeg-assets"


class StorageService:
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


storage_service = StorageService()
