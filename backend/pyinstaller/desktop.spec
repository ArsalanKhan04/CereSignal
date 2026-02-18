# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

project_root = os.path.abspath(os.path.join(SPECPATH, ".."))

datas = []
# This forces PyInstaller to grab the missing .pyi files for mne
datas += collect_data_files('mne')
datas += collect_data_files('celery') # Added just in case Celery needs data files too

datas += collect_data_files("app")
datas.append((os.path.join(project_root, "app", "static"), "app/static"))

hiddenimports = [
    # --- Core App ---
    "app",
    "app.main",
    "app.api",
    "app.api.v1",
    "app.api.v1.api",
    "app.core",
    "app.core.config",
    "app.core.database",
    "app.core.middleware",
    "app.models",
    "app.schemas",
    "app.services",
    "external.edf_preprocess",
    "passlib.handlers.bcrypt",

    # --- CELERY ---
    "celery",
    "celery.fixups",
    "celery.fixups.django", 
    "celery.loaders.app",
    "celery.worker.components",
    "celery.concurrency.prefork",
    "celery.app.amqp",
    "celery.app.control",
    "celery.app.events",
    "celery.app.log",
    "celery.app.routes",
    "celery.app.task",
    "celery.app.trace",
    
    # --- MNE CORE & UTILS ---
    "mne",
    "mne.utils",
    "mne.utils._logging",
    "mne.utils.dataframe",
    "mne.utils.check",
    "mne.utils.config",
    "mne.utils.linalg",
    "mne.utils.numerics",
    "mne.utils.docs", 
    "mne.utils.misc",
    "mne.fixes",
    "mne.utils.progressbar",
    "mne.viz",
    "mne.viz.utils",
    "mne.utils._testing",
    "mne.utils.fetching",
    "mne.utils.mixin",       
    "mne.utils.deprecated", 
    "mne.utils.doc",         
    
    # --- MNE IO INTERNALS ---
    "mne.io",
    "mne.io.fiff",        
    "mne.io.fiff.raw",
    "mne.io.array",
    "mne.io.meas_info",
    "mne.io.proj",
    "mne.io.tag",
    "mne.io.tree",
    "mne.io.write",
    "mne.io.pick",
    "mne.io.constants",
    "mne.io.open",
    
    # --- MNE EXTRAS ---
    "mne.html_templates",
    "mne.html_templates._templates",
    "mne.defaults",
    "mne.event",
    "mne.epochs",
    "mne.rank",
    "mne.filter",
    "mne.preprocessing",
]

excluded_modules = [
    "torch",
    "torchvision",
    "torchaudio",
    "triton",
    "nvidia",
    "ollama",
    "external.CereProcess",
    "external.models.neurogate",
    "external.models.neurotransformer",
    "inference",
]

a = Analysis(
    [os.path.join(project_root, "entry_point.py")],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excluded_modules,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="cere-engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="cere-engine",
)