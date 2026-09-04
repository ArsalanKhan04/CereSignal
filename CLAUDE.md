# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CereSignal is a full-stack medical EEG analysis platform. It processes EDF files through two
pre-trained PyTorch models (NeuroGate + NeuroTransformer) and generates clinical report text via
the OpenAI API. It is a multi-tenant SaaS deployed on Railway, with Supabase for Postgres and file
storage. A Windows desktop build (Electron + PyInstaller) also exists.

## Development Setup

Four components must run simultaneously. See `HOWTORUN.md` for the full walkthrough, including the
required `.env` setup.

```bash
# Terminal 1 — Redis (message broker)
docker run -d --name redis_dev -p 6379:6379 redis:7-alpine

# Terminal 2 — FastAPI backend
cd backend && source cere_env/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3 — Celery worker (preprocessing + ML inference)
cd backend && source cere_env/bin/activate
celery -A inference.infer worker -l info

# Terminal 4 — React frontend
cd frontend && npm start
```

Or use Docker Compose: `docker-compose up`

Access points: Frontend → `localhost:3000`, API → `localhost:8000`, Docs → `localhost:8000/api/v1/docs`

**Storage backend is chosen automatically.** `app/services/storage_service.py` uses Supabase when
`SUPABASE_URL` is set and local disk (`backend/local_storage/`, served at `/static`) when it isn't,
so no cloud account is needed for local development. Bootstrap a login with
`python backend/scripts/create_admin.py`.

## Common Commands

```bash
# Frontend
cd frontend && npm test
cd frontend && npm run build          # Web production build
cd frontend && npm run build:desktop  # Electron desktop build (Windows)

# Verify Celery worker is alive
cd backend && celery -A inference.infer inspect ping

# Database — create missing tables and ensure the dev superuser exists
cd backend && python migrate.py
cd backend && python migrate.py --reset   # drops all tables first (destroys data)
```

There is currently no backend test suite (`backend/tests/` does not exist), and no `black`/`mypy`
configuration.

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
   to write the factual report and impression
8. Results are saved to the database; the frontend polls
   `GET /signals/files/{id}/inference-status` and `/report-status`, then displays the EEG
   visualization and report

Note: the `/api/v1/processing/*` router exists but the frontend does not use it — inference is
triggered by the upload endpoint, not by a separate process call.

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

### Desktop Mode
`main.js` (Electron) spawns the PyInstaller-bundled backend subprocess via `backend/entry_point.py`.
Logs go to `AppData/Roaming`. Note that the `DESKTOP_MODE` env var is currently vestigial —
`entry_point.py` reads it into `IS_DESKTOP_MODE` but nothing consumes that value, and it does not
bypass auth.

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
| `backend/app/main.py` | FastAPI app, router registration, CORS config |
| `backend/app/models/` | SQLAlchemy ORM models (auth, user, hospital, signal, report, notification, contact) |
| `backend/app/api/v1/endpoints/` | Route handlers (auth, users, signals, processing, reports, admin, dev_admin, notifications, logs, contact, config) |
| `backend/app/services/` | Storage (Supabase or local disk), PDF generation, brain visualization, inference dispatch |
| `backend/inference/infer.py` | Celery tasks — preprocessing, ML pipeline, LLM report |
| `backend/external/` | NeuroGate/NeuroTransformer model wrappers, EDF utilities |
| `backend/migrate.py` | Table creation + superuser bootstrap (`--reset` to drop) |
| `backend/scripts/` | Admin/superuser creation, demo seeding |
| `frontend/src/pages/` | Top-level page components |
| `frontend/src/components/` | Shared UI components |
| `frontend/src/contexts/` | Auth and demo React contexts |
| `main.js` | Electron entry point |

## Environment Configuration

Copy `backend/.env.example` to `backend/.env`. Key variables:

- `DATABASE_URL` — Postgres in deployment; `sqlite:///./cere_signal.db` works locally
  (`app/core/database.py` applies `sslmode=require` only to Postgres URLs)
- `SECRET_KEY` — must be set for JWT signing
- `REDIS_URL` — defaults to `redis://localhost:6379/0`
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — file storage. Leave `SUPABASE_URL` empty to store
  files on local disk instead (`SUPABASE_PUBLISHABLE_KEY` is the client-side key)
- `OPENAI_API_KEY`, `OPENAI_MODEL` — LLM report generation (default `gpt-4o-mini`)
- `RESEND_API_KEY` — invitation email; `MAIL_*` variables are the SMTP fallback
- `FRONTEND_URL` — used to build invitation email links
- `MAX_FILE_SIZE` — default 100 MB
- `ALLOWED_FILE_TYPES` — `.edf,.csv,.json,.txt`

## Tech Stack

- **Frontend:** React 19 + TypeScript, MUI v7, React Router v7, Plotly.js, Recharts
- **Backend:** FastAPI, SQLAlchemy + Postgres (Supabase), Celery + Redis, PyJWT
- **ML:** PyTorch, MNE-Python, OpenAI API (`gpt-4o-mini`)
- **Storage:** Supabase Storage in deployment; local disk for development
- **Desktop:** Electron 28, PyInstaller, electron-builder (NSIS installer)
