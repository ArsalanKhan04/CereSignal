"""
EEG in-memory cache service with simple LRU eviction.
Keeps loaded MNE Raw objects (preloaded) in memory keyed by file_id.
Provides segment extraction by time range and channel list.
"""
from collections import OrderedDict
import threading
from typing import Optional, List, Dict, Any


class EEGCacheService:
    def __init__(self, max_items: int = 4):
        self.max_items = max_items
        self._cache: "OrderedDict[int, Dict[str, Any]]" = OrderedDict()
        self._lock = threading.Lock()

    def load_file(self, file_id: int, file_path: str) -> Dict[str, Any]:
        """Load EEG file into memory (using MNE if available). Moves entry to most-recently-used.
        Returns metadata dict containing the loaded raw object and basic info.
        """
        try:
            import mne
        except Exception as e:
            raise RuntimeError("mne is required to load EDF files: %s" % e)

        with self._lock:
            if file_id in self._cache:
                # mark as recently used
                self._cache.move_to_end(file_id)
                return self._cache[file_id]

            # Download from Supabase to a temp file; preload=True puts all data in RAM
            # so the temp file can be deleted immediately after this call.
            from app.services.storage_service import storage_service, SIGNALS_BUCKET
            with storage_service.temp_local_file(SIGNALS_BUCKET, file_path, suffix=".edf") as local_path:
                raw = mne.io.read_raw_edf(local_path, preload=True, verbose=False)
            meta = {
                "raw": raw,
                "ch_names": list(raw.ch_names),
                "sfreq": float(raw.info.get("sfreq", 0.0)),
            }

            self._cache[file_id] = meta
            self._cache.move_to_end(file_id)

            # evict least recently used if over capacity
            while len(self._cache) > self.max_items:
                evicted_id, _ = self._cache.popitem(last=False)
                # best-effort cleanup
                # MNE Raw objects will be garbage collected once dereferenced

            return meta

    def evict(self, file_id: int) -> None:
        """Remove a cached file so the next load_file call re-reads from storage."""
        with self._lock:
            self._cache.pop(file_id, None)

    def get_segment(
        self,
        file_id: int,
        start_time: float = 0.0,
        duration: float = 10.0,
        channels: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Return a time-segment of the loaded file as plain Python lists (JSON serializable).
        channels: optional list of channel names; if None, return all channels.
        """
        with self._lock:
            if file_id not in self._cache:
                raise KeyError("file not loaded")
            # mark as recently used
            self._cache.move_to_end(file_id)
            meta = self._cache[file_id]

        raw = meta["raw"]
        sfreq = meta["sfreq"]
        ch_names = meta["ch_names"]
        total_duration = (raw.n_times / sfreq) if sfreq else 0.0

        # compute start/end samples
        if start_time < 0:
            start_time = 0.0
        if duration <= 0:
            duration = 10.0
        if total_duration and start_time > total_duration:
            start_time = max(0.0, total_duration - duration)
        end_time = start_time + duration
        if total_duration and end_time > total_duration:
            end_time = total_duration

        start_sample = int(start_time * sfreq)
        end_sample = int(end_time * sfreq)

        # prepare picks
        if channels and len(channels) > 0:
            picks = [i for i, ch in enumerate(ch_names) if ch in channels]
        else:
            picks = None

        # slice using MNE indexing: raw[picks, start:stop] -> (data, times)
        if picks is None:
            data, times = raw[:, start_sample:end_sample]
            chosen_names = ch_names
        else:
            # ensure picks are valid and map back to channel names
            if len(picks) == 0:
                return {"sampling_rate": sfreq, "channels": [], "times": []}
            data, times = raw[picks, start_sample:end_sample]
            chosen_names = [ch_names[i] for i in picks]

        # data: ndarray shape (n_channels, n_samples)
        # Convert to lists for JSON serializable response
        channels_out = []
        for i, name in enumerate(chosen_names):
            channels_out.append({
                "channel_name": name,
                "data": data[i].tolist(),
                "sampling_rate": sfreq,
            })

        return {
            "sampling_rate": sfreq,
            "channels": channels_out,
            "times": times.tolist(),
            "start_time": start_time,
            "end_time": end_time,
            "n_samples": data.shape[1] if data is not None else 0,
            "total_duration": total_duration,
        }


# global instance
eeg_cache = EEGCacheService(max_items=4)
