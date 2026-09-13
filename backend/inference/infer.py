import json
import os
import sys
import time

import mne
import numpy as np
from celery import Celery

# NOTE: torch, openai and everything under external/ are imported lazily inside the
# functions that need them. With AI_INFERENCE_ENABLED=False the worker must be able to
# start without the ML stack installed at all (see backend/requirements-ai.txt).

# Celery puts the working directory on sys.path only while it imports this module
# (celery.utils.imports.cwd_in_path) and takes it straight back off. The app.* and
# external.* imports in the tasks below run later, at task time, so backend/ has to
# stay importable; a module-level `from app.services.brain_viz_service import ...`
# used to cache `app` during that window, but it is lazy now.
#
# Inserted unconditionally: celery's temporary entry is the same string, so a
# `not in sys.path` guard skips the insert and celery then removes the only copy.
# Resolved from __file__, not cwd, so it holds wherever the worker was started.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

app = Celery("tasks", broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

def get_resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

_MODEL_WEIGHTS = {
    "neurogate": get_resource_path(os.path.join("external", "models", "neurogate_wgts.pt")),
    "neurotransformer": get_resource_path(os.path.join("external", "models", "neurotransformer_wgts.pth")),
}
_MODEL_CACHE = {}
_PIPELINE_CACHE = {}


def _get_device():
    import torch

    return torch.device("cpu")


def _get_pipeline(name):
    """Build and memoize a preprocessing pipeline on first use.

    Kept lazy so importing this module never pulls in the ML stack; mirrors the
    _MODEL_CACHE pattern in load_model below.
    """
    if name in _PIPELINE_CACHE:
        return _PIPELINE_CACHE[name]

    from external.CereProcess.datasets.pipeline import (
        get_nmt_pipeline,
        neurotransformer_pipeline,
        resample,
    )

    if name == "neurogate":
        pipeline = get_nmt_pipeline()
    elif name == "neurotransformer":
        pipeline = neurotransformer_pipeline("NMT")
    elif name == "pdr":
        pipeline = resample()
    else:
        raise ValueError(f"Pipeline {name} not recognized.")

    _PIPELINE_CACHE[name] = pipeline
    return pipeline


_CHANNEL_REGIONS = {
    "Frontal": ["FP1", "FP2", "F3", "F4", "FZ"],
    "Left Temporal": ["F7", "T3", "T5"],
    "Right Temporal": ["F8", "T4", "T6"],
    "Central": ["C3", "C4", "CZ"],
    "Parietal": ["P3", "P4", "PZ"],
    "Occipital": ["O1", "O2"],
}


def load_model(model_name):
    if model_name in _MODEL_CACHE:
        return _MODEL_CACHE[model_name]

    import torch

    if model_name == "neurogate":
        from external.models.neurogate import NeuroGate

        model = NeuroGate(21)
    elif model_name == "neurotransformer":
        from external.models.neurotransformer import Neurotransformer

        model = Neurotransformer()
    else:
        raise ValueError(f"Model {model_name} not recognized.")

    device = _get_device()
    model.to(device)
    model.load_state_dict(torch.load(_MODEL_WEIGHTS[model_name], map_location=device))
    model.eval()

    _MODEL_CACHE[model_name] = model
    return model


def _merge_events(events):
    prv_event = None
    merged_events = {"normal wave": [], "spike wave": [], "slow wave": []}
    for i, event in enumerate(events):
        event = str(event)
        if event == prv_event:
            merged_events[event][-1][1] += 2
        else:
            merged_events[event].append([i * 2, i * 2 + 2])
        prv_event = event
    return merged_events


def _compute_focus_points(raw_events, threshold=0.5, fallback_n=10):
    if not raw_events:
        return []

    n_channels = len(raw_events)
    n_windows = max(len(v) for v in raw_events.values())
    window_size = 5  # 5 x 2s = 10s aggregation window

    if n_windows < window_size:
        return []

    abnormal_counts = []
    for w in range(n_windows):
        count = 0
        for ch_events in raw_events.values():
            if w < len(ch_events) and ch_events[w] != "normal wave":
                count += 1
        abnormal_counts.append(count)

    smoothed = []
    for i in range(window_size - 1, n_windows):
        span = abnormal_counts[i - window_size + 1 : i + 1]
        smoothed.append(span)

    smoothed_pct = [sum(s) / len(s) / n_channels for s in smoothed]

    peaks = []
    for i in range(1, len(smoothed_pct) - 1):
        if smoothed_pct[i] > smoothed_pct[i - 1] and smoothed_pct[i] > smoothed_pct[i + 1]:
            if smoothed_pct[i] >= threshold:
                peaks.append((i, smoothed_pct[i]))

    merged = []
    for idx, pct in peaks:
        if merged and idx - merged[-1][0] < 2:
            if pct > merged[-1][1]:
                merged[-1] = (idx, pct)
        else:
            merged.append((idx, pct))

    focus_points = []
    for idx, pct in merged:
        center_s = round(idx * 2 + 5, 1)
        focus_points.append({
            "center_s": center_s,
            "window_start": round(center_s - 5, 1),
            "window_end": round(center_s + 5, 1),
            "abnormal_pct": round(pct * 100, 1),
        })

    if not focus_points:
        top_indices = sorted(
            range(len(smoothed_pct)),
            key=lambda i: smoothed_pct[i],
            reverse=True,
        )[:fallback_n]
        seen = set()
        for idx in top_indices:
            if smoothed_pct[idx] > 0 and idx not in seen:
                center_s = round(idx * 2 + 5, 1)
                focus_points.append({
                    "center_s": center_s,
                    "window_start": round(center_s - 5, 1),
                    "window_end": round(center_s + 5, 1),
                    "abnormal_pct": round(smoothed_pct[idx] * 100, 1),
                })
                seen.add(idx)
        focus_points.sort(key=lambda p: p["center_s"])

    return focus_points


def _process_neurogate(mne_data):
    import torch
    import torch.nn.functional as F

    ## Starting with processing and inference for neurogate
    processed_data = _get_pipeline("neurogate").apply(mne_data)
    data = processed_data.get_data()
    data = data[None, :, :]
    data = torch.from_numpy(data).float().to(_get_device())

    model = load_model("neurogate")

    with torch.no_grad():
        outputs = model(data)

    condition = "Normal"
    if outputs[0].argmax() == 0:
        condition = "Normal"
    else:
        condition = "Abnormal"
    raw_prob = (
        list(
            F.softmax(outputs)
            .cpu()
            .numpy()
            .reshape(
                -1,
            )
        )[1]
        * 100
    )

    return condition, raw_prob


def _process_neurotransformer(mne_data, threshold=0.5):
    """
    Per-channel 3-class classification (normal / spike / slow wave) in 2s windows.

    Known issue — this model is sharply sensitive to input amplitude, and the EDFs we
    receive are miscalibrated (see the note in external/edf_preprocess.py: ~0.12 uV rms,
    about 100x below real EEG). Measured on 0001377, spikes surviving the confidence gate
    against input scale:

        scale   rms       spikes @ argmax   spikes after gate   slow
        x1      0.12 uV   65                0                   39
        x10     1.2 uV    4790              665                 0
        x100    12 uV     941               121                 0
        x1000   120 uV    1006              121                 0

    So "no spike waves" here is a calibration artefact, not a clinical finding: 65 are found
    at argmax and the gate below erases every one. Raising the amplitude to a realistic scale
    changes the answer completely, and so does lowering `threshold`. Do not read this
    model's output as a verdict until the source calibration is settled.
    """
    import torch
    import torch.nn.functional as F

    from external.CereProcess.datasets.channels import NEUROTRANSFORMER_CHANNELS

    all_events = np.array(["normal wave", "spike wave", "slow wave"])

    processed_data = _get_pipeline("neurotransformer").apply(mne_data)
    data = processed_data.get_data()

    model = load_model("neurotransformer")
    # model.eval()

    result_events = {}
    raw_events = {}

    for i, ch_name in enumerate(NEUROTRANSFORMER_CHANNELS):
        ch_data = data[:, i : i + 1, :]
        ch_data = torch.from_numpy(ch_data).float().to(_get_device())
        outputs = None
        with torch.no_grad():
            logits = model(ch_data)
            probs = F.softmax(logits, dim=1)
            confidence, preds = torch.max(probs, dim=1)

        confidence = confidence.cpu().numpy()
        preds = preds.cpu().numpy()

        # Anything the model is not sure about is recorded as normal. With the amplitude
        # shortfall described above, this currently discards every spike prediction.
        preds[confidence < threshold] = 0
        outputs = preds
        events = all_events[outputs]
        merged_events = _merge_events(events)
        result_events[ch_name] = merged_events
        raw_events[ch_name] = list(all_events[outputs])

    return result_events, raw_events


def _compute_pdr(mne_data):
    from external.CereProcess.datasets.channels import NEUROTRANSFORMER_CHANNELS
    from external.pdr import PDREstimator

    o1_idx = NEUROTRANSFORMER_CHANNELS.index("O1")
    o2_idx = NEUROTRANSFORMER_CHANNELS.index("O2")
    estimator = PDREstimator(200, o1_idx, o2_idx, 0)

    processed_data = _get_pipeline("pdr").apply(mne_data)
    data = processed_data.get_data()
    pdr_res = estimator.fit(data)

    # Format PDR for the report
    if pdr_res["pdr_o1"] and pdr_res["pdr_o2"]:
        avg_pdr = (pdr_res["pdr_o1"] + pdr_res["pdr_o2"]) / 2
        pdr_text = f"{avg_pdr:.1f} Hz"
    elif pdr_res["pdr_o1"] or pdr_res["pdr_o2"]:
        val = pdr_res["pdr_o1"] or pdr_res["pdr_o2"]
        pdr_text = f"{val:.1f} Hz"
    else:
        pdr_text = "Not well-formed"

    return pdr_text


def _get_clinical_adjective(percentage, threshold):
    """
    Returns clinical quantification terms based on ACNS 2021 Guidelines.
    Reference: Hirsch LJ, et al. J Clin Neurophysiol. 2021.
    """
    if percentage < 1.0:
        return "Rare"
    elif percentage < threshold + 10.0:
        return "Occasional"  # Shifted up (was 1-10%)
    elif percentage < 50.0:
        return "Frequent"  # (15-49%)
    elif percentage < 90.0:
        return "Abundant"  # (50-89%)
    else:
        return "Continuous"  # (>= 90%)


def _get_region_report(result_events, threshold):
    region_report = {}
    for region_name, channels in _CHANNEL_REGIONS.items():
        total_windows = 0
        spike_count = 0
        slow_count = 0
        for ch in channels:
            events = result_events[ch]
            total_windows += len(events)
            spike_count += events.count("spike wave")
            slow_count += events.count("slow wave")
        # Calculate Percentages
        spike_pct = (spike_count / total_windows) * 100
        slow_pct = (slow_count / total_windows) * 100
        # Generate Clinical Descriptors
        findings = []
        if spike_pct >= threshold:  # Threshold to report it
            adj = _get_clinical_adjective(spike_pct, threshold)
            findings.append(f"{adj} epileptiform discharges")
        if slow_pct >= threshold:
            adj = _get_clinical_adjective(slow_pct, threshold)
            findings.append(f"{adj} slowing")
        if not findings:
            description = "Normal activity."
        else:
            description = ", ".join(findings) + "."
        region_report[region_name] = {
            "description": description,
            "stats": {"spike_pct": spike_pct, "slow_pct": slow_pct},
        }
    return region_report


def _latest_ollama_model(client):
    # Looked up per report, so pulling a new model takes effect without a worker restart.
    # Iterate the page rather than reading .data: Ollama returns "data": null, not [],
    # when no model is installed.
    chat_models = [m for m in client.models.list() if "embed" not in m.id]
    if not chat_models:
        raise RuntimeError("no Ollama chat model installed")
    return max(chat_models, key=lambda m: m.created).id


def _generate_report(ab_prob, region_report, pdr_text):
    prompt_content = f"""
            PATIENT STATISTICS:
            - Global Abnormality Probability: {ab_prob:.1f}% (If >50%, consider Abnormal)
            - Posterior Dominant Rhythm: {pdr_text}

            REGIONAL ANALYSIS:
            """
    for region, desc in region_report.items():
        prompt_content += f"- {region}: {desc}\n"

    system_instruction = """
            You are a clinical neurologist. Write a standard EEG report based strictly on the provided statistics.

            Format Requirements:
            1. Use exactly two sections: "FACTUAL REPORT" and "IMPRESSION". It should not have any other sections.
            2. In FACTUAL REPORT, describe the background (PDR) first, then regional findings.
            3. In IMPRESSION, state "Normal EEG" or "Abnormal EEG" followed by a summary sentence.
            4. Absolutely do not mention percentages in the final text; use clinical terms (Frequent, Occasional).
            5. Write each section as a paragraph.
            6. Do not use points.
            7. Do not describe each and every region separately.
            8. Do not assume any information on your own.
            9. Output JSON.

            EXAMPLES:

            Example 1 (Normal):
            {
                "factual_report": "Background rhythm shows alpha waveform seen around 8 Hz which is appropriate for age. Photic stimulation and HV not performed due to the state of patient. Intermittent EMG artifacts were seen. Stage II sleep was not achieved."
                "impression": "This EEG showed very mild encephalopathy and there is no element of non convulsive status. Kindly correlate with clinical picture."
            }

            Example 2 (Abnormal):
            {
                "factual_report": "Background rhythm during awake stage shows well-organized, welldeveloped, average voltage 10 hertz alpha activity in the posterior regions which is appropriate for age. It blocks with eye opening and it is bilaterally synchronous and symmetrical. Beta activity in the frontal or central areas is seen with average voltage and amplitude. Photic stimulation and hyperventilation was performed. Intermittent EMG artifacts were seen. Stage II sleep was not achieved."
                "impression": "This is an abnormal EEG with asymmetrical features there is delta wave slowing from right hemisphere. There are some faster frequencies on left side also that could be due to breach rhythm .kindly correlate clinically."
            }
            """

    from app.core.config import settings

    model = settings.OPENAI_MODEL if settings.OPENAI_API_KEY else "ollama"
    options = {}
    try:
        import openai

        if settings.OPENAI_API_KEY:
            client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        else:
            # Ollama's OpenAI-compatible endpoint ignores the key, but the client requires one.
            client = openai.OpenAI(base_url=settings.OLLAMA_BASE_URL, api_key="ollama")
            model = settings.OLLAMA_MODEL or _latest_ollama_model(client)
            # Thinking models (qwen3.5) otherwise reason until Ollama's 4096-token default
            # context runs out and return empty content. OpenAI rejects this for gpt-4o-mini.
            options["reasoning_effort"] = "none"

        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            **options,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt_content},
            ],
        )
        json_str = response.choices[0].message.content
        data = json.loads(json_str)

        # Blank, not a placeholder: report-status treats blank as a failed generation
        # and leaves the form empty, where the literal "invalid" would be stored and
        # shown to the doctor as the report text.
        factual_report = data.get("factual_report", "")
        impression = data.get("impression", "")
    except Exception as e:
        print(f"LLM report error ({model}): {e}")
        factual_report = ""
        impression = ""
    return factual_report, impression


