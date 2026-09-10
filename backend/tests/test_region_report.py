"""
Tests for _get_region_report, which turns per-channel event sequences into the
regional prose that goes into the clinical report.

This file pins a live bug. See TestSpikeCountIsAlwaysZero.
"""

import pytest

from inference.infer import _CHANNEL_REGIONS, _get_region_report

ALL_CHANNELS = [ch for channels in _CHANNEL_REGIONS.values() for ch in channels]


def events_for(*, default="normal wave", n_windows=10, **overrides):
    """Build a result_events dict covering every channel _CHANNEL_REGIONS names."""
    result = {ch: [default] * n_windows for ch in ALL_CHANNELS}
    for channel, sequence in overrides.items():
        result[channel] = sequence
    return result


class TestRegionCoverage:
    def test_every_region_is_reported(self):
        report = _get_region_report(events_for(), threshold=5.0)
        assert set(report) == set(_CHANNEL_REGIONS)

    def test_each_region_carries_a_description_and_stats(self):
        report = _get_region_report(events_for(), threshold=5.0)
        for region in report.values():
            assert "description" in region
            assert set(region["stats"]) == {"spike_pct", "slow_pct"}

    def test_the_regions_cover_the_10_20_layout_without_overlap(self):
        assert len(ALL_CHANNELS) == len(set(ALL_CHANNELS))


class TestNormalActivity:
    def test_an_all_normal_recording_reports_normal_activity(self):
        report = _get_region_report(events_for(), threshold=5.0)

        for region in report.values():
            assert region["description"] == "Normal activity."
            assert region["stats"] == {"spike_pct": 0.0, "slow_pct": 0.0}


class TestSlowWaveReporting:
    def test_slowing_is_reported_for_the_affected_region_only(self):
        # O1 and O2 are the whole Occipital region.
        report = _get_region_report(
            events_for(O1=["slow wave"] * 10, O2=["slow wave"] * 10),
            threshold=5.0,
        )

        assert report["Occipital"]["stats"]["slow_pct"] == 100.0
        assert "slowing" in report["Occipital"]["description"]
        assert report["Frontal"]["description"] == "Normal activity."

    def test_slowing_below_the_threshold_is_not_reported(self):
        # One slow window out of 20 across O1+O2 is 5%, just at the threshold; drop
        # it below by raising the threshold instead.
        report = _get_region_report(
            events_for(O1=["slow wave"] + ["normal wave"] * 9),
            threshold=50.0,
        )

        assert report["Occipital"]["stats"]["slow_pct"] == 5.0
        assert report["Occipital"]["description"] == "Normal activity."

    def test_the_clinical_adjective_scales_with_the_percentage(self):
        rare = _get_region_report(
            events_for(O1=["slow wave"] + ["normal wave"] * 199, O2=["normal wave"] * 200),
            threshold=0.1,
        )
        continuous = _get_region_report(
            events_for(O1=["slow wave"] * 10, O2=["slow wave"] * 10),
            threshold=0.1,
        )

        assert "Rare" in rare["Occipital"]["description"]
        assert "Continuous" in continuous["Occipital"]["description"]

    def test_percentages_are_pooled_across_a_regions_channels(self):
        # Half of the Occipital region's windows are slow.
        report = _get_region_report(
            events_for(O1=["slow wave"] * 10, O2=["normal wave"] * 10),
            threshold=5.0,
        )
        assert report["Occipital"]["stats"]["slow_pct"] == 50.0


class TestDegenerateInput:
    def test_a_region_with_no_windows_raises(self):
        """
        total_windows is used as a divisor with no guard. Documented rather than
        fixed: callers always pass full recordings, but a zero-length channel list
        would take down the whole report task.
        """
        empty = {ch: [] for ch in ALL_CHANNELS}

        with pytest.raises(ZeroDivisionError):
            _get_region_report(empty, threshold=5.0)

    def test_a_missing_channel_raises_keyerror(self):
        incomplete = events_for()
        del incomplete["FP1"]

        with pytest.raises(KeyError):
            _get_region_report(incomplete, threshold=5.0)


class TestSpikeCountIsAlwaysZero:
    """
    A live bug, pinned rather than fixed (see the plan's Follow-ups).

    _get_region_report counts ``events.count("spike and sharp wave")``
    (infer.py:346), but _process_neurotransformer only ever emits one of
    ``"normal wave"``, ``"spike wave"`` or ``"slow wave"`` (infer.py:260). The
    string never matches, so spike_pct is 0.0 for every region regardless of what
    the model found, and no epileptiform discharge is ever reported.

    This is masked by a separate calibration problem — the recordings sit ~100x
    below real EEG, so the confidence gate discards every spike prediction anyway
    (see the note at infer.py:242-251). Fixing the calibration alone would not make
    spikes appear; this string has to be fixed too.
    """

    @pytest.mark.xfail(
        strict=True,
        reason='counts "spike and sharp wave", which the model never emits (infer.py:346)',
    )
    def test_a_spike_wave_should_register_in_the_region_report(self):
        report = _get_region_report(
            events_for(O1=["spike wave"] * 10, O2=["spike wave"] * 10),
            threshold=5.0,
        )

        assert report["Occipital"]["stats"]["spike_pct"] == 100.0

    @pytest.mark.xfail(
        strict=True,
        reason='counts "spike and sharp wave", which the model never emits (infer.py:346)',
    )
    def test_epileptiform_discharges_should_be_described(self):
        report = _get_region_report(
            events_for(O1=["spike wave"] * 10, O2=["spike wave"] * 10),
            threshold=5.0,
        )

        assert "epileptiform discharges" in report["Occipital"]["description"]

    def test_spike_pct_is_currently_zero_even_for_an_all_spike_region(self):
        """The mirror image: delete this when the string above is fixed."""
        report = _get_region_report(
            events_for(O1=["spike wave"] * 10, O2=["spike wave"] * 10),
            threshold=5.0,
        )

        assert report["Occipital"]["stats"]["spike_pct"] == 0.0
        assert report["Occipital"]["description"] == "Normal activity."

    def test_the_literal_the_code_looks_for_does_register(self):
        """
        Proof the mismatch is the whole problem: feed it the string it actually
        counts and the report works as intended.
        """
        report = _get_region_report(
            events_for(
                O1=["spike and sharp wave"] * 10,
                O2=["spike and sharp wave"] * 10,
            ),
            threshold=5.0,
        )

        assert report["Occipital"]["stats"]["spike_pct"] == 100.0
        assert "epileptiform discharges" in report["Occipital"]["description"]
