# How to Run CereSignal in Development Mode

CereSignal runs as **4 components**:

| Component | Purpose | Port |
|-----------|---------|------|
| Redis | Message broker for Celery tasks | 6379 |
| FastAPI Backend | REST API server | 8000 |
| Celery Worker | EDF preprocessing + ML inference | N/A |
| React Frontend | Web UI | 3000 |

## Prerequisites

- Python 3.14
- Node.js 26 (see `.nvmrc`) and npm 12
- Docker (for Redis) — or a local `redis-server` on 6379
- No cloud account required

On Windows, see [Windows](#windows) instead: it needs neither Docker nor Redis.

## First-time setup

```bash
./scripts/setup.sh
```

Creates the `backend/cere_env` virtualenv, installs backend and frontend
dependencies, creates `backend/.env` from the example, and generates a random
`SECRET_KEY`. It is safe to re-run — every step is skipped if already done.

The defaults it writes need no cloud account: `DATABASE_URL` is
`sqlite:///./cere_signal.db`, and with `SUPABASE_URL` unset the backend stores
uploads on disk under `backend/local_storage/`. Nothing there is public:
bookmark images are served from `/static/eeg-assets/` only with a signed,
expiring URL, and everything else goes through authenticated API routes.
Set `SUPABASE_URL` + `SUPABASE_SECRET_KEY` and it switches to Supabase Storage
automatically — that is how the deployed app runs. `OPENAI_API_KEY` is optional
too; without it a local Ollama model drafts the report text, and with neither the
text is left blank for manual entry.

> **Note:** inference runs on CPU with onnxruntime, from the ONNX exports in
> `backend/external/models/`, so no install needs torch. torch is only for
> regenerating those files from the `.pt`/`.pth` weights
> (`backend/requirements-export.txt`, `python -m scripts.export_onnx`).

## Quick Start

Four terminals, one command each:

```bash
# Terminal 1 — Redis
./scripts/redis-start.sh

# Terminal 2 — Backend (prepares the DB, seeds demo data, then serves)
./scripts/backend-start.sh

# Terminal 3 — Celery worker
./scripts/worker-start.sh

# Terminal 4 — Frontend
npm --prefix frontend run dev
```

Log in with the seeded demo account: **`admin`** / **`password`**

To create a real hospital and admin account instead of using the demo data, run
`backend/cere_env/bin/python backend/scripts/create_admin.py`; it prompts for the
hospital name and admin credentials.

### Starting over

```bash
./scripts/backend-start.sh --fresh
```

Drops every table, deletes uploaded files, generated plots and logs, then
recreates and re-seeds. It asks for typed confirmation first; add `--yes` to
skip the prompt in a script.

Without `--fresh` the backend continues from the last run: missing tables are
created, existing rows are left alone, and seeding is a no-op if the demo data
is already there.

## Windows

The bash scripts above do not run on Windows, and Redis has no Windows build. The
`scripts\*.ps1` scripts run the website there with **two** components: the backend
runs the Celery tasks itself (`IN_PROCESS_TASKS`), so there is no Redis and no
worker.

Prerequisites: Python 3.14 (`py -0` must list it), Node.js 26 and npm 12, and
Windows PowerShell 5.1 or later. Docker is not needed.

```powershell
# Once. Add -NoAi for a manual-entry-only install.
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

# Terminal 1 - Backend (prepares the DB, seeds demo data, then serves)
powershell -ExecutionPolicy Bypass -File scripts\backend-start.ps1

# Terminal 2 - Frontend
npm --prefix frontend run dev
```

`backend-start.ps1` takes `-Fresh`, `-Yes` and `-NoAi`, as `backend-start.sh` does,
and `scripts\stop.ps1` stops it. `scripts\test.ps1` runs the suites (`-Backend`,
`-Frontend`, `-Cov`, `-Lint`). The Playwright suite needs bash, so it runs in CI only.

Run the scripts through `powershell -ExecutionPolicy Bypass -File`. Windows blocks
scripts by default, and a new process keeps the `backend\.env` values that a script
loads out of your own shell.

To draft reports with OpenAI, set `OPENAI_API_KEY` in `backend\.env` and restart the
backend.

If you built the desktop app before, `backend\cere_env` may be its virtualenv.
`setup.ps1` stops if it is. Delete that folder and run setup again: the desktop build
now uses its own `backend\desktop_env` ([DESKTOP_BUILD_WINDOWS.md](DESKTOP_BUILD_WINDOWS.md)).

Two differences from the four-terminal setup:

- **A restart drops work in progress.** Task results live in the backend's memory.
  When `--reload` restarts it after a code change, an analysis that was running is
  lost: upload the file again.
- **Run one backend only.** A second process cannot see the first one's results.

## Verification

```bash
# Redis
docker exec redis_dev redis-cli ping                 # expect PONG

# Backend API
curl http://localhost:8000/health          # -> {"status":"healthy",...}
curl http://localhost:8000/api/v1/docs

# Celery worker
cd backend && ./cere_env/bin/celery -A inference.infer inspect ping

# Frontend
curl http://localhost:3000
```

## Access Points

- **Frontend UI**: http://localhost:3000
- **API Documentation**: http://localhost:8000/api/v1/docs
- **ReDoc API Docs**: http://localhost:8000/api/v1/redoc

## Stopping the Application

```bash
./scripts/stop.sh
```

Stops the backend, the Celery worker (waiting out Celery's warm shutdown), and
the Redis container. The frontend dev server is not managed by the script —
Ctrl-C it in its own terminal.

## Running commands by hand

The scripts call the virtualenv's binaries directly, which needs no activation.
To run something yourself:

```bash
cd backend
./cere_env/bin/python migrate.py            # create missing tables
./cere_env/bin/python migrate.py --reset    # DESTRUCTIVE: drop and recreate
./cere_env/bin/python -m scripts.seed_demo  # demo data (idempotent)
```

To get an activated shell instead:

```bash
source backend/cere_env/bin/activate
```

> **Note:** older versions of these docs said `pyenv activate cere_env`. There is
> no such pyenv virtualenv — the environment lives at `backend/cere_env/`.

**The backend and worker must run with `backend/` as the working directory.**
`inference/infer.py` resolves the model weights relative to the current
directory, and `DATABASE_URL` is `sqlite:///./cere_signal.db`. Run either from
somewhere else and you get missing weights or a second, empty database. The
scripts handle this for you.

## Troubleshooting

### Port already in use

```bash
lsof -i :8000   # Backend
lsof -i :3000   # Frontend
lsof -i :6379   # Redis
```

Then `kill <PID>`, or just run `./scripts/stop.sh`.

### Celery worker not connecting

Redis must be running first — `./scripts/redis-start.sh` waits for it to accept
connections before returning, so start it before the worker.

```bash
docker ps | grep redis_dev
cd backend && ./cere_env/bin/celery -A inference.infer inspect ping
```

### Frontend out of memory

The production build and dev server both run with a raised Node heap
(`--max-old-space-size=6144`, set in `frontend/package.json`). If you invoke
`react-scripts` directly you will hit the 2 GB default and see
`JavaScript heap out of memory`. Use the npm scripts.

### Reports come out blank

The process that runs the tasks names the cause, on a line that starts with
`LLM report error`. That is the Celery worker's terminal, the backend's on Windows,
and `docker compose logs celery_worker` under Compose. The model in brackets shows
which LLM was tried:

- `gpt-4o-mini`, or your `OPENAI_MODEL`: OpenAI was called and refused. The rest of
  the line gives the reason, for example `401` for a wrong key, or `429` with
  `insufficient_quota` for an account with no credit.
- `ollama` or an Ollama model name: that process did not see `OPENAI_API_KEY`. Set
  it in `backend/.env` and restart the process.

Without a key, a local Ollama model drafts the report. With neither, inference
still completes and the report text is left empty for manual entry.

### Every upload lands in "Needs Review"

That is the manual-entry-only mode. Uploads are still preprocessed for the EEG
viewer, but no model runs and no report is drafted; the file waits for a manual
normal/abnormal label.

Both start scripts print `Manual-entry-only mode` at startup when it is active,
so check those two terminals first. If you did not pass `--no-ai`, something has
uncommented `AI_INFERENCE_ENABLED` in `backend/.env` — comment it out again and
restart **both** the backend and the Celery worker, since each reads the flag
independently. The ML stack must also be installed: `./scripts/setup.sh` without
`--no-ai`.

To run the mode deliberately for one session, leave `.env` alone and pass the
flag to both:

```bash
./scripts/backend-start.sh --no-ai
./scripts/worker-start.sh --no-ai
```

### Upload or processing fails

Check the backend and Celery worker logs. In local mode, files are written under
`backend/local_storage/` — confirm that directory is created and writable.

If `SUPABASE_URL` is set, the credentials must be valid and the `eeg-signals` and
`eeg-assets` buckets must exist. To use local disk instead, leave `SUPABASE_URL`
empty.

### Database issues

Recreate missing tables (and ensure the dev superuser exists):

```bash
cd backend
./cere_env/bin/python migrate.py
```

To wipe and start over — **this destroys all data**:

```bash
cd backend
./cere_env/bin/python migrate.py --reset
```

Or `./scripts/backend-start.sh --fresh` to reset, re-seed and serve in one step.

## Frontend commands

Run from the repo root:

```bash
npm --prefix frontend run dev            # dev server with hot reload
npm --prefix frontend run build          # production build
npm --prefix frontend start              # serve the built output on :3000
npm --prefix frontend test               # tests
```

The desktop app uses the same build. `npm --prefix frontend run start:desktop` just
delegates to the root `start:desktop`, which launches Electron.

## Alternative: Docker Compose

Run `./scripts/setup.sh` first — the containers read `backend/.env` for
`SECRET_KEY`, and compose does not create it.

```bash
docker-compose up redis backend celery_worker
```

The backend service migrates the schema and seeds the demo data before serving,
so this needs no separate setup step. Both it and `celery_worker` bind-mount
`./backend`, so they share one `cere_signal.db` and one `local_storage/` — the
same files the four-terminal workflow above uses. You can switch between the two
setups without losing uploads or your login.

> **Known issue:** the `frontend` service still cannot build. `frontend/package.json`
> depends on `"ceresignal-desktop": "file:.."`, and inside that build context
> `..` resolves to `/`, so `npm install` fails. Until that entry is removed, run
> the frontend on the host with `npm --prefix frontend run dev`; it reaches the
> containerised API on `localhost:8000` as usual.
