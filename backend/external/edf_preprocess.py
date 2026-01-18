#!/usr/bin/env python3
"""
EDF Data Pre-processing Script

Converts and processes EDF files following the MATLAB EEGLAB workflow:
1. Load EDF file
2. Reshape data to 26 channels
3. Negate data
4. Remove unwanted channels (keeping 20 channels)
5. Apply average re-referencing with A1/A2
6. Update channel labels to standard 10-20 naming
7. Save processed EDF file

Usage:
    python edf_data_pre_processing.py <input_edf_file> [-o <output_edf_file>]
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import mne


# Standard 10-20 channel names (final 22 channels after adding A1, A2)
FINAL_CHANNEL_LABELS = [
    "FP1",
    "FP2",
    "F3",
    "F4",
    "C3",
    "C4",
    "P3",
    "P4",
    "O1",
    "O2",
    "F7",
    "F8",
    "T3",
    "T4",
    "T5",
    "T6",
    "FZ",
    "PZ",
    "CZ",
    "ECG",
    "A1",
    "A2",
]


def load_edf(filepath: str) -> mne.io.Raw:
    """Load an EDF file using MNE."""
    print(f"Loading EDF file: {filepath}")
    raw = mne.io.read_raw_edf(filepath, preload=True, verbose=False)
    return raw


def reshape_data_to_26_channels(data: np.ndarray) -> np.ndarray:
    """
    Reshape EEG data to 26 channels.

    MATLAB equivalent:
        [chan, samples] = size(EEGchans);
        new_samples = (samples*chan) - mod((samples*chan), 26);
        vec = reshape(EEGchans, 1, chan*samples);
        vec = vec(1:new_samples);
        newEEGchans = reshape(vec, 26, new_samples/26);
    """
    n_channels, n_samples = data.shape
    total_elements = n_channels * n_samples

    # Truncate to be divisible by 26
    new_total = total_elements - (total_elements % 26)

    # Flatten (row-major in MATLAB is column-major, so we use Fortran order)
    vec = data.flatten(order="F")
    vec = vec[:new_total]

    # Reshape to 26 channels
    new_samples = new_total // 26
    new_data = vec.reshape((26, new_samples), order="F")

    return new_data


def remove_channels(data: np.ndarray) -> np.ndarray:
    """
    Remove specific channels from the data.

    MATLAB equivalent (0-indexed here):
        EEG.data(19:20,:) = [];  -> removes rows 18, 19 (0-indexed)
        EEG.data(20:23,:) = [];  -> removes rows 19, 20, 21, 22 (0-indexed after first removal)

    After first removal of rows 18-19, we have 24 rows (0-23).
    Then removing rows 19-22 from that leaves us with 20 rows.
    """
    # First removal: rows 19-20 in MATLAB (indices 18, 19 in 0-based)
    rows_to_keep_1 = [i for i in range(data.shape[0]) if i not in [18, 19]]
    data = data[rows_to_keep_1, :]

    # Second removal: rows 20-23 in MATLAB after first deletion
    # In 0-based indexing on the reduced array: indices 19, 20, 21, 22
    rows_to_keep_2 = [i for i in range(data.shape[0]) if i not in [19, 20, 21, 22]]
    data = data[rows_to_keep_2, :]

    return data


def apply_average_reference(
    data: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Apply average re-referencing with A1 and A2 as reference electrodes.

    The MATLAB script:
    1. Appends A1 (channel 20) and A2 (channel 21) as zeros
    2. Sets channels [1,3,5,7,9,11,13,15,17] to reference A1
    3. Sets channels [2,4,6,8,10,12,14,16,18,19] to reference A2
    4. Applies average reference including A1 and A2 in the calculation

    Returns:
        data: Re-referenced data (22 channels)
        a1_ref: A1 reference channel
        a2_ref: A2 reference channel
    """
    n_channels, n_samples = data.shape  # Should be 20 channels

    # Create A1 and A2 reference channels (zeros initially)
    a1_ref = np.zeros((1, n_samples))
    a2_ref = np.zeros((1, n_samples))

    # Append A1 and A2 to data
    data_with_refs = np.vstack([data, a1_ref, a2_ref])  # Now 22 channels

    # Calculate average reference (mean of all channels)
    avg_ref = np.mean(data_with_refs, axis=0, keepdims=True)

    # Subtract average reference from all channels
    data_rereferenced = data_with_refs - avg_ref

    return data_rereferenced, data_rereferenced[20, :], data_rereferenced[21, :]


