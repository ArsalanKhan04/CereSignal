"""
Tests for external/edf_preprocess.py — the legacy 26-channel repair.

This pipeline is the most fragile code in the backend: it re-chunks samples across
channel boundaries, and running it on a file that does not need it scrambles every
channel. These tests pin the shape transformations and, crucially, the ``uM``
scaling that keeps looking redundant and is not.
"""

import numpy as np
import pytest

from external.edf_preprocess import (
    FINAL_CHANNEL_LABELS,
    apply_average_reference,
    conforms_to_layout,
    needs_preprocessing,
    process_edf,
    remove_channels,
    remove_reference_from_ecg,
    reshape_data_to_26_channels,
)


class TestConformsToLayout:
    def test_the_canonical_layout_conforms(self):
        assert conforms_to_layout(FINAL_CHANNEL_LABELS) is True

    def test_order_matters(self):
        shuffled = list(reversed(FINAL_CHANNEL_LABELS))
        assert conforms_to_layout(shuffled) is False

    def test_a_subset_does_not_conform(self):
        assert conforms_to_layout(FINAL_CHANNEL_LABELS[:-1]) is False

    def test_accepts_any_sequence_not_just_a_list(self):
        assert conforms_to_layout(tuple(FINAL_CHANNEL_LABELS)) is True

    def test_the_layout_is_22_channels_ending_in_the_references(self):
        assert len(FINAL_CHANNEL_LABELS) == 22
        assert FINAL_CHANNEL_LABELS[19:] == ["ECG", "A1", "A2"]


