"""
Tests for ``app/services/brain_viz_service.py`` — the topomap renderer.

This module had no coverage at all. It needs no extra dependency to test: it
already selects matplotlib's headless ``Agg`` backend at import
(``brain_viz_service.py:4``), so it renders fine on a display-less CI runner.

``generate_topomap_from_events`` writes through ``storage_service``, so these
tests run against the ``local_storage`` fixture and assert on the object that
lands in the assets bucket rather than on a local file — the function returns an
object path, not a filesystem path.
"""

import pytest

from app.services.brain_viz_service import (
    _build_channel_stats_from_events,
    generate_topomap_from_events,
)
from app.services.storage_service import ASSETS_BUCKET

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class TestBuildChannelStats:
    def test_counts_are_summed_per_channel(self):
        events = {"Fp1": {"spike wave": [[0, 1], [2, 3]], "normal wave": [[4, 5]]}}

        stats = _build_channel_stats_from_events(events)

        assert stats["Fp1"] == {"total": 3, "abnormal": 2}

    def test_normal_waves_are_not_abnormal(self):
        events = {"O1": {"normal wave": [[0, 1], [2, 3], [4, 5]]}}

        assert _build_channel_stats_from_events(events)["O1"]["abnormal"] == 0

    def test_every_non_normal_event_type_counts_as_abnormal(self):
        events = {"C3": {"slow wave": [[0, 1]], "spike wave": [[2, 3]]}}

        assert _build_channel_stats_from_events(events)["C3"]["abnormal"] == 2

    def test_an_empty_event_list_contributes_nothing(self):
        events = {"C4": {"spike wave": []}}

        assert _build_channel_stats_from_events(events)["C4"] == {"total": 0, "abnormal": 0}

    @pytest.mark.parametrize("events", [None, {}])
    def test_degenerate_input_yields_no_stats(self, events):
        assert _build_channel_stats_from_events(events) == {}


class TestGenerateTopomap:
    def test_it_uploads_a_png_to_the_assets_bucket(self, local_storage):
        events = {"Fp1": {"spike wave": [[0, 1]]}, "O1": {"normal wave": [[0, 1]]}}

        object_path = generate_topomap_from_events("rec123", events)

        assert object_path == "topomaps/rec123_topomap.png"
        assert local_storage.download(ASSETS_BUCKET, object_path).startswith(PNG_MAGIC)

    def test_the_object_path_is_namespaced_by_recording(self, local_storage):
        a = generate_topomap_from_events("patient-a-study", {"O1": {"spike wave": [[0, 1]]}})
        b = generate_topomap_from_events("patient-b-study", {"O1": {"spike wave": [[0, 1]]}})

        assert a != b

    def test_an_empty_event_set_still_renders(self, local_storage):
        """A normal study has nothing to plot and must not blow up the pipeline."""
        object_path = generate_topomap_from_events("all-normal", {})

        assert local_storage.download(ASSETS_BUCKET, object_path).startswith(PNG_MAGIC)

    def test_an_explicit_vmax_is_accepted(self, local_storage):
        events = {"Fp1": {"spike wave": [[0, 1]] * 40}}

        object_path = generate_topomap_from_events("scaled", events, vmax=10)

        assert local_storage.download(ASSETS_BUCKET, object_path).startswith(PNG_MAGIC)

    def test_unknown_channel_names_are_tolerated(self, local_storage):
        """Channel labels come from the recording header and are not a fixed set."""
        events = {"NOT-A-CHANNEL": {"spike wave": [[0, 1]]}, "O1": {"slow wave": [[0, 1]]}}

        object_path = generate_topomap_from_events("odd-channels", events)

        assert local_storage.download(ASSETS_BUCKET, object_path).startswith(PNG_MAGIC)

    def test_a_title_suffix_is_accepted(self, local_storage):
        object_path = generate_topomap_from_events(
            "titled", {"O1": {"spike wave": [[0, 1]]}}, "Follow-up study"
        )

        assert local_storage.download(ASSETS_BUCKET, object_path).startswith(PNG_MAGIC)

    def test_it_leaves_no_matplotlib_figures_open(self, local_storage):
        """Each call closes its figure — a worker renders these in a loop."""
        import matplotlib.pyplot as plt

        plt.close("all")
        for i in range(3):
            generate_topomap_from_events(f"leak{i}", {"O1": {"spike wave": [[0, 1]]}})

        assert plt.get_fignums() == []
