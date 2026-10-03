# Desktop Build (Windows)

This guide covers building the CereSignal desktop app for Windows: a PyInstaller-bundled
backend (`cere-engine.exe`) and the React frontend, packaged by electron-builder into an
NSIS installer.

The desktop build runs **the full AI pipeline offline**, and is kept small in three ways:

- **No torch.** NeuroGate and NeuroTransformer run as ONNX exports
  (`backend/external/models/*.onnx`) with onnxruntime, about 30 MB against 400+ MB for torch.
- **No numba.** NeuroTransformer's resampler is a numpy port of resampy's
  (`_kaiser_resample.py`), so numba and llvmlite (about 100 MB) stay out.
- **A bundled local LLM.** Report text comes from llama.cpp's `llama-server` (CPU build,
  40 MB) with a Q4 GGUF model, instead of Ollama. The model is most of the installer.

It needs no Redis and no worker: with `DESKTOP_MODE=true`, Celery tasks run eagerly on a
background thread in the backend process and keep their results in memory
(`DESKTOP_CELERY_CONFIG` in `backend/inference/infer.py`). `main.js` starts `llama-server`
on a free loopback port with a per-launch API key and points the backend at it.

## Prerequisites

- Windows 10/11
- Python 3.14
- Node.js 26 (see `.nvmrc`) and npm 12 — recommended rather than required. The build also
  works on Node 22 / npm 10, but npm 10 rewrites `frontend/package-lock.json`; discard those
  changes rather than committing them (`git checkout -- frontend/package-lock.json`).
- PowerShell. `build:desktop` runs `backend/build-desktop.ps1` with `-ExecutionPolicy Bypass`,
  so the machine's execution policy does not matter.
- Visual Studio Build Tools (C++ workload) — only if `pip install` fails with a compiler
  error, i.e. a dependency has no prebuilt wheel for your Python version.

## Setup

From the repo root, in PowerShell:

1. Create the backend virtualenv and activate it:
   ```powershell
   py -3.14 -m venv backend\cere_env
   backend\cere_env\Scripts\Activate.ps1
   ```
   Keep it active for the build. `build-desktop.ps1` calls whichever `pip` and `pyinstaller`
   are first on `PATH`, and installs `requirements-desktop.txt` (which includes PyInstaller)
   into it itself — do **not** install `requirements.txt` here: it carries web-only and
   notebook dependencies the desktop build does not need.
   `py -3.14` rather than `python` avoids picking up some other Python on `PATH`.

2. Install the Node dependencies:
   ```powershell
   npm install
   cd frontend
   npm install
   cd ..
   ```
   Run the frontend install from inside `frontend`. `npm --prefix frontend install` on
   npm 10 adds the root package to `frontend/package.json` as a
   `"ceresignal-desktop": "file:.."` dependency.

## Build

From the repo root, with the virtualenv active:

```powershell
npm run build:desktop
```

This runs three steps, stopping at the first failure:

1. `backend/build-desktop.ps1` — installs `requirements-desktop.txt`, then PyInstaller builds
   `backend/pyinstaller/desktop.spec` into `backend/dist/cere-engine/`. It fails if torch,
   numba, llvmlite or sympy ended up in the bundle, or if the ONNX models are missing. Then it
   runs `backend/fetch-desktop-llm.ps1`, which downloads the pinned `llama-server` build and
   model, checks each against a hard-coded SHA-256, and stages them in `desktop-llm/`. The
   first build downloads about 1.3 GB. Later builds reuse `desktop-llm-cache/` and skip it.
2. `npm --prefix frontend run build` — builds `frontend/build/`
3. electron-builder — packages both into the installer

## Output

```text
dist/CereSignal Setup 1.0.0.exe     # the installer
dist/win-unpacked/                  # the same app, unpacked, for testing without installing
```

The backend lands in `resources/backend/` inside the app, and the LLM in `resources/llm/`.

Sizes, as measured on the first build with AI:

| Part | Size |
|------|------|
| `resources/backend/` (PyInstaller, including onnxruntime and the ONNX models) | 265 MB |
| `resources/llm/` (`llama-server` 40 MB + Qwen2.5-1.5B Q4_K_M 1,065 MB) | 1,105 MB |
| Installed app (`dist/win-unpacked/`) | 1.8 GB |
| Installer (`CereSignal Setup 1.0.0.exe`) | 1.33 GB |

The GGUF barely compresses, so the model sets the installer size. Swapping it for a smaller
one is the only lever left that matters.

To try the app without packaging, once step 1 has produced `backend/dist/cere-engine/`, run
`npm run start:desktop`. Stop any dev backend on `:8000` first — Electron attaches to
whatever already holds the port.

The installer is not code-signed and uses the default Electron icon, so SmartScreen will
warn whoever runs it.

## Troubleshooting

**Checking the backend on its own.** Most packaging failures are a module PyInstaller left
out, and they show up as a crash at startup. Run the bundled backend the way `main.js` does:

```powershell
$env:DESKTOP_MODE = 'true'
$env:CERE_DATA_DIR = "$env:TEMP\cere-test"
$env:DESKTOP_SESSION_SECRET = 'test'
backend\dist\cere-engine\cere-engine.exe
```

`http://127.0.0.1:8000/api/v1/config` should return `{"ai_inference_enabled":true}`. A
`ModuleNotFoundError` means the module needs adding to `hiddenimports` in `desktop.spec` —
or, if it is only needed outside desktop mode, importing lazily.

**`ModuleNotFoundError` for a web-only dependency** (e.g. `supabase`): the desktop build
deliberately omits them. Import such a module inside the function that uses it, not at the
top of a file the backend loads at startup.

**Reports come back blank.** Recordings are analysed but the report form shows a failed
generation. Check `%APPDATA%\CereSignal\logs\llama-server.log`, and look for `Local LLM` entries in
`cere-signal.log` next to it. Missing `desktop-llm/` at build time, which means the fetch step
did not run, gives an installer without an LLM. To check the LLM on its own:

```powershell
$env:LLAMA_API_KEY = 'test'
desktop-llm\llama-server.exe -m desktop-llm\model.gguf --port 8081 --alias ceresignal-llm --no-webui --reasoning off
# in another shell:
curl.exe -H "Authorization: Bearer test" http://127.0.0.1:8081/v1/models
```

**Changing the model or the llama.cpp build.** Update the URL and SHA-256 pins at the top of
`backend/fetch-desktop-llm.ps1` together. The model must be an instruct model that llama-server
can run with `--reasoning off`, because the backend asks for a JSON response and a thinking
preamble breaks it.

**Changing the NeuroGate/NeuroTransformer weights.** Regenerate the ONNX files with
`python -m scripts.export_onnx` from `backend/`, in a separate environment with
`requirements-export.txt`, which is the only place torch is needed. The script checks the
export against torch and exits non-zero if they disagree.

**Python not found / the Microsoft Store opens.** `python` is resolving to the Windows
Store alias or to a `PATH` entry for a Python that no longer exists. Use `py -3.14`, or
remove the stale `PATH` entries.
