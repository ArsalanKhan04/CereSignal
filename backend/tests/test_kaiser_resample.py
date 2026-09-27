"""
Tests for ``external/CereProcess/datasets/_kaiser_resample.py``.

NeuroTransformer was trained on resampy's ``kaiser_fast`` output, and the numpy port
replaced resampy so that numba stays out of the desktop build. The fixture holds
resampy 0.4.3's own output for the same inputs, generated once in an environment that
had resampy, so this suite needs neither resampy nor numba.
"""

import os

import numpy as np
import pytest

from external.CereProcess.datasets._kaiser_resample import resample

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "kaiser_fast_resampy_0.4.3.npz")
RATES = ["256", "500", "100", "199.5"]


@pytest.fixture(scope="module")
def reference():
    with np.load(FIXTURE) as data:
        return {key: data[key] for key in data.files}


@pytest.mark.parametrize("rate", RATES)
def test_it_matches_resampy(reference, rate):
    x, expected = reference[f"x_{rate}"], reference[f"y_{rate}"]
    actual = resample(x, float(rate), 200, axis=1)
    assert actual.shape == expected.shape
    np.testing.assert_allclose(actual, expected, rtol=0, atol=1e-9)


def test_it_resamples_along_the_requested_axis(reference):
    x = reference["x_256"]
    np.testing.assert_allclose(resample(x.T, 256.0, 200, axis=0).T, resample(x, 256.0, 200, axis=1), atol=1e-12)


def test_an_equal_rate_returns_a_copy():
    x = np.arange(10.0)
    y = resample(x, 200, 200)
    assert np.array_equal(x, y) and y is not x


def test_integer_input_is_resampled_as_float32():
    assert resample(np.arange(512, dtype=np.int16), 256, 200).dtype == np.float32


@pytest.mark.parametrize("sr_orig, sr_new", [(0, 200), (200, -1)])
def test_it_rejects_a_non_positive_rate(sr_orig, sr_new):
    with pytest.raises(ValueError):
        resample(np.zeros(100), sr_orig, sr_new)


def test_it_rejects_a_signal_too_short_to_resample():
    with pytest.raises(ValueError):
        resample(np.zeros(1), 256, 200)
