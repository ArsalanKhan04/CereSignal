"""
File processing utilities
"""

import os
import re
import secrets
from pathlib import Path
from urllib.parse import quote

import pandas as pd
from fastapi import UploadFile

from app.core.logging_config import logger
from app.services.storage_service import SIGNALS_BUCKET, storage_service


async def save_uploaded_file(file: UploadFile, filename: str) -> str:
    """Upload file to Supabase Storage. Returns the storage object path."""
    original_path = Path(filename)
    # Capped so stem + suffix + extension stays inside signal_files.filename's 255.
    name_without_ext = original_path.stem[:200]
    extension = original_path.suffix

    # Uploads from every hospital share one namespace and upload() overwrites, so the
    # suffix is all that keeps two same-named files apart. It was 3 hex characters —
    # a 1-in-4096 chance per pair of replacing another tenant's recording.
    unique_suffix = secrets.token_hex(8)
    new_filename = f"{name_without_ext}_{unique_suffix}{extension}"
    object_path = f"signals/{new_filename}"

    data = await file.read()
    storage_service.upload(SIGNALS_BUCKET, object_path, data)
    return object_path


def safe_basename(name: str | None) -> str:
    """
    The last path component of an untrusted filename, with control characters
    removed. original_filename is the raw multipart filename, so "../../x.edf" or a
    Windows path can arrive intact.
    """
    base = os.path.basename((name or "").replace("\\", "/"))
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
    return base if base not in ("", ".", "..") else "download"


def content_disposition(name: str | None) -> str:
    """
    An attachment header that survives any filename. Starlette encodes headers as
    latin-1, so an Urdu or CJK name in a plain filename="..." was a 500, and a quote
    broke the header: send an ASCII fallback plus the RFC 5987 UTF-8 form.
    """
    base = safe_basename(name)
    fallback = base.encode("ascii", "replace").decode("ascii").replace("?", "_")
    fallback = fallback.replace('"', "_").replace("\\", "_")
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(base, safe='')}"


def process_signal_file(storage_path: str) -> dict:
    """Process uploaded signal file (Supabase object path) and extract metadata using MNE."""
    file_extension = Path(storage_path).suffix.lower()

    if file_extension == ".edf":
        return process_eeg_file_with_mne(storage_path)
    else:
        raise ValueError(f"Unsupported file type: {file_extension}")


def process_eeg_file_with_mne(storage_path: str) -> dict:
    """Process EEG file using MNE and return complete signal data."""
    try:
        import mne

        with storage_service.temp_local_file(SIGNALS_BUCKET, storage_path, suffix=".edf") as local_path:
            raw = mne.io.read_raw_edf(local_path, preload=True, verbose=False)
        
        # Get basic info
        info = raw.info
        n_channels = len(raw.ch_names)
        sfreq = info['sfreq']
        duration = raw.times[-1] if len(raw.times) > 0 else 0
        
        # Process each channel - only extract essential fields
        signals = []
        for i, ch_name in enumerate(raw.ch_names):
            # Get channel data
            channel_data = raw.get_data(picks=[i])[0]  # Get first (and only) channel
            
            # Extract only essential metadata for display
            signal_info = {
                "channel_name": ch_name,
                "sampling_rate": float(sfreq),
                "samples": len(channel_data),
                "duration": float(duration)
            }
            
            signals.append(signal_info)
        
        return {
            "file_type": "edf",
            "n_channels": n_channels,
            "sampling_rate": float(sfreq),
            "duration": float(duration),
            "signals": signals
        }
        
    except Exception as e:
        logger.error("Error processing EEG file with MNE", exc_info=True)
        raise ValueError(f"Failed to process EEG file: {str(e)}")


def process_csv_file(file_path: str) -> dict:
    """Process CSV file and extract signal information"""
    
    try:
        # Read CSV file
        df = pd.read_csv(file_path)
        
        # Get basic info
        file_info = {
            "channels": len(df.columns),
            "duration": len(df) / 1000,  # Assume 1kHz sampling rate
            "start_time": None,
            "signals": []
        }
        
        # Process each column as a signal
        for column in df.columns:
            signal_info = {
                "channel_name": column,
                "sampling_rate": 1000,  # Default assumption
                "samples": len(df),
                "physical_max": float(df[column].max()),
                "physical_min": float(df[column].min()),
                "digital_max": None,
                "digital_min": None,
                "prefilter": None,
                "transducer": None,
                "units": None
            }
            file_info["signals"].append(signal_info)
        
        return file_info
        
    except Exception as e:
        raise ValueError(f"Error processing CSV file: {str(e)}")


def get_file_size(file_path: str) -> int:
    """Get file size in bytes"""
    return os.path.getsize(file_path)


def delete_file(file_path: str) -> bool:
    """Delete file from Supabase Storage."""
    try:
        storage_service.delete(SIGNALS_BUCKET, file_path)
        return True
    except Exception:
        return False