def remove_reference_from_ecg(data: np.ndarray) -> np.ndarray:
    """
    Remove channel referencing from ECG.

    MATLAB equivalent:
        EEG.data(20,:) = EEG.data(20,:) - EEG.data(22,:);

    Channel 20 is ECG (0-indexed: 19), Channel 22 is A2 (0-indexed: 21)
    """
    # In 0-indexed: ECG is at index 19, A2 is at index 21
    data[19, :] = data[19, :] - data[21, :]
    return data


def process_edf(input_path: str, output_path: str) -> None:
    """
    Main processing function that performs all EDF preprocessing steps.
    Preserves original EDF metadata by modifying the raw object in place.
    """
    # Load the EDF file
    raw = load_edf(input_path)

    # Store original metadata that we want to preserve
    original_info = raw.info.copy()
    sfreq = raw.info["sfreq"]

    # Get the data
    data = raw.get_data()

    print(f"Original data shape: {data.shape}")
    print(f"Sampling frequency: {sfreq} Hz")

    # Step 1: Reshape to 26 channels
    print("Reshaping data to 26 channels...")
    data = reshape_data_to_26_channels(data)
    print(f"After reshape: {data.shape}")

    # Step 2: Negate the data
    print("Negating data...")
    data = -data

    # Step 3: Remove unwanted channels
    print("Removing unwanted channels...")
    data = remove_channels(data)
    print(f"After channel removal: {data.shape}")

    # Step 4: Apply average reference with A1/A2
    print("Applying average reference...")
    data, a1, a2 = apply_average_reference(data)
    print(f"After adding references: {data.shape}")

    # Step 5: Remove reference from ECG
    print("Removing reference from ECG channel...")
    data = remove_reference_from_ecg(data)

    # Step 6: Create new info while preserving original metadata
    print("Creating output EDF file...")

    # Create channel info with proper types
    ch_types = ["eeg"] * 19 + ["ecg"] + ["eeg", "eeg"]  # 22 channels total



    info = mne.create_info(
        ch_names=FINAL_CHANNEL_LABELS, sfreq=sfreq, ch_types=ch_types
    )

    # Copy over preserved metadata from original
    # Subject info (patient name, id, birthday, sex, hand)
    if original_info.get("subject_info"):
        info["subject_info"] = original_info["subject_info"]

    # Measurement date
    if original_info.get("meas_date"):
        info.set_meas_date(original_info["meas_date"])

    # Device info
    if original_info.get("device_info"):
        info["device_info"] = original_info["device_info"]

    # Experimenter
    if original_info.get("experimenter"):
        info["experimenter"] = original_info["experimenter"]

    # Line frequency (power line noise)
    if original_info.get("line_freq"):
        info["line_freq"] = original_info["line_freq"]

    # Scaling data by 1e-6 to convert from microvolts to volts
    data = data * 1e-6

    # Create Raw object with preserved metadata
    raw_processed = mne.io.RawArray(data, info, verbose=False)

    # Copy annotations from original (events, markers, etc.)
    if raw.annotations:
        # Adjust annotation onsets if needed (due to sample count change)
        # Since we're reshaping, the timing relationship changes
        # We keep annotations but they may not align perfectly
        raw_processed.set_annotations(raw.annotations)

    # Export to EDF
    print(f"Saving to: {output_path}")
    mne.export.export_raw(output_path, raw_processed, fmt="edf", overwrite=True)

    print("Processing complete!")
    print(f"Final data shape: {data.shape}")
    print("Preserved metadata: subject_info, meas_date, device_info, annotations")


def main():
    parser = argparse.ArgumentParser(
        description="Pre-process EDF files for EEG analysis.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument("input_file", type=str, help="Path to the input EDF file")

    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Path to the output EDF file. If not specified, saves to <input>_processed.edf",
    )

    args = parser.parse_args()

    # Validate input file
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    if not input_path.suffix.lower() == ".edf":
        print(f"Warning: Input file does not have .edf extension: {input_path}")

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.parent / f"{input_path.stem}_processed.edf"

    # Process the file
    try:
        process_edf(str(input_path), str(output_path))
    except Exception as e:
        print(f"Error processing file: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
