"""
Signal processing utilities
"""

import numpy as np
import json
from typing import Dict, Any, Optional
from scipy import signal
from scipy.fft import fft, fftfreq
import pandas as pd

from app.core.config import settings


async def process_signal(
    file_id: int,
    signal_id: Optional[int],
    processing_type: str,
    parameters: Dict[str, Any]
) -> Dict[str, Any]:
    """Process signal data based on processing type"""
    
    if processing_type == "fft":
        return await process_fft(signal_id, parameters)
    elif processing_type == "filter":
        return await process_filter(signal_id, parameters)
    elif processing_type == "feature_extraction":
        return await extract_features(signal_id, parameters)
    elif processing_type == "spectral_analysis":
        return await spectral_analysis(signal_id, parameters)
    else:
        raise ValueError(f"Unknown processing type: {processing_type}")


async def process_fft(signal_id: Optional[int], parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Perform FFT analysis on signal data"""
    
    # This is a placeholder - you would load actual signal data from database
    # For now, we'll generate sample data
    sampling_rate = parameters.get("sampling_rate", 1000)
    duration = parameters.get("duration", 10)
    
    # Generate sample signal (replace with actual data loading)
    t = np.linspace(0, duration, int(sampling_rate * duration))
    frequency = parameters.get("frequency", 10)
    signal_data = np.sin(2 * np.pi * frequency * t)
    
    # Perform FFT
    fft_result = fft(signal_data)
    freqs = fftfreq(len(signal_data), 1/sampling_rate)
    
    # Get magnitude spectrum
    magnitude = np.abs(fft_result)
    
    return {
        "frequencies": freqs[:len(freqs)//2].tolist(),
        "magnitude": magnitude[:len(magnitude)//2].tolist(),
        "peak_frequency": freqs[np.argmax(magnitude[:len(magnitude)//2])],
        "processing_type": "fft",
        "parameters": parameters
    }


async def process_filter(signal_id: Optional[int], parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Apply filter to signal data"""
    
    filter_type = parameters.get("filter_type", "lowpass")
    cutoff_freq = parameters.get("cutoff_frequency", 50)
    sampling_rate = parameters.get("sampling_rate", 1000)
    
    # Generate sample signal (replace with actual data loading)
    duration = parameters.get("duration", 10)
    t = np.linspace(0, duration, int(sampling_rate * duration))
    signal_data = np.sin(2 * np.pi * 10 * t) + 0.5 * np.sin(2 * np.pi * 100 * t)
    
    # Design filter
    nyquist = sampling_rate / 2
    normalized_cutoff = cutoff_freq / nyquist
    
    if filter_type == "lowpass":
        b, a = signal.butter(4, normalized_cutoff, btype='low')
    elif filter_type == "highpass":
        b, a = signal.butter(4, normalized_cutoff, btype='high')
    elif filter_type == "bandpass":
        low_cutoff = parameters.get("low_cutoff", 1)
        high_cutoff = parameters.get("high_cutoff", 50)
        b, a = signal.butter(4, [low_cutoff/nyquist, high_cutoff/nyquist], btype='band')
    else:
        raise ValueError(f"Unknown filter type: {filter_type}")
    
    # Apply filter
    filtered_signal = signal.filtfilt(b, a, signal_data)
    
    return {
        "original_signal": signal_data.tolist(),
        "filtered_signal": filtered_signal.tolist(),
        "filter_type": filter_type,
        "cutoff_frequency": cutoff_freq,
        "parameters": parameters
    }


async def extract_features(signal_id: Optional[int], parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Extract features from signal data"""
    
    # Generate sample signal (replace with actual data loading)
    sampling_rate = parameters.get("sampling_rate", 1000)
    duration = parameters.get("duration", 10)
    t = np.linspace(0, duration, int(sampling_rate * duration))
    signal_data = np.sin(2 * np.pi * 10 * t) + 0.1 * np.random.randn(len(t))
    
    # Calculate features
    features = {
        "mean": float(np.mean(signal_data)),
        "std": float(np.std(signal_data)),
        "variance": float(np.var(signal_data)),
        "rms": float(np.sqrt(np.mean(signal_data**2))),
        "peak_to_peak": float(np.ptp(signal_data)),
        "skewness": float(pd.Series(signal_data).skew()),
        "kurtosis": float(pd.Series(signal_data).kurtosis()),
        "zero_crossings": int(np.sum(np.diff(np.sign(signal_data)) != 0)),
        "energy": float(np.sum(signal_data**2)),
        "processing_type": "feature_extraction",
        "parameters": parameters
    }
    
    return features


async def spectral_analysis(signal_id: Optional[int], parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Perform spectral analysis on signal data"""
    
    sampling_rate = parameters.get("sampling_rate", 1000)
    duration = parameters.get("duration", 10)
    
    # Generate sample signal (replace with actual data loading)
    t = np.linspace(0, duration, int(sampling_rate * duration))
    signal_data = np.sin(2 * np.pi * 10 * t) + 0.5 * np.sin(2 * np.pi * 30 * t)
    
    # Calculate power spectral density
    freqs, psd = signal.welch(signal_data, fs=sampling_rate, nperseg=1024)
    
    # Find dominant frequencies
    peak_indices = signal.find_peaks(psd, height=np.max(psd) * 0.1)[0]
    dominant_freqs = freqs[peak_indices]
    dominant_powers = psd[peak_indices]
    
    return {
        "frequencies": freqs.tolist(),
        "power_spectral_density": psd.tolist(),
        "dominant_frequencies": dominant_freqs.tolist(),
        "dominant_powers": dominant_powers.tolist(),
        "total_power": float(np.sum(psd)),
        "processing_type": "spectral_analysis",
        "parameters": parameters
    }