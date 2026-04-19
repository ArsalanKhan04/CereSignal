# How to Run CereSignal in Development Mode

CereSignal requires **4 components** running simultaneously:

| Component | Purpose | Port |
|-----------|---------|------|
| Redis | Message broker for Celery tasks | 6379 |
| FastAPI Backend | REST API server | 8000 |
| Celery Worker | ML inference task processor | N/A |
| React Frontend | Web UI | 3000 |

## Prerequisites

- Python 3.11+ with `cere_env` pyenv environment
- Node.js and npm
- Docker (for Redis) or Redis installed locally

## Quick Start

Open **4 separate terminal windows** and run the following commands:

### Terminal 1: Redis

Using Docker (recommended):
```bash
docker run -d --name redis_dev -p 6379:6379 redis:7-alpine
```

Or if Redis is installed locally:
```bash
redis-server
```

### Terminal 2: FastAPI Backend

```bash
cd backend
pyenv activate cere_env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 3: Celery Worker

```bash
cd backend
pyenv activate cere_env
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
curl http://localhost:8000/api/v1/docs

# Celery Worker
celery -A inference.infer inspect ping

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
pyenv activate cere_env
celery -A inference.infer inspect ping
```

### Frontend compilation errors

If npm packages are missing:
```bash
cd frontend
npm install
```

## Alternative: Docker Compose

To run everything with Docker Compose:
```bash
docker-compose up
```

Note: This is better for production-like environments but slower for development due to reduced hot-reload capabilities.
