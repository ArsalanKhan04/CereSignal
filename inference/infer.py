import time
import os
from celery import Celery
import torch
import numpy as np
import mne

from external.CereProcess.datasets.pipeline import general_pipeline
from external.models.neurogate import NeuroGate
from external.models.neurotransformer import Neurotransformer

CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'

app = Celery('tasks', broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

_MODEL_WEIGHTS = {'neurogate': 'external/models/neurogate_wgts.pt',
              'neurotransformer': 'external/models/neurotransformer_wgts.pth'}
_MODEL_CACHE = {}
_DEVICE = torch.device("cpu")
_PIPELINE = general_pipeline('NMT')

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

@app.task(name='infer', bind=True)
def infer(self, mne_file_path):
    start_time = time.time()
    if not os.path.exists(mne_file_path):
        raise FileNotFoundError(f"File {mne_file_path} does not exist.")
    mne_data = mne.io.read_raw_edf(mne_file_path, preload=True)
    processed_data = _PIPELINE.apply(mne_data)
    data = processed_data.get_data()
    data = data[None, :, :]  # Use first 32 channels
    data = torch.from_numpy(data).float().to(_DEVICE)

    model = load_model('neurogate')
    model.eval()

    with torch.no_grad():
        outputs = model(data)

    if (outputs[0].argmax() == 0):
        result = 'Normal'
    else:
        result = 'Abnormal'

    end_time = time.time()

    return {'result': result, 'inference_time': end_time - start_time}

@app.task(name='event_infer', bind=True)
def event_infer(self, mne_file_path):
    start_time = time.time()
    if not os.path.exists(mne_file_path):
        raise FileNotFoundError(f"File {mne_file_path} does not exist.")
    mne_data = mne.io.read_raw_edf(mne_file_path, preload=True)
    processed_data = _PIPELINE.apply(mne_data)
    data = processed_data.get_data()
    data = data[None, :, :]
    data = torch.from_numpy(data).float().to(_DEVICE)

    model = load_model('neurotransformer')
    model.eval()

    with torch.no_grad():
        outputs = model(data)

