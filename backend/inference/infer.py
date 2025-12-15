import time
import os
from celery import Celery
import torch
import numpy as np
import mne

from external.CereProcess.datasets.pipeline import general_pipeline, neurotransformer_pipeline
from external.CereProcess.datasets.channels import NEUROTRANSFORMER_CHANNELS
from external.models.neurogate import NeuroGate
from external.models.neurotransformer import Neurotransformer
from app.services.brain_viz_service import generate_topomap_from_events

CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'

app = Celery('tasks', broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

_MODEL_WEIGHTS = {'neurogate': 'external/models/neurogate_wgts.pt',
              'neurotransformer': 'external/models/neurotransformer_wgts.pth'}
_MODEL_CACHE = {}
_DEVICE = torch.device("cpu")
_PIPELINES = {'neurogate': general_pipeline('NMT'),
              'neurotransformer': neurotransformer_pipeline('NMT')}

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
    return condition

def _process_neurotransformer(mne_data):
    all_events = np.array(["normal wave", "spike wave", "slow wave"])

    processed_data = _PIPELINES['neurotransformer'].apply(mne_data)
    data = processed_data.get_data()

    model = load_model('neurotransformer')
    # model.eval()

    result_events = {}

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

    return result_events






@app.task(name='infer', bind=True)
def infer(self, mne_file_path):
    start_time = time.time()
    if not os.path.exists(mne_file_path):
        raise FileNotFoundError(f"File {mne_file_path} does not exist.")
    mne_data = mne.io.read_raw_edf(mne_file_path, preload=True)

    condition = _process_neurogate(mne_data)
    events = _process_neurotransformer(mne_data)

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

    return {'result': condition, 'events': events, 'inference_time': end_time - start_time, 'topomap_path': out_path}

