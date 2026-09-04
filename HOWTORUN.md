# How to Run CereSignal in Development Mode

CereSignal runs as **4 components**:

| Component | Purpose | Port |
|-----------|---------|------|
| Redis | Message broker for Celery tasks | 6379 |
| FastAPI Backend | REST API server | 8000 |
| Celery Worker | ML inference task processor | N/A |
| React Frontend | Web UI | 3000 |

## Prerequisites

- Python 3.11
- Node.js and npm
- Docker (for Redis) — or a local `redis-server` on 6379

## First-time setup

```bash
./scripts/setup.sh
```

Creates the `backend/cere_env` virtualenv, installs backend and frontend
dependencies, creates `backend/.env` from the example, and generates a random
`SECRET_KEY`. It is safe to re-run — every step is skipped if already done.

## Quick Start

Four terminals, one command each:

```bash
# Terminal 1 — Redis
./scripts/start-redis.sh

# Terminal 2 — Backend (prepares the DB, seeds demo data, then serves)
./scripts/start-backend.sh

# Terminal 3 — Celery worker
./scripts/start-worker.sh

# Terminal 4 — Frontend
npm --prefix frontend run dev
```

Log in with the seeded demo account: **`admin_nl`** / **`Demo@2025!`**

### Starting over

```bash
./scripts/start-backend.sh --fresh
```

Drops every table, deletes uploaded files, generated plots and logs, then
recreates and re-seeds. It asks for typed confirmation first; add `--yes` to
skip the prompt in a script.

Without `--fresh` the backend continues from the last run: missing tables are
created, existing rows are left alone, and seeding is a no-op if the demo data
is already there.

## Verification

```bash
# Redis
docker exec redis_dev redis-cli ping                 # expect PONG

# Backend API
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

Redis must be running first — `./scripts/start-redis.sh` waits for it to accept
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

Report drafting calls OpenAI. Without `OPENAI_API_KEY` in `backend/.env`,
inference still completes and the report text is simply left empty for manual
entry.

## Frontend commands

Run from the repo root:

```bash
npm --prefix frontend run dev            # dev server with hot reload
npm --prefix frontend run build          # production build
npm --prefix frontend start              # serve the built output on :3000
npm --prefix frontend test               # tests
```

Each has a `:desktop` variant (`dev:desktop`, `build:desktop`, `start:desktop`)
that sets `REACT_APP_DESKTOP=true`.

## Alternative: Docker Compose

```bash
docker-compose up
```

> **Known issue:** the `frontend` service's build context points at
> `./frontend-r`, which does not exist in this repo. Compose will fail until
> that is corrected to `./frontend`.
