"""
File processing utilities
"""

import os
import shutil
from pathlib import Path
from typing import Optional
import pyedflib
import pandas as pd
import json
from fastapi import UploadFile

from app.core.config import settings


async def save_uploaded_file(file: UploadFile, filename: str) -> str:
    """Save uploaded file to the filesystem"""
    
    # Create uploads directory if it doesn't exist
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    
    # Create file path
    file_path = upload_dir / filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return str(file_path)


def process_signal_file(file_path: str) -> dict:
    """Process uploaded signal file and extract metadata"""
    
    file_extension = Path(file_path).suffix.lower()
    
    if file_extension == ".edf":
        return process_edf_file(file_path)
    elif file_extension == ".csv":
        return process_csv_file(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_extension}")


def process_edf_file(file_path: str) -> dict:
    """Process EDF file and extract signal information"""
    
    try:
        with pyedflib.EdfReader(file_path) as f:
            # Get file info
            file_info = {
                "channels": f.getNSignals(),
                "duration": f.file_duration,
                "start_time": f.getStartdatetime(),
                "signals": []
            }
            
            # Get signal info for each channel
            for i in range(f.getNSignals()):
                signal_info = {
                    "channel_name": f.getLabel(i),
                    "sampling_rate": f.getSampleFrequency(i),
                    "samples": f.getNSamples()[i],
                    "physical_max": f.getPhysicalMaximum(i),
                    "physical_min": f.getPhysicalMinimum(i),
                    "digital_max": f.getDigitalMaximum(i),
                    "digital_min": f.getDigitalMinimum(i),
                    "prefilter": f.getPrefilter(i),
                    "transducer": f.getTransducer(i),
                    "units": f.getPhysicalDimension(i)
                }
                file_info["signals"].append(signal_info)
            
            return file_info
            
    except Exception as e:
        raise ValueError(f"Error processing EDF file: {str(e)}")


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
        for i, column in enumerate(df.columns):
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
    """Delete file from filesystem"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False
    except Exception:
        return False