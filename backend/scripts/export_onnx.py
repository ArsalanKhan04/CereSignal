"""Export NeuroGate and NeuroTransformer to ONNX, and prove the export is faithful.

inference/infer.py runs both models with onnxruntime, so neither the worker nor the
desktop build needs torch. The .pt/.pth weights stay the source of truth; rerun this
whenever they change. It needs torch and onnx, which nothing else does:

    pip install -r requirements-export.txt
    python -m scripts.export_onnx          # from backend/

After exporting, every model is run through torch and onnxruntime on the same inputs —
random tensors at several batch sizes and lengths, and a synthetic recording pushed
through the real preprocessing pipelines — and the script exits non-zero unless the
logits agree and every decision infer.py derives from them (argmax, and NeuroTransformer's
confidence >= 0.9 gate) is identical.
"""

import os
import sys

import numpy as np

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODELS_DIR = os.path.join(BACKEND, "external", "models")
sys.path.insert(0, BACKEND)

OPSET = 17
# NeuroTransformer takes microvolt-scale input (|x| up to ~100), where float32 is
# coarse: torch alone disagrees with itself by ~2e-4 on the same windows batched
# differently. The decision checks below are the real gate; this catches a broken graph.
LOGIT_ATOL = 1e-3
# infer.py's NeuroTransformer confidence gate. A probability within this margin of the
# gate may land on either side of it purely through float32 reassociation.
GATE = 0.9
GATE_MARGIN = 1e-5


def _load_torch_model(name):
    import torch

    if name == "neurogate":
        from external.models.neurogate import NeuroGate

        model, weights = NeuroGate(21), "neurogate_wgts.pt"
    else:
        from external.models.neurotransformer import Neurotransformer

        model, weights = Neurotransformer(), "neurotransformer_wgts.pth"
    model.load_state_dict(torch.load(os.path.join(MODELS_DIR, weights), map_location="cpu"))
    model.eval()
    return model


def _export(name, model, example):
    import torch

    path = os.path.join(MODELS_DIR, f"{name}.onnx")
    with torch.no_grad():
        torch.onnx.export(
            model,
            (example,),
            path,
            dynamo=False,
            opset_version=OPSET,
            input_names=["input"],
            output_names=["logits"],
            # Batch only. The legacy tracer bakes the sequence length into the attention
            # reshapes, and both pipelines produce a fixed length anyway (see main()).
            dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
            do_constant_folding=True,
        )
    import onnx

    onnx.checker.check_model(onnx.load(path))
    print(f"exported {os.path.relpath(path, BACKEND)} ({os.path.getsize(path) / 1e6:.1f} MB)")
    return path


def _softmax(x):
    e = np.exp(x - x.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def _compare(label, model, session, x):
    import torch

    with torch.no_grad():
        expected = model(torch.from_numpy(x)).numpy()
    actual = session.run(None, {"input": x})[0]
    diff = float(np.abs(expected - actual).max())
    failures = []
    if diff > LOGIT_ATOL:
        failures.append(f"max |logit diff| {diff:.2e} > {LOGIT_ATOL:.0e}")
    if not np.array_equal(expected.argmax(1), actual.argmax(1)):
        failures.append("argmax differs")
    p_exp, p_act = _softmax(expected).max(1), _softmax(actual).max(1)
    flipped = (p_exp >= GATE) != (p_act >= GATE)
    if np.any(flipped & (np.abs(p_exp - GATE) > GATE_MARGIN)):
        failures.append("confidence gate differs")
    print(f"  {label:<40} max |diff| {diff:.2e}  {'FAIL: ' + '; '.join(failures) if failures else 'ok'}")
    return not failures


def _synthetic_raw(sfreq, seconds, seed):
    """A 21-channel NMT-montage recording with EEG-like amplitude and a 10 Hz rhythm."""
    import mne

    from external.CereProcess.datasets.channels import NMT_CHANNELS

    rng = np.random.default_rng(seed)
    n = int(sfreq * seconds)
    t = np.arange(n) / sfreq
    # Brown-ish background plus alpha, in volts (~30 uV), which is what MNE hands the
    # pipelines after reading a correctly calibrated EDF.
    noise = np.cumsum(rng.standard_normal((len(NMT_CHANNELS), n)), axis=1)
    noise -= noise.mean(axis=1, keepdims=True)
    noise /= noise.std(axis=1, keepdims=True)
    alpha = np.sin(2 * np.pi * 10 * t + rng.uniform(0, 2 * np.pi, (len(NMT_CHANNELS), 1)))
    data = (noise + 0.5 * alpha) * 30e-6
    info = mne.create_info(NMT_CHANNELS, sfreq, ch_types="eeg")
    return mne.io.RawArray(data, info, verbose=False)


def main():
    import onnxruntime as ort
    import torch

    from external.CereProcess.datasets.pipeline import get_nmt_pipeline, neurotransformer_pipeline

    torch.manual_seed(0)
    # The fused MHA fast path would trace into nested-tensor kernels ONNX cannot express.
    torch.backends.mha.set_fastpath_enabled(False)
    rng = np.random.default_rng(0)
    ok = True

    # Input lengths are fixed by the pipelines: PaddedCropData always yields 10 minutes,
    # resampled to 100 Hz (get_nmt_pipeline), and NeuroTransformer sees 2 s windows at
    # 200 Hz, one channel at a time (neurotransformer_pipeline).
    specs = {
        "neurogate": (np.zeros((1, 21, 60000), np.float32), [(1, 21, 60000), (2, 21, 60000)]),
        "neurotransformer": (np.zeros((8, 1, 400), np.float32), [(1, 1, 400), (37, 1, 400), (300, 1, 400)]),
    }
    models, sessions = {}, {}
    for name, (example, shapes) in specs.items():
        model = _load_torch_model(name)
        path = _export(name, model, torch.from_numpy(example))
        session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        models[name], sessions[name] = model, session
        for shape in shapes:
            x = rng.standard_normal(shape).astype(np.float32)
            ok &= _compare(f"random {shape}", model, session, x)

    for sfreq, seed in ((256.0, 1), (500.0, 2)):
        raw = _synthetic_raw(sfreq, 11 * 60, seed)
        x = get_nmt_pipeline().apply(raw.copy()).get_data()[None].astype(np.float32)
        ok &= _compare(f"neurogate, synthetic {sfreq:g} Hz", models["neurogate"], sessions["neurogate"], x)
        data = neurotransformer_pipeline("NMT").apply(raw.copy()).get_data().astype(np.float32)
        for i in range(data.shape[1]):
            ok &= _compare(
                f"neurotransformer, synthetic {sfreq:g} Hz ch{i}",
                models["neurotransformer"],
                sessions["neurotransformer"],
                np.ascontiguousarray(data[:, i : i + 1, :]),
            )

    if not ok:
        print("PARITY FAILED — do not commit these .onnx files")
        return 1
    print("parity ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
