"""
Runs the committed NeuroGate and NeuroTransformer ONNX models through infer.py's real
preprocessing and inference code.

This is the only suite that executes the models themselves. It needs onnxruntime
(requirements-dev.txt) and nothing else — no torch, no broker, no worker. Whether the
.onnx files faithfully reproduce the torch weights is scripts/export_onnx.py's job; this
checks that infer.py drives them correctly and that the files load at all.
"""

import mne
import numpy as np
import pytest

pytest.importorskip("onnxruntime")

from external.CereProcess.datasets.channels import (
    NEUROTRANSFORMER_CHANNELS,
    NMT_CHANNELS,
)
from inference import infer

SFREQ = 200.0
SECONDS = 90


@pytest.fixture(scope="module")
def recording():
    """90 s of EEG-scale (~30 uV) noise plus a 10 Hz rhythm, NMT montage."""
    rng = np.random.default_rng(0)
    n = int(SFREQ * SECONDS)
    t = np.arange(n) / SFREQ
    data = rng.standard_normal((len(NMT_CHANNELS), n)) + 0.5 * np.sin(2 * np.pi * 10 * t)
    info = mne.create_info(NMT_CHANNELS, SFREQ, ch_types="eeg")
    return mne.io.RawArray(data * 30e-6, info, verbose=False)


class TestNeuroGate:
    def test_it_returns_a_condition_and_a_probability(self, recording):
        condition, probability = infer._process_neurogate(recording.copy())

        assert condition in {"Normal", "Abnormal"}
        assert 0.0 <= probability <= 100.0

    def test_the_condition_follows_the_probability(self, recording):
        condition, probability = infer._process_neurogate(recording.copy())

        assert (condition == "Abnormal") == (probability > 50.0)

    def test_it_is_deterministic(self, recording):
        assert infer._process_neurogate(recording.copy()) == infer._process_neurogate(recording.copy())


class TestNeuroTransformer:
    def test_every_channel_gets_one_label_per_two_second_window(self, recording):
        _, raw_events = infer._process_neurotransformer(recording.copy(), 0.9)

        assert list(raw_events) == NEUROTRANSFORMER_CHANNELS
        assert {len(labels) for labels in raw_events.values()} == {SECONDS // 2}

    def test_labels_come_from_the_three_classes(self, recording):
        _, raw_events = infer._process_neurotransformer(recording.copy(), 0.5)

        labels = {label for channel in raw_events.values() for label in channel}
        assert labels <= {"normal wave", "spike wave", "slow wave"}

    def test_a_certainty_gate_above_one_labels_everything_normal(self, recording):
        # No softmax probability reaches 1.01, so every window falls back to normal.
        _, raw_events = infer._process_neurotransformer(recording.copy(), 1.01)

        assert {label for channel in raw_events.values() for label in channel} == {"normal wave"}


def test_sessions_are_cached(recording):
    assert infer.load_model("neurogate") is infer.load_model("neurogate")


def test_an_unknown_model_is_rejected():
    with pytest.raises(ValueError):
        infer.load_model("nope")


def test_softmax_rows_sum_to_one_and_survive_large_logits():
    probs = infer._softmax(np.array([[1000.0, 0.0, -1000.0], [1.0, 2.0, 3.0]]))

    np.testing.assert_allclose(probs.sum(axis=1), 1.0)
    assert probs[0, 0] == pytest.approx(1.0)
