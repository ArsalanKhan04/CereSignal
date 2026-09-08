# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CereSignal is a full-stack medical EEG analysis platform. It processes EDF files through two
pre-trained PyTorch models (NeuroGate + NeuroTransformer) and generates clinical report text via
the OpenAI API. It is a multi-tenant SaaS deployed on Railway, with Supabase for Postgres and file
storage; local development needs no cloud account. A Windows desktop build (Electron + PyInstaller)
also exists.

## Development Setup

One-time: `./scripts/setup.sh` (creates `backend/cere_env`, installs deps, writes `backend/.env`). Idempotent.

Four components must run simultaneously, one per terminal:

```bash
./scripts/redis-start.sh         # Redis broker
./scripts/backend-start.sh       # migrates + seeds demo data, then uvicorn on :8000
./scripts/worker-start.sh        # Celery worker (preprocessing + ML inference)
npm --prefix frontend run dev    # React frontend on :3000
```

`./scripts/stop.sh` stops all three backend components. `./scripts/backend-start.sh --fresh` drops every table, clears uploaded files/plots/logs, and re-seeds (typed confirmation; `--yes` to skip).

Seeded demo login: `admin` / `password`

There is **no** `cere_env` pyenv virtualenv — the environment is `backend/cere_env/`, and the scripts call its binaries directly rather than activating anything. The backend and worker must run with `backend/` as cwd: `inference/infer.py` resolves model weights relative to the current directory and `DATABASE_URL` is cwd-relative.

`docker-compose up redis backend celery_worker` is the containerised equivalent, once `./scripts/setup.sh` has written `backend/.env`. The backend and worker services both bind-mount `./backend`, so they share the same `cere_signal.db` and `local_storage/` as the scripts above — the worker resolves the storage object paths it receives over Redis against its own filesystem, so they must. The compose `frontend` service still cannot build: `frontend/package.json` depends on `"ceresignal-desktop": "file:.."`, which resolves to `/` in that build context. Run the frontend on the host.

Access points: Frontend → `localhost:3000`, API → `localhost:8000`, Docs → `localhost:8000/api/v1/docs`

**Storage backend is chosen automatically.** `app/services/storage_service.py` uses Supabase when
`SUPABASE_URL` is set and local disk (`backend/local_storage/`, served at `/static`) when it isn't,
so no cloud account is needed for local development. The seeded `admin` / `password` account is the
normal way in; `python backend/scripts/create_admin.py` creates a real hospital and admin instead.

## Common Commands

```bash
# Frontend (from repo root)
npm --prefix frontend run dev            # dev server
npm --prefix frontend run build          # web production build
npm --prefix frontend run build:desktop  # Electron desktop build
npm --prefix frontend test

# Database (from backend/)
./cere_env/bin/python migrate.py            # create missing tables
./cere_env/bin/python migrate.py --reset    # DESTRUCTIVE: drop and recreate
./cere_env/bin/python -m scripts.seed_demo  # demo data, idempotent

# Verify Celery worker is alive (from backend/)
./cere_env/bin/celery -A inference.infer inspect ping
```

The frontend scripts set `NODE_OPTIONS=--max-old-space-size=6144`; invoking `react-scripts` directly hits Node's 2 GB default and runs out of heap.

**There are no backend tests or linters.** No `tests/` directory, no pytest/black/mypy in any requirements file. Do not suggest `pytest`, `black` or `mypy` commands for the backend until that changes.

## Architecture

### Request Flow
1. Frontend uploads EDF/CSV/JSON/TXT → `POST /api/v1/signals/upload`
2. Backend stores the file via `storage_service` (`save_uploaded_file` in
   `app/utils/file_processing.py`), parses EDF channels with MNE, and saves metadata to the database
3. The same upload handler starts inference (`signals.py` → `inference_service.start_inference`),
   queueing the `preprocess_edf` Celery task via Redis
4. `preprocess_edf` (`backend/inference/infer.py`) converts the EDF, uploads `<name>_processed.edf`
   for the viewer, then chains to the `infer` task
5. `infer` runs the two models sequentially:
   - **NeuroGate** — 21-channel binary classifier (Normal/Abnormal + probability)
   - **NeuroTransformer** — per-channel 3-class classifier (normal/spike/slow wave)
6. It then computes focus points and PDR, builds a regional report, generates a topomap image, and
   queues the `generate_report` task
