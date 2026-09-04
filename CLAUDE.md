# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CereSignal is a full-stack medical EEG analysis platform. It processes EDF files through two pre-trained PyTorch models (NeuroGate + NeuroTransformer) and generates clinical reports via a local Ollama LLM. The app runs as both a web app (Docker) and a Windows desktop app (Electron + PyInstaller).

## Development Setup

Four components must run simultaneously:

```bash
# Terminal 1 — Redis (message broker)
docker run -d --name redis_dev -p 6379:6379 redis:7-alpine

# Terminal 2 — FastAPI backend
cd backend && pyenv activate cere_env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3 — Celery worker (ML inference)
cd backend && pyenv activate cere_env
celery -A inference.infer worker -l info

# Terminal 4 — React frontend
cd frontend && npm start
```

Or use Docker Compose: `docker-compose up`

Access points: Frontend → `localhost:3000`, API → `localhost:8000`, Docs → `localhost:8000/api/v1/docs`

## Common Commands

```bash
# Backend tests
cd backend && pytest

# Frontend
cd frontend && npm test
cd frontend && npm run build          # Web production build
cd frontend && npm run build:desktop  # Electron desktop build (Windows)

# Verify Celery worker is alive
celery -A inference.infer inspect ping
```

## Architecture

### Request Flow
1. Frontend uploads EDF/CSV/JSON/TXT → `POST /api/v1/signals/upload`
2. Backend stores file to disk, parses EDF channels with MNE, saves metadata to SQLite
3. `POST /api/v1/processing/process` queues a Celery task via Redis
4. Celery worker (`backend/inference/infer.py`) runs two models in parallel:
   - **NeuroGate** — 21-channel binary classifier (Normal/Abnormal + probability)
   - **NeuroTransformer** — per-channel 3-class classifier (normal/spike/slow wave)
5. Worker computes PDR, generates topomap image, then queues an Ollama (`qwen3:8b`) task for clinical report text
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
- `AI_INFERENCE_ENABLED` — defaults to `True`. Set `False` for a manual-entry-only
  deployment (see "No-AI Mode" below)
- `DESKTOP_MODE` — set `True` to bypass auth and async queue
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
pip install -r backend/requirements.txt          # no torch, no openai
docker compose build --build-arg INSTALL_AI=false
```

The frontend discovers the mode at runtime via `GET /api/v1/config`
(`frontend/src/contexts/ConfigContext.tsx`), so one build serves both modes. Redis and the
Celery worker are still required — `preprocess_edf` runs in both modes.

## Tech Stack

- **Frontend:** React 19 + TypeScript, MUI v7, React Router v7, Plotly.js, Recharts
- **Backend:** FastAPI, SQLAlchemy + SQLite, Celery, PyJWT
- **ML:** PyTorch, MNE-Python, Ollama (`qwen3:8b`)
- **Desktop:** Electron 28, PyInstaller, electron-builder (NSIS installer)
