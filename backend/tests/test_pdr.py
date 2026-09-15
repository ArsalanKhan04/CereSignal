"""
Tests for ``external/pdr.py`` — posterior dominant rhythm estimation.

This module had no coverage at all before this file. It is pure numpy/scipy (no
torch), so it runs everywhere the rest of the suite does, and it contains no RNG:
``fit()`` on identical input returns identical output, which is what lets these
tests assert exact frequencies.

TestLowSamplingRates and TestPosteriorAlphaIsNotSelfRejecting cover two defects
these tests found: a crash at common clinical sampling rates, and O1/O2 being
rejected for carrying the very rhythm being measured.
"""

import numpy as np
import pytest

from external.pdr import PDREstimator

# inference/infer.py's _compute_pdr constructs PDREstimator(200, o1, o2): 200 Hz and
# the class-default 5 dB prominence. Mirror that so the tests describe production.
SFREQ = 200
PROMINENCE = 5
N_CHANNELS = 24
O1, O2 = 8, 9


def _recording(seconds=60, sfreq=SFREQ, n_channels=N_CHANNELS, noise=5.0, seed=42):
    """Flat pink-ish noise across every channel, with no posterior rhythm."""
    rng = np.random.default_rng(seed)
    return rng.normal(0, noise, (n_channels, int(seconds * sfreq)))


def _with_alpha(data, freq=10.0, amplitude=40.0, channels=(O1, O2), sfreq=SFREQ):
    """Inject a clean sinusoid into the given channels, in place."""
    t = np.arange(data.shape[1]) / sfreq
    wave = amplitude * np.sin(2 * np.pi * freq * t)
    for ch in channels:
        data[ch] += wave
    return data


class TestFitReturnContract:
    """
    _compute_pdr in inference/infer.py reads ``pdr_res["pdr_o1"]`` unconditionally,
    on both the success and the failure path, so that key must always be present.
    """

    def test_success_carries_usage_and_no_error(self):
        data = _with_alpha(_recording())

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert "error" not in res
        assert "data_usage_percent" in res
        assert set(res) == {"pdr_o1", "pdr_o2", "data_usage_percent"}

    def test_failure_carries_error_and_no_usage(self):
        # Ten channels cannot leave the 15 the estimator requires.
        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(_recording(n_channels=10))

        assert "error" in res
        assert "data_usage_percent" not in res
        assert set(res) == {"pdr_o1", "pdr_o2", "error"}

    @pytest.mark.parametrize("build", [
        pytest.param(lambda: _recording(), id="noise"),
        pytest.param(lambda: _recording(n_channels=10), id="rejected"),
    ])
    def test_both_pdr_keys_always_exist(self, build):
        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(build())

        assert "pdr_o1" in res and "pdr_o2" in res


class TestChannelRejection:
    def test_fewer_than_fifteen_surviving_channels_is_reported(self):
        data = _recording(n_channels=10)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res["error"] == "<15 channels"

    def test_a_flat_recording_rejects_everything(self):
        """
        zscore of a zero-variance array is NaN, so `abs(z) <= 2` is False for every
        channel but the exempt O1/O2, which leaves too few to estimate from.
        """
        data = np.zeros((N_CHANNELS, 60 * SFREQ))

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res == {"pdr_o1": None, "pdr_o2": None, "error": "<15 channels"}

    def test_a_channel_over_the_absolute_rms_ceiling_is_dropped(self):
        data = _recording()
        data[3] *= 500  # RMS well past the hard 1000 cutoff

        valid, _ = PDREstimator(SFREQ, O1, O2, PROMINENCE)._channel_rejection(data)

        assert 3 not in valid


class TestPeakEstimation:
    def test_a_ten_hertz_posterior_rhythm_is_recovered(self):
        data = _with_alpha(_recording(), freq=10.0)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res["pdr_o1"] == pytest.approx(10.0, abs=0.5)
        assert res["pdr_o2"] == pytest.approx(10.0, abs=0.5)

    def test_pure_noise_reports_no_peak(self):
        """
        find_peaks requires a 5 dB prominence, as Zibrandtsen & Kjaer specify. At a
        prominence of 0 any local maximum counted, so a recording with no rhythm in
        it was reported as having a PDR.
        """
        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(_recording(noise=5.0))

        assert res["pdr_o1"] is None and res["pdr_o2"] is None

    def test_an_empty_segment_has_no_peak(self):
        assert PDREstimator(SFREQ, O1, O2, PROMINENCE)._estimate_peak(np.array([])) is None

    def test_fit_is_deterministic(self):
        """No RNG anywhere in pdr.py — identical input must give identical output."""
        data = _with_alpha(_recording())
        est = PDREstimator(SFREQ, O1, O2, PROMINENCE)

        assert est.fit(data.copy()) == est.fit(data.copy())


class TestSegmentationMask:
    def test_a_short_recording_always_falls_back_to_the_whole_file(self):
        """
        _get_segmentation_mask's fallback fires whenever under 2 minutes of clean
        signal is found, and the fallback window is +/-300s around the midpoint —
        so anything shorter than 2 minutes uses 100% of the recording.
        """
        data = _with_alpha(_recording(seconds=30))

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res["data_usage_percent"] == pytest.approx(100.0)


class TestLowSamplingRates:
    """
    fit() band-passes at 0.5-70 Hz, and scipy.signal.butter requires the high cutoff
    below Nyquist, so every rate at or below 140 Hz raised ValueError. 100 Hz and
    128 Hz are ordinary clinical EEG rates; the cutoff is clamped below Nyquist.
    """

    @pytest.mark.parametrize("sfreq", [100, 128, 140])
    def test_a_low_sampling_rate_still_measures_the_rhythm(self, sfreq):
        data = _with_alpha(_recording(seconds=30, sfreq=sfreq), sfreq=sfreq)

        res = PDREstimator(sfreq, O1, O2, PROMINENCE).fit(data)

        assert res["pdr_o1"] == pytest.approx(10.0, abs=0.5)

    @pytest.mark.parametrize("sfreq", [141, 200, 256])
    def test_rates_above_nyquist_for_70hz_are_fine(self, sfreq):
        data = _recording(seconds=30, sfreq=sfreq)

        assert PDREstimator(sfreq, O1, O2, PROMINENCE).fit(data) is not None


class TestPosteriorAlphaIsNotSelfRejecting:
    """
    _channel_rejection drops any channel whose RMS is more than 2 SD from the mean
    across channels. A patient with strong posterior alpha over quiet frontals is
    exactly that distribution, so O1 and O2 were the outliers and the recording came
    back "Not well-formed". O1/O2 are exempt from the relative test; only the
    absolute ceiling still applies to them.
    """

    def test_clean_posterior_alpha_is_measured(self):
        data = _with_alpha(_recording(), freq=10.0, amplitude=40.0)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert "error" not in res
        assert res["pdr_o1"] == pytest.approx(10.0, abs=0.5)
        assert res["pdr_o2"] == pytest.approx(10.0, abs=0.5)

    def test_o1_over_the_absolute_ceiling_is_still_rejected(self):
        data = _recording()
        data[O1] *= 500

        valid, _ = PDREstimator(SFREQ, O1, O2, PROMINENCE)._channel_rejection(data)

        assert O1 not in valid
