import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Polygon, Wedge
import mne

# Directory to store generated plots
PLOT_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'plots')
os.makedirs(PLOT_DIR, exist_ok=True)

# Manual positions for common EEG channels (same layout used in frontend tooling)
MANUAL_POS = {
    'Fz': (0.0, 0.45), 'Cz': (0.0, 0.0), 'Pz': (0.0, -0.45),
    'F3': (-0.35, 0.45), 'C3': (-0.45, 0.0), 'P3': (-0.35, -0.45),
    'F4': (0.35, 0.45), 'C4': (0.45, 0.0), 'P4': (0.35, -0.45),
    'Fp1': (-0.30, 0.85), 'Fp2': (0.30, 0.85),
    'F7': (-0.75, 0.55), 'T3': (-0.85, 0.0), 'T5': (-0.75, -0.55),
    'F8': (0.75, 0.55), 'T4': (0.85, 0.0), 'T6': (0.75, -0.55),
    'O1': (-0.30, -0.85), 'O2': (0.30, -0.85),
}

ALIAS_MAP = {
    'FP1': 'Fp1', 'FP2': 'Fp2', 'FZ': 'Fz', 'CZ': 'Cz', 'PZ': 'Pz', 'OZ': 'Oz',
    'T7': 'T3', 'T8': 'T4', 'P7': 'T5', 'P8': 'T6',
}


def _build_channel_stats_from_events(events: dict):
    """Convert events structure (per-channel merged events) into channel stats
    expected by the topomap plotting function: {ch: {'total': N, 'abnormal': M}}
    """
    stats = {}
    for ch, ev_dict in (events or {}).items():
        total = 0
        abnormal = 0
        for etype, evlist in ev_dict.items():
            count = len(evlist or [])
            total += count
            # Consider anything other than 'normal wave' as abnormal
            if etype != 'normal wave':
                abnormal += count
        stats[ch] = {'total': total, 'abnormal': abnormal}
    return stats


def generate_topomap_from_events(recording_basename: str, events: dict, title_suffix: str = "", vmax: int = None):
    """Generates a topomap PNG from merged events dict and saves it under static/plots.

    Args:
        recording_basename: base filename (without extension) of the recording - used for output filename
        events: dict mapping channel-> {event_type: [[s,e], ...], ...}
        title_suffix: optional text to show above the map
        vmax: optional vmax for shared scaling (if None, computed automatically)

    Returns:
        path to saved PNG file
    """
    channel_stats = _build_channel_stats_from_events(events)

    # Compute vmax if not provided
    if vmax is None:
        vmax = max([v['abnormal'] for v in channel_stats.values()]) if channel_stats else 1
        vmax = max(1, int(vmax))

    # Build plot arrays aligned to MANUAL_POS order
    plot_vals, plot_pos, plot_names = [], [], []
    for manual_name, coords in MANUAL_POS.items():
        # try to find matching channel in stats (case-insensitive aliasing)
        found = None
        for chname, st in channel_stats.items():
            mapped = ALIAS_MAP.get(chname.upper(), chname)
            if mapped == manual_name:
                found = st
                break
        if found is None:
            total, abnormal = 0, 0
        else:
            total, abnormal = found['total'], found['abnormal']
        val = abnormal
        plot_vals.append(val)
        plot_pos.append(coords)
        plot_names.append(manual_name)

    plot_vals = np.array(plot_vals)
    plot_pos = np.array(plot_pos)

    # Create figure
    fig, ax = plt.subplots(figsize=(6, 6), constrained_layout=False)

    # Use mne's plotting utility where possible
    kwargs = dict(axes=ax, show=False, cmap='RdBu_r', contours=0, extrapolate='head',
                  sphere=(0, 0, 0, 1.0), border='mean', outlines=None, sensors=False)

    try:
        im, _ = mne.viz.plot_topomap(plot_vals, plot_pos, vlim=(0, vmax), **kwargs)
    except TypeError:
        try:
            im, _ = mne.viz.plot_topomap(plot_vals, plot_pos, vmin=0, vmax=vmax, **kwargs)
        except Exception:
            im, _ = mne.viz.plot_topomap(plot_vals, plot_pos, **kwargs)

    # Add donut and head outline
    donut = Wedge((0, 0), r=2.0, theta1=0, theta2=360, width=1.0, color='white', zorder=2)
    ax.add_patch(donut)
    ax.add_patch(Circle((0, 0), radius=1.0, color='black', linewidth=2, fill=False, zorder=3))
    nose = Polygon([(-0.1, 0.99), (0, 1.1), (0.1, 0.99)], color='black', fill=False, linewidth=2, zorder=3)
    ax.add_patch(nose)

    ax.scatter(plot_pos[:, 0], plot_pos[:, 1], s=150, edgecolors='black', facecolors='none', linewidth=1, zorder=4)

    for idx, name in enumerate(plot_names):
        x, y = plot_pos[idx]
        ax.text(x + 0.08, y, name, fontsize=10, ha='left', va='center', fontweight='normal', zorder=5)

    ax.set_xlim(-1.15, 1.15)
    ax.set_ylim(-1.15, 1.15)
    ax.set_axis_off()
    ax.set_title(title_suffix, fontsize=12, fontweight='bold', pad=20)

    # Save to temp, upload to Supabase assets bucket, remove temp
    import tempfile
    from app.services.storage_service import storage_service, ASSETS_BUCKET
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp_path = tmp.name
    tmp.close()
    fig.savefig(tmp_path, dpi=150)
    plt.close(fig)
    object_path = f"topomaps/{recording_basename}_topomap.png"
    with open(tmp_path, "rb") as f:
        storage_service.upload(ASSETS_BUCKET, object_path, f.read())
    os.unlink(tmp_path)
    return object_path


if __name__ == '__main__':
    # quick local test helper (won't be executed in import)
    pass