@app.task(name="preprocess_edf")
def preprocess_edf(mne_file_path):
    from app.services.storage_service import SIGNALS_BUCKET, storage_service
    start_time = time.time()

    print("Preprocess: starting EDF conversion...")
    with storage_service.temp_local_file(SIGNALS_BUCKET, mne_file_path, suffix=".edf") as local_path:
        import tempfile

        from external.edf_preprocess import needs_preprocessing, process_edf

        processed_path = None
        if not needs_preprocessing(local_path):
            # Already in the standard 10-20 layout. The conversion below re-chunks
            # samples across channel boundaries, so running it here would scramble
            # the recording; leave file_path on the upload and infer from it.
            print("Preprocess: channels already conform to the 10-20 layout, passing through")
            inference_task = infer.delay(mne_file_path)
        else:
            tmp_processed = tempfile.NamedTemporaryFile(suffix="_processed.edf", delete=False)
            tmp_processed.close()
            try:
                process_edf(local_path, tmp_processed.name)

                base_name = os.path.splitext(os.path.basename(mne_file_path))[0]
                processed_name = f"{base_name}_processed.edf"
                processed_path = f"signals/{processed_name}"
                with open(tmp_processed.name, "rb") as pf:
                    storage_service.upload(SIGNALS_BUCKET, processed_path, pf.read())
                print(f"Preprocess: uploaded processed EDF to {processed_path}")

                inference_task = infer.delay(processed_path)
            except Exception as e:
                print(f"Preprocess: EDF conversion failed ({e}), chaining with raw file")
                processed_path = None
                inference_task = infer.delay(mne_file_path)
            finally:
                try:
                    os.unlink(tmp_processed.name)
                except OSError:
                    pass

    end_time = time.time()
    print(f"Preprocess: finished in {end_time - start_time:.1f}s, chained infer={inference_task.id}")

    return {
        "stage": "preprocessed",
        "processed_file_path": processed_path,
        "inference_task_id": inference_task.id,
    }


