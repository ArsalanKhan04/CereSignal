import time
import os
from celery import Celery
import torch
import torch.nn.functional as F
import numpy as np
import mne
import re
import json
import ollama

from external.CereProcess.datasets.pipeline import general_pipeline, neurotransformer_pipeline, resample
from external.CereProcess.datasets.channels import NEUROTRANSFORMER_CHANNELS
from external.models.neurogate import NeuroGate
from external.models.neurotransformer import Neurotransformer
from external.pdr import PDREstimator
from app.services.brain_viz_service import generate_topomap_from_events

CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'

app = Celery('tasks', broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

_MODEL_WEIGHTS = {'neurogate': 'external/models/neurogate_wgts.pt',
              'neurotransformer': 'external/models/neurotransformer_wgts.pth'}
_MODEL_CACHE = {}
_DEVICE = torch.device("cpu")
_PIPELINES = {'neurogate': general_pipeline('NMT'),
              'neurotransformer': neurotransformer_pipeline('NMT'),
              'pdr': resample()}
_CHANNEL_REGIONS = {
    "Frontal": ["FP1", "FP2", "F3", "F4", "FZ"],
    "Left Temporal": ["F7", "T3", "T5"],
    "Right Temporal": ["F8", "T4", "T6"],
    "Central": ["C3", "C4", "CZ"],
    "Parietal": ["P3", "P4", "PZ"],
    "Occipital": ["O1", "O2"]
}

def load_model(model_name):
    if model_name in _MODEL_CACHE:
        return _MODEL_CACHE[model_name]

    if model_name == 'neurogate':
        model = NeuroGate()
    elif model_name == 'neurotransformer':
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
    merged_events = {'normal wave':[],
                     'spike wave':[],
                     'slow wave':[]}
    for i, event in enumerate(events):
        event = str(event)
        if event == prv_event:
            merged_events[event][-1][1] += 2
        else:
            merged_events[event].append([i*2, i*2+2])
        prv_event = event
    return merged_events

def _process_neurogate(mne_data):
    ## Starting with processing and inference for neurogate
    processed_data = _PIPELINES['neurogate'].apply(mne_data)
    data = processed_data.get_data()
    data = data[None, :, :]
    data = torch.from_numpy(data).float().to(_DEVICE)

    model = load_model('neurogate')

    with torch.no_grad():
        outputs = model(data)

    condition="Normal"
    if (outputs[0].argmax() == 0):
        condition = 'Normal'
    else:
        condition = 'Abnormal'
    raw_prob = list(F.softmax(outputs).cpu().numpy().reshape(-1,))[1] * 100

    return condition, raw_prob

def _process_neurotransformer(mne_data):
    all_events = np.array(["normal wave", "spike wave", "slow wave"])

    processed_data = _PIPELINES['neurotransformer'].apply(mne_data)
    data = processed_data.get_data()

    model = load_model('neurotransformer')
    # model.eval()

    result_events = {}
    raw_events = {}

    for i, ch_name in enumerate(NEUROTRANSFORMER_CHANNELS):
        ch_data = data[:, i:i+1, :]
        ch_data = torch.from_numpy(ch_data).float().to(_DEVICE)
        outputs=None
        with torch.no_grad():
            outputs = model(ch_data)
        outputs = outputs.cpu().numpy()
        outputs = outputs.argmax(axis=1)
        events = all_events[outputs]
        merged_events = _merge_events(events)
        result_events[ch_name] = merged_events
        raw_events[ch_name] = list(all_events[outputs])

    return result_events, raw_events

def _compute_pdr(mne_data):
    o1_idx = NEUROTRANSFORMER_CHANNELS.index('O1')
    o2_idx = NEUROTRANSFORMER_CHANNELS.index('O2')
    estimator = PDREstimator(200, o1_idx, o2_idx, 0)

    processed_data = _PIPELINES['pdr'].apply(mne_data)
    data = processed_data.get_data()
    pdr_res = estimator.fit(data)

    # Format PDR for the report
    if pdr_res['pdr_o1'] and pdr_res['pdr_o2']:
        avg_pdr = (pdr_res['pdr_o1'] + pdr_res['pdr_o2']) / 2
        pdr_text = f"{avg_pdr:.1f} Hz"
    elif pdr_res['pdr_o1'] or pdr_res['pdr_o2']:
        val = pdr_res['pdr_o1'] or pdr_res['pdr_o2']
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
        return "Frequent"    # (15-49%)
    elif percentage < 90.0:
        return "Abundant"    # (50-89%)
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
        if spike_pct >= threshold: # Threshold to report it
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
            "stats": {
                "spike_pct": spike_pct,
                "slow_pct": slow_pct
            }
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

            EXAMPLES:
            Normal Report:
            FACTUAL REPORT: Background rhythm shows alpha waveform seen around 8 Hz which is appropriate for age. Photic stimulation and HV not performed due to the state of patient. Intermittent EMG artifacts were seen. Stage II sleep was not achieved.

            IMPRESSION: This EEG showed very mild encephalopathy and there is no element of non convulsive status. Kindly correlate with clinical picture.

            Abnormal Report:
            FACTUAL REPORT: Background rhythm during awake stage shows well-organized, welldeveloped, average voltage 10 hertz alpha activity in the posterior regions which is appropriate for age. It blocks with eye opening and it is bilaterally synchronous and symmetrical. Beta activity in the frontal or central areas is seen with average voltage and amplitude. Photic stimulation and hyperventilation was performed. Intermittent EMG artifacts were seen. Stage II sleep was not achieved.

            IMPRESSION: This is an abnormal EEG with asymmetrical features there is delta wave slowing from right hemisphere. There are some faster frequencies on left side also that could be due to breach rhythm .kindly correlate clinically
            """

    try:
        response = ollama.chat(model="qwen3:8b", format="json", messages=[
                    {'role': 'system', 'content': system_instruction},
                    {'role': 'user', 'content': prompt_content},
                ])
        json_str = response['message']['content']
        data = json.loads(json_str)

        factual_report = data.get('factual_report', "")
        impression = data.get('impression', "")
    except Exception as e:
        print(f"Ollama Error: {e}")
        factual_report = ""
        impression = ""
    return factual_report, impression




@app.task(name='infer', bind=True)
def infer(self, mne_file_path):
    start_time = time.time()
    if not os.path.exists(mne_file_path):
        raise FileNotFoundError(f"File {mne_file_path} does not exist.")
    mne_data = mne.io.read_raw_edf(mne_file_path, preload=True)

    condition, ab_prob = _process_neurogate(mne_data)
    events, raw_events = _process_neurotransformer(mne_data)
    pdr_text = _compute_pdr(mne_data)
    region_report = _get_region_report(raw_events, 25)
    factual_report, impression = _generate_report(ab_prob, region_report, pdr_text)

    # Attempt to generate a topomap image for this inference
    try:
        base = os.path.splitext(os.path.basename(mne_file_path))[0]
        title = f"Model Prediction\n({base})"
        out_path = generate_topomap_from_events(base, {ch: {k: v for k, v in events[ch].items()} for ch in events}, title, vmax=None)
        # include path in result for later DB update if needed
    except Exception as e:
        print(f"Warning: failed to generate topomap image: {e}")
        out_path = None

    ## Now doing processing steps for neurotransformer

    end_time = time.time()

    print(factual_report)
    print(impression)
    return {'result': condition, 'events': events, 'factual_report':factual_report, 'impression': impression, 'inference_time': end_time - start_time, 'topomap_path': out_path}

