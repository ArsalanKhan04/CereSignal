# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CereSignal is a full-stack medical EEG analysis platform. It processes EDF files through two pre-trained PyTorch models (NeuroGate + NeuroTransformer) and drafts clinical reports with the OpenAI API. The app runs as both a web app (Docker) and a Windows desktop app (Electron + PyInstaller).

## Development Setup

One-time: `./scripts/setup.sh` (creates `backend/cere_env`, installs deps, writes `backend/.env`). Idempotent.

Four components must run simultaneously, one per terminal:

```bash
./scripts/start-redis.sh         # Redis broker
./scripts/start-backend.sh       # migrates + seeds demo data, then uvicorn on :8000
./scripts/start-worker.sh        # Celery worker (ML inference)
npm --prefix frontend run dev    # React frontend on :3000
```

`./scripts/stop.sh` stops all three backend components. `./scripts/start-backend.sh --fresh` drops every table, clears uploaded files/plots/logs, and re-seeds (typed confirmation; `--yes` to skip).

Seeded demo login: `admin_nl` / `Demo@2025!`

There is **no** `cere_env` pyenv virtualenv — the environment is `backend/cere_env/`, and the scripts call its binaries directly rather than activating anything. The backend and worker must run with `backend/` as cwd: `inference/infer.py` resolves model weights relative to the current directory and `DATABASE_URL` is cwd-relative.

Docker Compose (`docker-compose up`) is currently broken — the `frontend` service's build context points at a nonexistent `./frontend-r`.

Access points: Frontend → `localhost:3000`, API → `localhost:8000`, Docs → `localhost:8000/api/v1/docs`

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
2. Backend stores file to disk, parses EDF channels with MNE, saves metadata to SQLite
3. `POST /api/v1/processing/process` queues a Celery task via Redis
4. Celery worker (`backend/inference/infer.py`) runs two models in parallel:
   - **NeuroGate** — 21-channel binary classifier (Normal/Abnormal + probability)
   - **NeuroTransformer** — per-channel 3-class classifier (normal/spike/slow wave)
5. Worker computes PDR, generates topomap image, then queues an OpenAI task (`OPENAI_MODEL`, default `gpt-4o-mini`) for clinical report text. Without `OPENAI_API_KEY` set, inference still completes and the report text is left blank.
6. Results saved to SQLite; frontend polls and displays EEG visualization + report

### Authentication
- Two separate tables: `auth_users` (credentials) and `users` (patient/contact info)
- Three roles: `doctor`, `technician`, `patient` — enforced via JWT middleware
- Tokens expire in 30 min (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Desktop mode (`DESKTOP_MODE=True`) disables auth entirely

### Desktop Mode
`main.js` (Electron) spawns the PyInstaller-bundled backend subprocess. No Redis/Celery — inference runs synchronously in-process. Logs go to `AppData/Roaming`.

## Key Files

| Path | Purpose |
|------|---------|
| `scripts/` | Dev workflow — `setup.sh`, `start-redis.sh`, `start-backend.sh`, `start-worker.sh`, `stop.sh` |
| `backend/migrate.py` | Schema creation and `--reset`. No Alembic — this is the whole migration system |
| `backend/scripts/seed_demo.py` | Demo/test data seeder, idempotent |
| `backend/app/main.py` | FastAPI app, router registration, CORS config |
| `backend/app/models/` | SQLAlchemy ORM models |
| `backend/app/routers/` | Route handlers (auth, users, signals, processing, reports) |
| `backend/inference/infer.py` | Celery tasks — full ML pipeline |
| `backend/external/` | NeuroGate/NeuroTransformer model wrappers, EDF utilities |
| `frontend/src/pages/` | Top-level page components |
| `frontend/src/components/` | Shared UI components |
| `main.js` | Electron entry point |

## Environment Configuration

Copy `.env.example` to `.env` in `backend/`. Key variables:
- `DATABASE_URL` — defaults to `sqlite:///./cere_signal.db`
- `SECRET_KEY` — must be set for JWT signing
- `REDIS_URL` — defaults to `redis://localhost:6379`
- `DESKTOP_MODE` — set `True` to bypass auth and async queue
- `MAX_FILE_SIZE` — default 100 MB
- `ALLOWED_FILE_TYPES` — `.edf,.csv,.json,.txt`

## Tech Stack

- **Frontend:** React 19 + TypeScript, MUI v7, React Router v7, Plotly.js, Recharts
- **Backend:** FastAPI, SQLAlchemy + SQLite, Celery, PyJWT
- **ML:** PyTorch, MNE-Python, OpenAI API (`gpt-4o-mini` by default)
- **Desktop:** Electron 28, PyInstaller, electron-builder (NSIS installer)