@app.task(name="infer", bind=True)
def infer(self, mne_file_path):
    from app.core.config import settings
    from app.services.storage_service import SIGNALS_BUCKET, storage_service
    start_time = time.time()

    if not settings.AI_INFERENCE_ENABLED:
        # Manual-entry-only deployment: validate the EDF is readable, then hand the
        # file over for manual labelling and manual report entry. No models, no LLM.
        with storage_service.temp_local_file(SIGNALS_BUCKET, mne_file_path, suffix=".edf") as local_path:
            mne_data = mne.io.read_raw_edf(local_path, preload=False, verbose=False)
            channel_count = len(mne_data.ch_names)
            duration = float(mne_data.times[-1]) if len(mne_data.times) > 0 else 0.0

        end_time = time.time()
        print(
            f"Inference: AI disabled — validated EDF only "
            f"({channel_count} channels, {duration:.1f}s) in {end_time - start_time:.1f}s"
        )

        return {
            "result": "pending_review",
            "events": {},
            "focus_points": [],
            "inference_time": end_time - start_time,
            "topomap_path": None,
            "report_task_id": None,
            "ai_enabled": False,
            "file_info": {"channels": channel_count, "duration_seconds": duration},
        }

    with storage_service.temp_local_file(SIGNALS_BUCKET, mne_file_path, suffix=".edf") as local_path:
        mne_data = mne.io.read_raw_edf(local_path, preload=True)

        # Every pipeline stage runs in place on the Raw it is handed — Preprocess.apply
        # returns self.func(data), and crop/pick/resample/filter all mutate and return the
        # same object. Sharing mne_data between stages let NeuroGate's PaddedCropData(60, 660)
        # leak: NeuroTransformer and PDR then saw a 600s, 100Hz, normalised recording whose
        # time origin had shifted by 60s. Each stage gets its own copy.
        condition, ab_prob = _process_neurogate(mne_data.copy())
        print(f"Inference: neurogate done — condition={condition}, ab_prob={ab_prob:.3f}")
        events, raw_events = _process_neurotransformer(mne_data.copy(), 0.9)
        print(f"Inference: neurotransformer done — {len(events)} channels, {sum(len(v) for v in raw_events.values())} raw events")
        focus_points = _compute_focus_points(raw_events, 0.5)
        print(f"Inference: computed {len(focus_points)} focus point(s)")
        pdr_text = _compute_pdr(mne_data.copy())
        print(f"Inference: PDR computed ({pdr_text})")
    region_report = _get_region_report(raw_events, 0)
    print(f"Inference: region report done — {len(region_report)} regions")

    # Attempt to generate a topomap image for this inference
    try:
        from app.services.brain_viz_service import generate_topomap_from_events

        base = os.path.splitext(os.path.basename(mne_file_path))[0]
        print("Inference: generating topomap...")
        out_path = generate_topomap_from_events(
            base,
            {ch: dict(events[ch]) for ch in events},
            "",
            vmax=None,
        )
        print("Inference: topomap done")
    except Exception as e:
        print(f"Warning: failed to generate topomap image: {e}")
        out_path = None

    report_task = generate_report.delay(float(ab_prob), region_report, pdr_text)
    print(f"Inference: report task queued ({report_task.id})")

    end_time = time.time()
    print(f"Inference: finished in {end_time - start_time:.1f}s")

    return {
        "result": condition,
        "events": events,
        "focus_points": focus_points,
        "inference_time": end_time - start_time,
        "topomap_path": out_path,
        "report_task_id": report_task.id,
    }


@app.task(name="generate_report")
def generate_report(ab_prob, region_report, pdr_text):
    from app.core.config import settings

    if not settings.AI_INFERENCE_ENABLED:
        # No task is queued in this mode; guard anyway so a re-queued legacy task ID
        # cannot pull openai into a worker that does not have it installed.
        return {"factual_report": "", "impression": "", "ai_enabled": False}

    factual_report, impression = _generate_report(ab_prob, region_report, pdr_text)
    return {"factual_report": factual_report, "impression": impression}