7. `generate_report` calls the OpenAI Chat Completions API (`OPENAI_MODEL`, default `gpt-4o-mini`)
   to write the factual report and impression. Without `OPENAI_API_KEY` set, inference still
   completes and the report text is left blank for manual entry
8. Results are saved to the database; the frontend polls
   `GET /signals/files/{id}/inference-status` and `/report-status`, then displays the EEG
   visualization and report

Note: the `/api/v1/processing/*` router exists but the frontend does not use it — inference is
triggered by the upload endpoint, not by a separate process call.

### Known Data Issues

The sample EDFs are miscalibrated, which changes how model output should be read:

- **Physical dimension is `uM`, not `uV`.** MNE does not recognise `uM`, so it skips its own
  µV→V conversion and `raw.get_data()` returns physical units directly. `process_edf`'s
  `data * 1e-6` in `backend/external/edf_preprocess.py` is correct *because* of this — it is
  not redundant, and a genuine `uV` file would be scaled to nothing by it. Check the header
  before touching that line.
- **Amplitudes land ~100× below real EEG** (~0.12 µV rms). The cause is the source
  calibration — physical full scale ±56 against digital ±32768, with the data occupying about
  0.3% of the range — not the preprocessing; the average re-reference costs only 1.4×.
- **NeuroTransformer is sharply scale-dependent**, so this suppresses spike detection
  entirely: 65 spikes are found at argmax but none survive `preds[confidence < 0.9] = 0`.
  At ×100 the same recording yields 121. Treat "no spike waves" as a calibration artefact
  rather than a clinical finding until the calibration is resolved.

Two structural quirks in the sample files, both repaired by `process_edf`: the channel count is
mis-declared (24 in the header, 26 in reality — hence the reshape), and `signals` table rows
keep the *raw* upload's metadata, so their duration and channel names do not match the
processed EDF the viewer actually plots.

### Multi-Tenancy
- `hospitals` and `staff_invitations` tables (`app/models/hospital.py`)
- Staff are onboarded by invitation; `auth_users.hospital_id` scopes data access to one hospital
- `auth_users.is_superuser` grants cross-hospital access via the dev-admin portal
  (`app/api/v1/endpoints/dev_admin.py`, gated by the `get_current_superuser` dependency)

### Authentication
- Two separate tables: `auth_users` (credentials) and `users` (patient/contact info)
- Four roles in `UserType` (`app/models/auth.py`): `doctor`, `technician`, `patient`, `admin` —
  enforced via JWT middleware, plus the separate `is_superuser` flag above
