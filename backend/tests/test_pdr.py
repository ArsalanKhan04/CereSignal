"""
Tests for ``external/pdr.py`` — posterior dominant rhythm estimation.

This module had no coverage at all before this file. It is pure numpy/scipy (no
torch), so it runs everywhere the rest of the suite does, and it contains no RNG:
``fit()`` on identical input returns identical output, which is what lets these
tests assert exact frequencies.

Two genuine defects are pinned here with ``xfail(strict=True)``, the house
convention. Both were found by writing these tests, and both are reachable from
real recordings — see the class docstrings.
"""

import numpy as np
import pytest

from external.pdr import PDREstimator

# inference/infer.py:301 constructs PDREstimator(200, o1, o2, 0) — 200 Hz and a
# prominence of 0. Mirror that here so the tests describe production behaviour.
SFREQ = 200
PROMINENCE = 0
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
        data[5] += 300 * np.sin(2 * np.pi * 3 * np.arange(data.shape[1]) / SFREQ)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert "error" not in res
        assert "data_usage_percent" in res
        assert set(res) == {"pdr_o1", "pdr_o2", "data_usage_percent"}

    def test_failure_carries_error_and_no_usage(self):
        # Alpha on O1/O2 only is what trips the rejection path — see
        # TestPosteriorAlphaIsNotSelfRejecting.
        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(_with_alpha(_recording()))

        assert "error" in res
        assert "data_usage_percent" not in res
        assert set(res) == {"pdr_o1", "pdr_o2", "error"}

    @pytest.mark.parametrize("build", [
        pytest.param(lambda: _recording(), id="noise"),
        pytest.param(lambda: _with_alpha(_recording()), id="rejected"),
    ])
    def test_both_pdr_keys_always_exist(self, build):
        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(build())

        assert "pdr_o1" in res and "pdr_o2" in res


class TestChannelRejection:
    def test_fewer_than_fifteen_surviving_channels_is_reported(self):
        data = _recording(n_channels=10)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res["error"] in {"<15 channels", "O1/O2 rejected"}

    def test_a_flat_recording_rejects_everything(self):
        """
        zscore of a zero-variance array is NaN, so `abs(z) <= 2` is False for every
        channel. Pinning the current behaviour rather than leaving it undefined.
        """
        data = np.zeros((N_CHANNELS, 60 * SFREQ))

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res == {"pdr_o1": None, "pdr_o2": None, "error": "O1/O2 rejected"}

    def test_a_channel_over_the_absolute_rms_ceiling_is_dropped(self):
        data = _recording()
        data[3] *= 500  # RMS well past the hard 1000 cutoff

        valid, _ = PDREstimator(SFREQ, O1, O2, PROMINENCE)._channel_rejection(data)

        assert 3 not in valid


class TestPeakEstimation:
    def test_a_ten_hertz_posterior_rhythm_is_recovered(self):
        """
        The decoy artifact on channel 5 is load-bearing: without it O1/O2 are
        themselves rejected. See TestPosteriorAlphaIsNotSelfRejecting below.
        """
        data = _with_alpha(_recording(), freq=10.0)
        t = np.arange(data.shape[1]) / SFREQ
        data[5] += 300 * np.sin(2 * np.pi * 3 * t)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res["pdr_o1"] == pytest.approx(10.0, abs=0.5)
        assert res["pdr_o2"] == pytest.approx(10.0, abs=0.5)

    def test_pure_noise_still_produces_a_peak_at_production_settings(self):
        """
        Worth knowing about. inference/infer.py:301 passes prominence=0, so
        find_peaks accepts any local maximum and _estimate_peak essentially always
        returns a frequency — including on a recording that is pure noise, where
        these become a reported PDR rather than "Not well-formed".

        Pinning current behaviour, not endorsing it. With the class default
        (prominence=5) the same input yields nothing, which is the honest answer.
        """
        noise = _recording(noise=5.0)

        at_production = PDREstimator(SFREQ, O1, O2, 0).fit(noise)
        at_default = PDREstimator(SFREQ, O1, O2, 5).fit(noise)

        assert at_production["pdr_o1"] is not None
        assert at_default["pdr_o1"] is None and at_default["pdr_o2"] is None

    def test_an_empty_segment_has_no_peak(self):
        assert PDREstimator(SFREQ, O1, O2, PROMINENCE)._estimate_peak(np.array([])) is None

    def test_fit_is_deterministic(self):
        """No RNG anywhere in pdr.py — identical input must give identical output."""
        data = _with_alpha(_recording())
        data[5] += 300 * np.sin(2 * np.pi * 3 * np.arange(data.shape[1]) / SFREQ)
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
        t = np.arange(data.shape[1]) / SFREQ
        data[5] += 300 * np.sin(2 * np.pi * 3 * t)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res["data_usage_percent"] == pytest.approx(100.0)


