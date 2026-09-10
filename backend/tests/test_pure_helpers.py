"""
Unit tests for the pure helpers scattered across the backend.

Everything here runs without a database, a broker, torch, or model weights.
"""

import pytest

from app.core.config import Settings
from app.core.database import _connect_args
from app.main import _friendly_msg
from inference.infer import (
    _compute_focus_points,
    _get_clinical_adjective,
    _merge_events,
)


class TestConnectArgs:
    """
    sslmode is Postgres-only. Passing it to SQLite raises TypeError at connect
    time, which is what once made local development impossible.
    """

    @pytest.mark.parametrize(
        "url, expected",
        [
            ("postgresql://user:pw@host:5432/db", {"sslmode": "require"}),
            ("postgres://user:pw@host:5432/db", {"sslmode": "require"}),
            ("sqlite:///./cere_signal.db", {"check_same_thread": False}),
            ("sqlite://", {"check_same_thread": False}),
            ("mysql://user:pw@host/db", {}),
        ],
    )
    def test_driver_specific_args(self, url, expected):
        assert _connect_args(url) == expected


class TestSettingsValidators:
    """Both list settings accept either a real list or a comma-separated string."""

    def test_cors_origins_from_comma_string(self):
        settings = Settings(BACKEND_CORS_ORIGINS="http://a.test, http://b.test")
        assert settings.BACKEND_CORS_ORIGINS == ["http://a.test", "http://b.test"]

    def test_cors_origins_from_list_passes_through(self):
        settings = Settings(BACKEND_CORS_ORIGINS=["http://a.test"])
        assert settings.BACKEND_CORS_ORIGINS == ["http://a.test"]

    def test_file_types_from_comma_string_are_stripped(self):
        settings = Settings(ALLOWED_FILE_TYPES=".edf, .csv ,.json")
        assert settings.ALLOWED_FILE_TYPES == [".edf", ".csv", ".json"]

    def test_file_types_default(self):
        assert Settings().ALLOWED_FILE_TYPES == [".edf", ".csv", ".json", ".txt"]


class TestFriendlyMsg:
    """Turns raw Pydantic errors into the strings the frontend surfaces."""

    def test_missing_field_uses_the_label_table(self):
        msg = _friendly_msg({"loc": ["body", "username"], "type": "missing"})
        assert msg == "Username is required."

    def test_unknown_field_is_title_cased(self):
        msg = _friendly_msg({"loc": ["body", "some_field"], "type": "missing"})
        assert msg == "Some Field is required."

    def test_string_too_short_includes_the_minimum(self):
        msg = _friendly_msg({
            "loc": ["body", "password"],
            "type": "string_too_short",
            "ctx": {"min_length": 6},
        })
        assert msg == "Password is too short (minimum 6 characters)."

    def test_string_too_short_without_ctx_degrades_to_a_placeholder(self):
        msg = _friendly_msg({"loc": ["body", "password"], "type": "string_too_short"})
        assert "minimum ? characters" in msg

    def test_email_value_error_is_special_cased(self):
        msg = _friendly_msg({
            "loc": ["body", "email"],
            "type": "value_error",
            "msg": "value is not a valid email address",
        })
        assert msg == "Please enter a valid email address."

    def test_unrecognised_type_falls_back_to_the_raw_message(self):
        msg = _friendly_msg({
            "loc": ["body", "whatever"],
            "type": "some_future_pydantic_code",
            "msg": "raw pydantic text",
        })
        assert msg == "raw pydantic text"

    def test_empty_error_dict_does_not_raise(self):
        assert _friendly_msg({}) == "Invalid value"