- Tokens expire in 30 min (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Desktop mode does **not** disable auth. `DESKTOP_MODE` is currently inert (see below), so JWT
  auth is enforced in every mode

### Desktop Mode
`main.js` (Electron) spawns the PyInstaller-bundled backend subprocess via `backend/entry_point.py`.
Logs go to `AppData/Roaming`.

**Desktop mode is unimplemented** — every switch for it is currently inert:
- `DESKTOP_MODE` reaches the backend (`main.js:51`) but `backend/entry_point.py:25` assigns `IS_DESKTOP_MODE` and never reads it. Auth is not bypassed.
- `REACT_APP_DESKTOP` is never read anywhere in `frontend/src`, and it is a build-time variable, so setting it on `electron .` cannot change an already-built bundle.
- `frontend/src/pages/DesktopWorkspace.tsx` exists but is never imported or routed, so `/` renders the normal `LoginPage`.
- `main.js:67-70` skips the Celery worker in desktop mode, but there is no synchronous inference path — `app/services/inference_service.py:44` always dispatches `preprocess_edf.delay(...)`. With no worker consuming the queue, processing would never complete.
- The unpackaged path spawns `cere-engine.exe` (`main.js:33`, `:76`), so it is Windows-only regardless.

### Deployment
Railway, three services, each with its own config:

| Config | Service |
|--------|---------|
| `backend/railway.toml` | FastAPI API |
| `backend/railway.worker.toml` | Celery worker |
| `frontend/railway.toml` | React frontend |

CI runs `backend/migrate.py` via `.github/workflows/migrate.yml` (create missing tables) and
`reset-db.yml` (manual full reset).

## Key Files

| Path | Purpose |
|------|---------|
| `scripts/` | Dev workflow — `setup.sh`, `redis-start.sh`, `backend-start.sh`, `worker-start.sh`, `stop.sh` |
| `backend/migrate.py` | Table creation + superuser bootstrap (`--reset` to drop). No Alembic — this is the whole migration system |
| `backend/scripts/` | Admin/superuser creation, plus `seed_demo.py` (idempotent demo data) |
| `backend/app/main.py` | FastAPI app, router registration, CORS config |
| `backend/app/models/` | SQLAlchemy ORM models (auth, user, hospital, signal, report, notification, contact) |
| `backend/app/api/v1/endpoints/` | Route handlers (auth, users, signals, processing, reports, admin, dev_admin, notifications, logs, contact, config) |
| `backend/app/services/` | Storage (Supabase or local disk), PDF generation, brain visualization, inference dispatch |
| `backend/inference/infer.py` | Celery tasks — preprocessing, ML pipeline, LLM report |
| `backend/external/` | NeuroGate/NeuroTransformer model wrappers, EDF utilities |
| `frontend/src/pages/` | Top-level page components |
| `frontend/src/components/` | Shared UI components |
| `frontend/src/contexts/` | Auth and demo React contexts |
| `main.js` | Electron entry point |

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` (`./scripts/setup.sh` does this for you). Key variables:

- `DATABASE_URL` — Postgres in deployment; `sqlite:///./cere_signal.db` works locally
  (`app/core/database.py` applies `sslmode=require` only to Postgres URLs)
- `SECRET_KEY` — must be set for JWT signing
- `REDIS_URL` — defaults to `redis://localhost:6379/0`
- `AI_INFERENCE_ENABLED` — defaults to `True`. Set `False` for a manual-entry-only
  deployment (see "No-AI Mode" below)
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — file storage. Leave `SUPABASE_URL` empty to store
  files on local disk instead (`SUPABASE_PUBLISHABLE_KEY` is the client-side key)
- `OPENAI_API_KEY`, `OPENAI_MODEL` — LLM report generation (default `gpt-4o-mini`)
- `RESEND_API_KEY` — invitation email; `MAIL_*` variables are the SMTP fallback
- `FRONTEND_URL` — used to build invitation email links
- `DESKTOP_MODE` — read only by `entry_point.py:25` and never acted on; currently has no effect
- `MAX_FILE_SIZE` — default 100 MB
- `ALLOWED_FILE_TYPES` — `.edf,.csv,.json,.txt`

## No-AI Mode

Setting `AI_INFERENCE_ENABLED=False` runs CereSignal as a manual-entry-only platform:
NeuroGate, NeuroTransformer and the LLM report step are all skipped. Files still upload,
still go through `preprocess_edf` (channel conversion for the EEG viewer), and land in the
`pending_review` condition awaiting a manual normal/abnormal label from the existing
`PATCH /signals/files/{id}/label` flow. Reports are typed by hand.

Because `inference/infer.py` imports `torch`, `openai` and everything under `external/`
lazily, a no-AI deployment can skip the ML stack entirely:

```bash
./scripts/setup.sh --no-ai                       # base deps only, no torch/openai
docker compose build --build-arg INSTALL_AI=false
```

To run an existing install in this mode for one session, without touching `.env` — both
components need the flag, since each reads `AI_INFERENCE_ENABLED` independently:

```bash
./scripts/backend-start.sh --no-ai
./scripts/worker-start.sh --no-ai
```

`.env.example` ships `AI_INFERENCE_ENABLED` commented out, so the `True` default in
`app/core/config.py` applies; uncomment it in `backend/.env` to make the mode permanent.

The frontend discovers the mode at runtime via `GET /api/v1/config`
(`frontend/src/contexts/ConfigContext.tsx`), so one build serves both modes. Redis and the
Celery worker are still required — `preprocess_edf` runs in both modes.

## Tech Stack

- **Frontend:** React 19 + TypeScript, MUI v7, React Router v7, Plotly.js, Recharts
- **Backend:** FastAPI, SQLAlchemy (SQLite locally, Postgres/Supabase in deployment), Celery + Redis, PyJWT
- **ML:** PyTorch, MNE-Python, OpenAI API (`gpt-4o-mini`)
- **Storage:** Supabase Storage in deployment; local disk for development
- **Desktop:** Electron 28, PyInstaller, electron-builder (NSIS installer)
