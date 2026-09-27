"""resampy's band-limited resampler with the `kaiser_fast` filter, in plain numpy.

NeuroTransformer was trained on data resampled by `resampy.resample(..., filter=
"kaiser_fast")`, so inference has to reproduce it. resampy itself JIT-compiles its inner
loop with numba, and numba + llvmlite add ~100 MB to the desktop build for this one
call. This is the same algorithm (resampy 0.4.3, `core.resample` and
`interpn._resample_loop`), vectorised over output samples instead of compiled, and
`kaiser_fast.npz` is resampy's own precomputed filter table. tests/test_kaiser_resample.py
pins the output against resampy's.

resampy is Copyright (c) 2016, Brian McFee, under the ISC license:

    Permission to use, copy, modify, and/or distribute this software for any purpose
    with or without fee is hereby granted, provided that the above copyright notice and
    this permission notice appear in all copies.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD
    TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN
    NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
    CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR
    PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
    ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
"""

import os

import numpy as np

_FILTER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kaiser_fast.npz")
_FILTER = None


def _kaiser_fast():
    global _FILTER
    if _FILTER is None:
        with np.load(_FILTER_PATH) as data:
            _FILTER = data["half_window"], int(data["precision"])
    return _FILTER


def _wing(x, n, frac, interp_win, interp_delta, num_table, index_step, n_taps, direction):
    """Accumulate one wing of the filter response for every output sample at once."""
    nwin = interp_win.shape[0]
    index_frac = frac * num_table
    offset = index_frac.astype(np.int64)
    eta = index_frac - offset
    taps = np.minimum(n_taps, (nwin - offset) // index_step)
    out = np.zeros(x.shape[:-1] + n.shape, dtype=x.dtype)
    for i in range(int(taps.max(initial=0))):
        live = i < taps
        idx = np.where(live, offset + i * index_step, 0)
        weight = np.where(live, interp_win[idx] + eta * interp_delta[idx], 0.0)
        src = n - i if direction < 0 else n + i + 1
        out += weight * x[..., np.clip(src, 0, x.shape[-1] - 1)]
    return out


def resample(x, sr_orig, sr_new, axis=-1):
    """Resample `x` from `sr_orig` to `sr_new` along `axis`, as resampy's kaiser_fast."""
    if sr_orig <= 0 or sr_new <= 0:
        raise ValueError(f"Invalid sample rate: {sr_orig} -> {sr_new}")
    if sr_orig == sr_new:
        return x.copy()

    x = np.moveaxis(np.asarray(x), axis, -1)
    if np.issubdtype(x.dtype, np.integer):
        x = x.astype(np.float32)

    sample_ratio = float(sr_new) / sr_orig
    # resampy recomputes the length this way to avoid a float round-off (its #111).
    n_out = int(x.shape[-1] * float(sr_new) / float(sr_orig))
    if n_out < 1:
        raise ValueError(f"Input signal length={x.shape[-1]} is too small to resample from {sr_orig}->{sr_new}")

    interp_win, num_table = _kaiser_fast()
    if sample_ratio < 1:
        interp_win = sample_ratio * interp_win
    interp_delta = np.diff(interp_win, append=interp_win[-1])

    scale = min(1.0, sample_ratio)
    index_step = int(scale * num_table)
    t_out = np.arange(n_out) * (1.0 / sample_ratio)
    n = t_out.astype(np.int64)
    frac = scale * (t_out - n)

    # Left wing reaches back to x[n - i]; the right wing forward to x[n + k + 1].
    y = _wing(x, n, frac, interp_win, interp_delta, num_table, index_step, n + 1, -1)
    y += _wing(x, n, scale - frac, interp_win, interp_delta, num_table, index_step, x.shape[-1] - n - 1, +1)
    return np.moveaxis(y, -1, axis)