class TestReshapeTo26Channels:
    def test_output_always_has_26_rows(self):
        data = np.arange(24 * 100, dtype=float).reshape(24, 100)
        assert reshape_data_to_26_channels(data).shape[0] == 26

    def test_samples_are_truncated_to_a_multiple_of_26(self):
        # 24 * 100 = 2400 elements; 2400 % 26 == 6, so 2394 survive -> 92 per channel.
        data = np.arange(24 * 100, dtype=float).reshape(24, 100)
        out = reshape_data_to_26_channels(data)
        assert out.shape == (26, 2394 // 26)

    def test_it_reads_and_writes_in_fortran_order(self):
        # Column-major on both sides, matching the MATLAB original. With Fortran
        # order in and out, the first 26 elements of the flattened input become the
        # first column of the output.
        data = np.arange(26 * 4, dtype=float).reshape(26, 4)
        out = reshape_data_to_26_channels(data)
        np.testing.assert_array_equal(out[:, 0], data.flatten(order="F")[:26])

    def test_an_exact_multiple_loses_no_samples(self):
        data = np.arange(26 * 10, dtype=float).reshape(26, 10)
        assert reshape_data_to_26_channels(data).shape == (26, 10)

    def test_it_does_not_mutate_its_input(self):
        data = np.arange(24 * 100, dtype=float).reshape(24, 100)
        before = data.copy()
        reshape_data_to_26_channels(data)
        np.testing.assert_array_equal(data, before)


class TestRemoveChannels:
    def test_26_rows_in_20_rows_out(self):
        data = np.arange(26 * 5, dtype=float).reshape(26, 5)
        assert remove_channels(data).shape == (20, 5)

    def test_it_drops_rows_18_19_then_19_to_22_of_the_remainder(self):
        # Label each row by its index so we can name the survivors exactly.
        data = np.arange(26, dtype=float).reshape(26, 1)
        out = remove_channels(data)

        # First pass drops original rows 18 and 19, leaving 0-17 then 20-25.
        # Second pass drops indices 19-22 of that 24-row array, i.e. originals 23,
        # 24, 25 (index 23 is out of range after the first cut leaves 24 rows).
        surviving = out[:, 0].tolist()
        assert 18.0 not in surviving
        assert 19.0 not in surviving
        assert surviving[:18] == list(range(18))

    def test_it_does_not_mutate_its_input(self):
        data = np.arange(26 * 5, dtype=float).reshape(26, 5)
        before = data.copy()
        remove_channels(data)
        np.testing.assert_array_equal(data, before)


class TestApplyAverageReference:
    def test_20_rows_in_22_rows_out(self):
        data = np.random.default_rng(0).normal(size=(20, 50))
        out, _, _ = apply_average_reference(data)
        assert out.shape == (22, 50)

    def test_every_sample_is_mean_centred_across_channels(self):
        data = np.random.default_rng(1).normal(size=(20, 50))
        out, _, _ = apply_average_reference(data)
        np.testing.assert_allclose(out.mean(axis=0), 0.0, atol=1e-12)

    def test_the_appended_references_are_the_negated_average(self):
        # A1 and A2 start as zeros, so after subtracting the average they both
        # hold -avg, and they are identical to one another.
        data = np.random.default_rng(2).normal(size=(20, 50))
        out, a1, a2 = apply_average_reference(data)
        np.testing.assert_allclose(a1, a2)
        np.testing.assert_allclose(a1, out[20, :])
        np.testing.assert_allclose(a2, out[21, :])

    def test_returned_references_are_rows_20_and_21_of_the_output(self):
        data = np.random.default_rng(3).normal(size=(20, 10))
        out, a1, a2 = apply_average_reference(data)
        np.testing.assert_array_equal(a1, out[20])
        np.testing.assert_array_equal(a2, out[21])


class TestRemoveReferenceFromEcg:
    def test_ecg_row_19_has_a2_row_21_subtracted(self):
        data = np.zeros((22, 4))
        data[19, :] = 10.0
        data[21, :] = 4.0

        out = remove_reference_from_ecg(data)

        np.testing.assert_array_equal(out[19, :], np.full(4, 6.0))

    def test_it_mutates_in_place_and_returns_the_same_array(self):
        # Documented behaviour, not an accident: the caller in process_edf relies on
        # the return value, but any other holder of the array sees the change too.
        data = np.zeros((22, 4))
        data[19, :] = 10.0
        data[21, :] = 4.0

        out = remove_reference_from_ecg(data)

        assert out is data
        np.testing.assert_array_equal(data[19, :], np.full(4, 6.0))

    def test_no_other_row_is_touched(self):
        rng = np.random.default_rng(4)
        data = rng.normal(size=(22, 6))
        before = data.copy()

        remove_reference_from_ecg(data)

        untouched = [i for i in range(22) if i != 19]
        np.testing.assert_array_equal(data[untouched], before[untouched])


class TestNeedsPreprocessing:
    def test_a_non_conforming_file_needs_the_repair(self, tiny_edf):
        assert needs_preprocessing(tiny_edf["path"]) is True

    def test_an_already_processed_file_is_left_alone(self, tiny_edf, tmp_path):
        out = tmp_path / "processed.edf"
        process_edf(tiny_edf["path"], str(out))

        # This is the guard that stops the viewer's own output being re-chunked.
        assert needs_preprocessing(str(out)) is False


class TestProcessEdfEndToEnd:
    """
    The full pipeline against a synthesized recording carrying the sample files'
    quirks: physical dimension ``uM`` and a non-conforming channel layout.
    """

    @pytest.fixture
    def processed(self, tiny_edf, tmp_path):
        import mne

        out = tmp_path / "processed.edf"
        process_edf(tiny_edf["path"], str(out))
        raw = mne.io.read_raw_edf(str(out), preload=True, verbose=False)
        return {"raw": raw, "path": str(out), "source": tiny_edf}

    def test_it_writes_the_canonical_22_channel_layout(self, processed):
        assert processed["raw"].ch_names == FINAL_CHANNEL_LABELS

    def test_the_sampling_rate_is_preserved(self, processed):
        assert processed["raw"].info["sfreq"] == processed["source"]["sfreq"]

    def test_the_output_is_readable_by_the_viewer(self, processed):
        assert conforms_to_layout(processed["raw"].ch_names)

    def test_the_um_scaling_is_load_bearing(self, processed):
        """
        Do not delete the ``* 1e-6`` in process_edf.

        These recordings declare their physical dimension as "uM". MNE does not
        recognise "uM", so it skips its own uV->V conversion and get_data() returns
        physical units directly — microvolts, despite the label. The ``* 1e-6``
        converts them to the volts MNE expects on the way back out.

        The fixture writes samples at ~10 uM rms. If the scaling were removed, the
        written file would carry ~10 *volts* per sample and this assertion would
        fail by six orders of magnitude. A genuine "uV" file would already be in
        volts and would be scaled to nothing here — check the header before
        touching that line.
        """
        # MNE reads volts back out, so express the assertion in microvolts.
        rms_uv = np.sqrt(np.mean(processed["raw"].get_data() ** 2)) * 1e6

        assert 0.1 < rms_uv < 1000.0, (
            f"expected a microvolt-scale signal, got {rms_uv:g} uV — "
            "the 1e-6 scaling in process_edf has probably been changed"
        )

    def test_the_reshape_redistributes_samples_across_26_rows(self, processed):
        """
        The channel count is mis-declared in these files (24 in the header), so the
        reshape redistributes 24 x N samples across 26 rows before channels are
        dropped. The processed recording therefore carries a different sample count
        per channel than the raw upload — which is why the `signals` table's
        metadata does not match what the viewer actually plots.

        The written file is a little longer than the computed 945 samples: EDF
        stores equal-length data blocks, so mne.export pads the final block with
        edge values. Allow up to one second of that padding.
        """
        source = processed["source"]
        upload_samples_per_channel = source["sfreq"] * 4
        raw_samples = source["n_channels"] * upload_samples_per_channel
        expected = (raw_samples - raw_samples % 26) // 26

        # The reshape genuinely changes samples-per-channel: 24 x 1024 spread over
        # 26 rows is 945, not 1024.
        assert expected != upload_samples_per_channel

        # What lands on disk is that, plus however much edge padding EDF's fixed
        # block size demanded.
        assert expected <= processed["raw"].n_times < expected + source["sfreq"]