class TestLowSamplingRatesCrash:
    """
    DEFECT. fit() calls _bandpass_filter(clean_data, 0.5, 70), and
    scipy.signal.butter requires the high cutoff below Nyquist. Every sampling
    rate at or below 140 Hz therefore raises ValueError out of fit().

    100 Hz and 128 Hz are ordinary clinical EEG rates. Production has not hit this
    only because inference/infer.py:301 hardcodes PDREstimator(200, ...) — any
    caller that passes the recording's real rate crashes.

    The fix is to clamp the high cutoff below Nyquist (e.g. min(70, sfreq/2 - 1))
    rather than to forbid the rate.
    """

    @pytest.mark.parametrize("sfreq", [100, 128, 140])
    @pytest.mark.xfail(strict=True, reason="butter() high cutoff of 70Hz exceeds Nyquist at <=140Hz")
    def test_a_low_sampling_rate_does_not_crash(self, sfreq):
        # Flat noise, deliberately: the crash sits past the channel-rejection gate,
        # so O1/O2 have to survive for fit() to reach _bandpass_filter at all.
        data = _recording(seconds=30, sfreq=sfreq)

        PDREstimator(sfreq, O1, O2, PROMINENCE).fit(data)

    @pytest.mark.parametrize("sfreq", [141, 200, 256])
    def test_rates_above_nyquist_for_70hz_are_fine(self, sfreq):
        data = _recording(seconds=30, sfreq=sfreq)

        assert PDREstimator(sfreq, O1, O2, PROMINENCE).fit(data) is not None


class TestPosteriorAlphaIsNotSelfRejecting:
    """
    DEFECT, and the clinically significant one.

    _channel_rejection drops any channel whose RMS is more than 2 SD from the mean
    across channels. A patient with strong posterior alpha over quiet frontals is
    exactly that distribution: O1 and O2 are the outliers, so they are rejected and
    fit() returns "O1/O2 rejected" — which inference/infer.py renders as
    "Not well-formed".

    The perverse consequence is pinned in the second test: adding an *unrelated*
    artifact to a different channel inflates the cross-channel RMS spread, shrinks
    O1/O2's z-scores, and makes the same recording succeed. Noise fixes it.

    O1/O2 are the channels the PDR is measured on; they should never be discarded
    for carrying the signal being looked for.
    """

    @pytest.mark.xfail(strict=True, reason="RMS z-score rejects O1/O2 for carrying the alpha")
    def test_clean_posterior_alpha_is_measured(self):
        data = _with_alpha(_recording(), freq=10.0, amplitude=40.0)

        res = PDREstimator(SFREQ, O1, O2, PROMINENCE).fit(data)

        assert res.get("error") != "O1/O2 rejected"
        assert res["pdr_o1"] == pytest.approx(10.0, abs=0.5)

    def test_adding_unrelated_noise_elsewhere_makes_it_succeed(self):
        """The current, backwards behaviour. Delete this when the defect above is fixed."""
        clean = _with_alpha(_recording(), freq=10.0, amplitude=40.0)
        noisy = _with_alpha(_recording(), freq=10.0, amplitude=40.0)
        t = np.arange(noisy.shape[1]) / SFREQ
        noisy[5] += 300 * np.sin(2 * np.pi * 3 * t)

        est = PDREstimator(SFREQ, O1, O2, PROMINENCE)

        assert est.fit(clean)["pdr_o1"] is None
        assert est.fit(noisy)["pdr_o1"] == pytest.approx(10.0, abs=0.5)
