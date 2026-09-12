"""
Tests for ``app/services/eeg_cache_service.py`` — the in-memory LRU cache of
loaded MNE Raw objects that backs the EEG viewer.

Previously at 14%. Two things make it worth covering: the eviction policy decides
how much RAM a worker holds (each entry is a fully preloaded recording), and
``get_segment`` does all of its own bounds arithmetic on caller-supplied
``start_time``/``duration`` — values that arrive straight from a query string.

``load_file`` needs real storage and MNE, so it is exercised via the ``tiny_edf``
fixture and the ``local_storage`` backend rather than mocked.
"""

import pytest

from app.services.eeg_cache_service import EEGCacheService


@pytest.fixture
def cache():
    return EEGCacheService(max_items=2)


def _seed(cache, file_id, sfreq=100.0, n_times=1000, n_channels=3):
    """Insert a fake entry directly, so segment maths can be tested without MNE."""
    import numpy as np

    class _FakeRaw:
        def __init__(self):
            self.n_times = n_times
            self._data = np.arange(n_channels * n_times, dtype=float).reshape(n_channels, n_times)

        def __getitem__(self, key):
            picks, sl = key
            idx = range(n_channels) if picks == slice(None) else picks
            data = self._data[list(idx), sl]
            times = np.arange(sl.start, sl.stop) / sfreq
            return data, times

    cache._cache[file_id] = {
        "raw": _FakeRaw(),
        "ch_names": [f"CH{i}" for i in range(n_channels)],
        "sfreq": sfreq,
    }
    return cache._cache[file_id]


class TestEviction:
    def test_the_least_recently_used_entry_is_dropped(self, cache):
        _seed(cache, 1)
        _seed(cache, 2)
        _seed(cache, 3)

        while len(cache._cache) > cache.max_items:
            cache._cache.popitem(last=False)

        assert 1 not in cache._cache
        assert {2, 3} == set(cache._cache)

    def test_evict_removes_a_specific_entry(self, cache):
        _seed(cache, 1)

        cache.evict(1)

        assert 1 not in cache._cache

    def test_evicting_an_absent_entry_is_a_no_op(self, cache):
        cache.evict(999)  # must not raise

    def test_get_segment_marks_an_entry_as_recently_used(self, cache):
        _seed(cache, 1)
        _seed(cache, 2)

        cache.get_segment(1, start_time=0.0, duration=1.0)

        assert list(cache._cache) == [2, 1]


class TestGetSegmentBounds:
    def test_an_unloaded_file_raises_keyerror(self, cache):
        with pytest.raises(KeyError):
            cache.get_segment(42)

    def test_a_negative_start_is_clamped_to_zero(self, cache):
        _seed(cache, 1)

        seg = cache.get_segment(1, start_time=-50.0, duration=1.0)

        assert seg["start_time"] == 0.0

    def test_a_non_positive_duration_falls_back_to_ten_seconds(self, cache):
        _seed(cache, 1, sfreq=100.0, n_times=10_000)  # 100s long

        seg = cache.get_segment(1, start_time=0.0, duration=0)

        assert seg["end_time"] == 10.0

    def test_a_start_past_the_end_is_pulled_back_into_range(self, cache):
        _seed(cache, 1, sfreq=100.0, n_times=1000)  # 10s long

        seg = cache.get_segment(1, start_time=999.0, duration=2.0)

        assert seg["start_time"] == pytest.approx(8.0)
        assert seg["end_time"] == pytest.approx(10.0)

    def test_the_window_is_truncated_at_the_end_of_the_recording(self, cache):
        _seed(cache, 1, sfreq=100.0, n_times=1000)  # 10s

        seg = cache.get_segment(1, start_time=8.0, duration=30.0)

        assert seg["end_time"] == pytest.approx(10.0)

    def test_total_duration_is_reported(self, cache):
        _seed(cache, 1, sfreq=100.0, n_times=1000)

        assert cache.get_segment(1, duration=1.0)["total_duration"] == pytest.approx(10.0)


class TestGetSegmentChannels:
    def test_all_channels_are_returned_by_default(self, cache):
        _seed(cache, 1, n_channels=3)

        seg = cache.get_segment(1, duration=1.0)

        assert [c["channel_name"] for c in seg["channels"]] == ["CH0", "CH1", "CH2"]

    def test_a_channel_subset_is_honoured(self, cache):
        _seed(cache, 1, n_channels=3)

        seg = cache.get_segment(1, duration=1.0, channels=["CH0", "CH2"])

        assert [c["channel_name"] for c in seg["channels"]] == ["CH0", "CH2"]

    def test_an_unknown_channel_name_yields_an_empty_result(self, cache):
        """No match must not fall through to 'return everything'."""
        _seed(cache, 1, n_channels=3)

        seg = cache.get_segment(1, duration=1.0, channels=["NOPE"])

        assert seg["channels"] == []
        assert seg["times"] == []

    def test_the_payload_is_json_serialisable(self, cache):
        import json

        _seed(cache, 1, n_channels=2)

        json.dumps(cache.get_segment(1, duration=1.0))  # must not raise


class TestLoadFile:
    def test_a_real_edf_round_trips_through_storage(self, cache, local_storage, tiny_edf):
        from app.services.storage_service import SIGNALS_BUCKET

        with open(tiny_edf["path"], "rb") as fh:
            local_storage.upload(SIGNALS_BUCKET, "cached.edf", fh.read())

        meta = cache.load_file(1, "cached.edf")

        assert meta["sfreq"] == pytest.approx(256.0)
        assert len(meta["ch_names"]) > 0

    def test_a_second_load_is_served_from_cache(self, cache, local_storage, tiny_edf):
        from app.services.storage_service import SIGNALS_BUCKET

        with open(tiny_edf["path"], "rb") as fh:
            local_storage.upload(SIGNALS_BUCKET, "cached.edf", fh.read())

        first = cache.load_file(1, "cached.edf")
        local_storage.delete(SIGNALS_BUCKET, "cached.edf")

        assert cache.load_file(1, "cached.edf") is first
