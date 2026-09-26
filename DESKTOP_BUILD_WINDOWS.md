# Desktop Build (Windows)

This guide covers building the CereSignal desktop app for Windows: a PyInstaller-bundled
backend (`cere-engine.exe`) and the React frontend, packaged by electron-builder into an
NSIS installer.

The desktop build ships **without AI**. `requirements-desktop.txt` has no torch or openai,
and `entry_point.py` sets `AI_INFERENCE_ENABLED=false`, so recordings are converted for the
viewer and then wait for a manual normal/abnormal label. It also needs no Redis and no
worker: with `DESKTOP_MODE=true`, Celery tasks run eagerly inside the backend process and
keep their results in memory (`DESKTOP_CELERY_CONFIG` in `backend/inference/infer.py`).

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
   into it itself — do **not** install `requirements.txt` here, since it pulls in torch.
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
   `backend/pyinstaller/desktop.spec` into `backend/dist/cere-engine/`
2. `npm --prefix frontend run build` — builds `frontend/build/`
3. electron-builder — packages both into the installer

## Output

```text
dist/CereSignal Setup 1.0.0.exe     # the installer
dist/win-unpacked/                  # the same app, unpacked, for testing without installing
```

The backend lands in `resources/backend/` inside the app.

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

`http://127.0.0.1:8000/api/v1/config` should return `{"ai_inference_enabled":false}`. A
`ModuleNotFoundError` means the module needs adding to `hiddenimports` in `desktop.spec` —
or, if it is only needed outside desktop mode, importing lazily.

**`ModuleNotFoundError` for a web-only dependency** (e.g. `supabase`): the desktop build
deliberately omits them. Import such a module inside the function that uses it, not at the
top of a file the backend loads at startup.

**Python not found / the Microsoft Store opens.** `python` is resolving to the Windows
Store alias or to a `PATH` entry for a Python that no longer exists. Use `py -3.14`, or
remove the stale `PATH` entries.
