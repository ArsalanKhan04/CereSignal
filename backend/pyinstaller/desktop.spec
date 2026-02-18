# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

datas = []
datas += collect_data_files("app")
datas.append((os.path.join(project_root, "uploads"), "uploads"))
datas.append((os.path.join(project_root, "app", "static"), "app/static"))

hiddenimports = [
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
    "app.services.inference_service",
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
