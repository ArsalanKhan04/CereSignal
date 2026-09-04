# How to Run CereSignal in Development Mode

CereSignal requires **4 components** running simultaneously:

| Component | Purpose | Port |
|-----------|---------|------|
| Redis | Message broker for Celery tasks | 6379 |
| FastAPI Backend | REST API server | 8000 |
| Celery Worker | EDF preprocessing + ML inference | N/A |
| React Frontend | Web UI | 3000 |

## Prerequisites

- Python 3.11+
- Node.js and npm
- Docker (for Redis) or Redis installed locally
- No cloud account required — see First-Time Setup

## First-Time Setup

Run these once before the Quick Start below.

### 1. Backend Python environment

```bash
cd backend
python3.11 -m venv cere_env
source cere_env/bin/activate        # Windows: cere_env\Scripts\activate
pip install -r requirements.txt
```

Inference runs on CPU (`inference/infer.py` pins `torch.device("cpu")`), but a plain
`pip install torch` pulls in several GB of CUDA wheels. On Linux you can install the much
smaller CPU-only build first:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

### 2. Frontend dependencies

```bash
cd frontend
npm install
```

### 3. Environment file

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env` and set at minimum:

```bash
SECRET_KEY=any-value-for-local-dev
DATABASE_URL=sqlite:///./cere_signal.db
REDIS_URL=redis://localhost:6379/0

# Optional — only needed for AI-generated report text
OPENAI_API_KEY=sk-...
```

**No cloud account is needed for local development.** Leave `SUPABASE_URL` empty and the
backend stores uploaded files on disk under `backend/local_storage/`, serving them from
`/static`. Set `SUPABASE_URL` + `SUPABASE_SECRET_KEY` and it switches to Supabase Storage
automatically — that is how the deployed app runs.

Likewise, `DATABASE_URL` accepts SQLite locally; `sslmode=require` is applied only for Postgres
URLs.

Without `OPENAI_API_KEY` everything still works — inference runs and the report form opens, but
the AI-drafted report text comes back empty and is typed by hand.

Tables are created automatically on first backend startup (`app/main.py` calls
`Base.metadata.create_all`), so no migration step is needed for a fresh database.

### 4. Create your first account

The app has no public sign-up for staff, so bootstrap a hospital and admin user:

```bash
cd backend
source cere_env/bin/activate
python scripts/create_admin.py
```

This prompts for the hospital name and admin credentials, which you then use to log in at
http://localhost:3000.

## Quick Start

Open **4 separate terminal windows** and run the following commands:

### Terminal 1: Redis

Using Docker (recommended):
```bash
docker run -d --name redis_dev -p 6379:6379 redis:7-alpine
```

If the container already exists from a previous run:
```bash
docker start redis_dev
```

Or if Redis is installed locally:
```bash
redis-server
```

### Terminal 2: FastAPI Backend

```bash
cd backend
source cere_env/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 3: Celery Worker

```bash
cd backend
source cere_env/bin/activate
celery -A inference.infer worker -l info
```

### Terminal 4: React Frontend

```bash
cd frontend
npm start
```

## Verification

Once all components are running, verify with:

```bash
# Redis
docker ps | grep redis

# Backend API
curl http://localhost:8000/health          # -> {"status":"healthy",...}
curl http://localhost:8000/api/v1/docs

# Celery Worker
cd backend && celery -A inference.infer inspect ping

# Frontend
curl http://localhost:3000
```

## Access Points

- **Frontend UI**: http://localhost:3000
- **API Documentation**: http://localhost:8000/api/v1/docs
- **ReDoc API Docs**: http://localhost:8000/api/v1/redoc

## Stopping the Application

```bash
# Stop Redis container
docker stop redis_dev && docker rm redis_dev

# Stop Celery worker (Ctrl+C in terminal or)
pkill -f "celery.*worker"

# Stop Backend and Frontend with Ctrl+C in their respective terminals
```

## Troubleshooting

### Port already in use

Check what's using the port:
```bash
lsof -i :8000  # Backend
lsof -i :3000  # Frontend
lsof -i :6379  # Redis
```

Kill the process if needed:
```bash
kill -9 <PID>
```

### Celery worker not connecting

Ensure Redis is running first:
```bash
docker ps | grep redis
```

Check Celery can connect:
```bash
cd backend
source cere_env/bin/activate
celery -A inference.infer inspect ping
```

### Frontend compilation errors

If npm packages are missing:
```bash
cd frontend
npm install
```

### Upload or processing fails

Check the backend and Celery worker logs. In local mode, files are written under
`backend/local_storage/` — confirm that directory is created and writable.

If `SUPABASE_URL` is set, the credentials must be valid and the `eeg-signals` and `eeg-assets`
buckets must exist. To use local disk instead, leave `SUPABASE_URL` empty.

### Database issues

Recreate missing tables (and ensure the dev superuser exists):
```bash
cd backend
python migrate.py
```

To wipe and start over — **this destroys all data**:
```bash
python migrate.py --reset
```

## Alternative: Docker Compose

To run everything with Docker Compose:
```bash
docker-compose up
```

Note: This is better for production-like environments but slower for development due to reduced
hot-reload capabilities.
