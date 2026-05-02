import json
import logging
import os
import re
import time

import mne
import numpy as np
import openai
import torch
import torch.nn.functional as F
from app.services.brain_viz_service import generate_topomap_from_events
from celery import Celery
from external.CereProcess.datasets.channels import NEUROTRANSFORMER_CHANNELS
from external.CereProcess.datasets.pipeline import (
    get_nmt_pipeline,
    neurotransformer_pipeline,
    resample,
)
import sys
from external.models.neurogate import NeuroGate
from external.models.neurotransformer import Neurotransformer
from external.pdr import PDREstimator

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
_DEVICE = torch.device("cpu")
_PIPELINES = {
    "neurogate": get_nmt_pipeline(),
    "neurotransformer": neurotransformer_pipeline("NMT"),
    "pdr": resample(),
}
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

    if model_name == "neurogate":
        model = NeuroGate(21)
    elif model_name == "neurotransformer":
        model = Neurotransformer()
    else:
        raise ValueError(f"Model {model_name} not recognized.")

    model.to(_DEVICE)
    model.load_state_dict(torch.load(_MODEL_WEIGHTS[model_name], map_location=_DEVICE))
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
    ## Starting with processing and inference for neurogate
    processed_data = _PIPELINES["neurogate"].apply(mne_data)
    data = processed_data.get_data()
    data = data[None, :, :]
    data = torch.from_numpy(data).float().to(_DEVICE)

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
    all_events = np.array(["normal wave", "spike wave", "slow wave"])

    processed_data = _PIPELINES["neurotransformer"].apply(mne_data)
    data = processed_data.get_data()

    model = load_model("neurotransformer")
    # model.eval()

    result_events = {}
    raw_events = {}

    for i, ch_name in enumerate(NEUROTRANSFORMER_CHANNELS):
        ch_data = data[:, i : i + 1, :]
        ch_data = torch.from_numpy(ch_data).float().to(_DEVICE)
        outputs = None
        with torch.no_grad():
            logits = model(ch_data)
            probs = F.softmax(logits, dim=1)
            confidence, preds = torch.max(probs, dim=1)

        confidence = confidence.cpu().numpy()
        preds = preds.cpu().numpy()

        preds[confidence < threshold] = 0
        outputs = preds
        events = all_events[outputs]
        merged_events = _merge_events(events)
        result_events[ch_name] = merged_events
        raw_events[ch_name] = list(all_events[outputs])

    return result_events, raw_events


def _compute_pdr(mne_data):
    o1_idx = NEUROTRANSFORMER_CHANNELS.index("O1")
    o2_idx = NEUROTRANSFORMER_CHANNELS.index("O2")
    estimator = PDREstimator(200, o1_idx, o2_idx, 0)

    processed_data = _PIPELINES["pdr"].apply(mne_data)
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
            spike_count += events.count("spike and sharp wave")
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

    try:
        client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
        response = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt_content},
            ],
        )
        json_str = response.choices[0].message.content
        data = json.loads(json_str)

        factual_report = data.get("factual_report", "invalid")
        impression = data.get("impression", "invalid")
    except Exception as e:
        print(f"OpenAI Error: {e}")
        factual_report = ""
        impression = ""
    return factual_report, impression


@app.task(name="infer", bind=True)
def infer(self, mne_file_path):
    from app.services.storage_service import storage_service, SIGNALS_BUCKET
    start_time = time.time()

    with storage_service.temp_local_file(SIGNALS_BUCKET, mne_file_path, suffix=".edf") as local_path:
        mne_data = mne.io.read_raw_edf(local_path, preload=True)

        condition, ab_prob = _process_neurogate(mne_data)
        events, raw_events = _process_neurotransformer(mne_data, 0.9)
        logger = logging.getLogger(__name__)
        focus_points = _compute_focus_points(raw_events, 0.5)
        logger.info(f"Computed {len(focus_points)} focus point(s)")
        pdr_text = _compute_pdr(mne_data)
    region_report = _get_region_report(raw_events, 0)
    # factual_report, impression = _generate_report(ab_prob, region_report, pdr_text)

    # Attempt to generate a topomap image for this inference
    try:
        base = os.path.splitext(os.path.basename(mne_file_path))[0]
        out_path = generate_topomap_from_events(
            base,
            {ch: {k: v for k, v in events[ch].items()} for ch in events},
            "",
            vmax=None,
        )
    except Exception as e:
        print(f"Warning: failed to generate topomap image: {e}")
        out_path = None

    report_task = generate_report.delay(float(ab_prob), region_report, pdr_text)
    ## Now doing processing steps for neurotransformer

    end_time = time.time()

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
    factual_report, impression = _generate_report(ab_prob, region_report, pdr_text)
    return {"factual_report": factual_report, "impression": impression}