class TestClinicalAdjective:
    """
    ACNS 2021 quantification bands. Note the second band is threshold-relative,
    so the Occasional/Frequent boundary moves with the caller's threshold.
    """

    @pytest.mark.parametrize(
        "percentage, expected",
        [
            (0.0, "Rare"),
            (0.99, "Rare"),
            (1.0, "Occasional"),
            (14.99, "Occasional"),   # threshold 5 -> band ends at 15
            (15.0, "Frequent"),
            (49.99, "Frequent"),
            (50.0, "Abundant"),
            (89.99, "Abundant"),
            (90.0, "Continuous"),
            (100.0, "Continuous"),
        ],
    )
    def test_bands(self, percentage, expected):
        assert _get_clinical_adjective(percentage, threshold=5.0) == expected

    def test_second_band_tracks_the_threshold(self):
        # With threshold 20 the Occasional band runs to 30, not 15.
        assert _get_clinical_adjective(25.0, threshold=20.0) == "Occasional"
        assert _get_clinical_adjective(25.0, threshold=5.0) == "Frequent"


class TestMergeEvents:
    """Collapses a per-window event sequence into [start, end] intervals of 2s."""

    def test_empty_sequence_yields_empty_buckets(self):
        assert _merge_events([]) == {
            "normal wave": [], "spike wave": [], "slow wave": [],
        }

    def test_consecutive_identical_events_extend_one_interval(self):
        merged = _merge_events(["normal wave"] * 3)
        assert merged["normal wave"] == [[0, 6]]

    def test_alternating_events_start_new_intervals(self):
        merged = _merge_events(["normal wave", "spike wave", "normal wave"])
        assert merged["normal wave"] == [[0, 2], [4, 6]]
        assert merged["spike wave"] == [[2, 4]]

    def test_intervals_are_indexed_from_the_window_position(self):
        merged = _merge_events(["normal wave", "normal wave", "slow wave"])
        assert merged["slow wave"] == [[4, 6]]

    def test_numpy_style_values_are_coerced_to_str(self):
        import numpy as np

        merged = _merge_events(np.array(["spike wave", "spike wave"]))
        assert merged["spike wave"] == [[0, 4]]


class TestComputeFocusPoints:
    """
    Aggregates per-channel events into 10s windows (5 x 2s) and reports the
    abnormal peaks the EEG viewer jumps between.
    """

    def test_empty_input_returns_empty(self):
        assert _compute_focus_points({}) == []

    def test_recording_shorter_than_the_aggregation_window_returns_empty(self):
        # 4 windows < window_size of 5
        raw = {"C3": ["spike wave"] * 4}
        assert _compute_focus_points(raw) == []

    def test_all_normal_yields_no_focus_points(self):
        raw = {"C3": ["normal wave"] * 20, "C4": ["normal wave"] * 20}
        assert _compute_focus_points(raw) == []

    def test_a_sustained_abnormal_burst_is_reported(self):
        # 20 windows; both channels abnormal in the middle stretch.
        events = ["normal wave"] * 20
        for i in range(8, 13):
            events[i] = "spike wave"
        raw = {"C3": list(events), "C4": list(events)}

        points = _compute_focus_points(raw, threshold=0.5)

        assert points, "a 5-window burst across every channel should be a focus point"
        for point in points:
            assert point["window_end"] - point["window_start"] == 10.0
            assert point["window_start"] == point["center_s"] - 5
            assert 0 < point["abnormal_pct"] <= 100

    def test_below_threshold_falls_back_to_the_top_n(self):
        # One channel of four abnormal => 25%, under the 0.5 threshold, so the
        # peak branch finds nothing and the fallback supplies the busiest windows.
        events = ["normal wave"] * 20
        for i in range(8, 13):
            events[i] = "slow wave"
        raw = {
            "C3": list(events),
            "C4": ["normal wave"] * 20,
            "P3": ["normal wave"] * 20,
            "P4": ["normal wave"] * 20,
        }

        points = _compute_focus_points(raw, threshold=0.5, fallback_n=3)

        assert 0 < len(points) <= 3
        assert points == sorted(points, key=lambda p: p["center_s"])

    def test_fallback_skips_windows_with_no_abnormality(self):
        raw = {"C3": ["normal wave"] * 20}
        assert _compute_focus_points(raw, threshold=0.5, fallback_n=10) == []
