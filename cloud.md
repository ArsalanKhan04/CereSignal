# CereSignal Cloud Migration Guide

## Overview

This document outlines the plan to migrate CereSignal from a self-contained local deployment (Electron + Docker Compose with local Redis/Ollama/SQLite) to a cloud-based multi-tenant SaaS platform deployed on Railway, with Supabase for database, OpenAI API for LLM reports, and Cloudflare for domain management.

### Target Architecture

```
┌──────────────────────────────────────────────┐
│                  Cloudflare                   │
│  app.cereignal.com → Railway (frontend)       │
│  api.cereignal.com → Railway (backend)       │
└──────────────────────────────────────────────┘
                      │
┌──────────────────────────────────────────────┐
│                   Railway                     │
│                                               │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │  Frontend    │  │     Backend (API)     │   │
│  │  (Static     │  │  FastAPI              │   │
│  │   Site)      │  │  - Auth (JWT)         │   │
│  │              │  │  - File upload         │   │
│  │              │  │  - Report CRUD         │   │
│  └─────────────┘  └──────────┬───────────┘   │
│                               │               │
│  ┌─────────────┐  ┌──────────▼───────────┐   │
│  │  ML Worker   │  │     Redis             │   │
│  │  (Celery)    │  │  (Message Broker)     │   │
│  │  - NeuroGate │  └──────────────────────┘   │
│  │  - NeuroTrans│                             │
│  │  - Topomap   │                             │
│  └─────────────┘                              │
│                                               │
│  Report Gen: OpenAI API (external)             │
└──────────────────────────────────────────────┘
                      │
┌──────────────────────────────────────────────┐
│                  Supabase                     │
│  PostgreSQL + Auth (optional) + Storage        │
└──────────────────────────────────────────────┘
```

---

## Step 1: Decouple & Containerize for Cloud

**Goal:** Replace local dependencies (SQLite, local Ollama, local Redis) with cloud-native alternatives. Make backend and frontend independently deployable. Prep Dockerfiles for Railway.

### 1A. Replace Ollama with OpenAI API

The LLM report generation currently calls a locally-hosted `qwen3:8b` via `ollama.chat()`. This must be replaced with OpenAI's API.

**Relevant files:**

| File | Lines | What to change |
|------|-------|---------------|
| `backend/inference/infer.py` | 226-284 | `_generate_report()` — replace `ollama.chat()` with `openai.ChatCompletion.create()` |
| `backend/inference/infer.py` | 1-7 | Add `import openai` (or `from openai import OpenAI`) |
| `backend/requirements.txt` | — | Remove `ollama`, add `openai` |
| `.env.example` | — | Remove ollama config, add `OPENAI_API_KEY`, `OPENAI_MODEL` (e.g. `gpt-4o`) |
| `backend/app/core/config.py` | 27-52 | Add `OPENAI_API_KEY` and `OPENAI_MODEL` to `Settings` |

**Changes needed in `backend/inference/infer.py`:**

```python
# Currently (lines 267-274):
response = ollama.chat(
    model="qwen3:8b",
    format="json",
    messages=[
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt_content},
    ],
)

# Replace with:
from openai import OpenAI
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

response = client.chat.completions.create(
    model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt_content},
    ],
)
```

### 1B. Database: SQLite → Supabase PostgreSQL

Currently uses SQLite with `connect_args={"check_same_thread": False}`. Must switch to PostgreSQL-compatible connection string and remove SQLite-specific code.

**Relevant files:**

| File | Lines | What to change |
|------|-------|---------------|
| `backend/app/core/database.py` | 11-13 | Replace `create_engine(DATABASE_URL, connect_args=...)` with PostgreSQL engine |
| `backend/app/core/config.py` | 27 | `DATABASE_URL` — change default to PostgreSQL connection string |
| `backend/app/models/auth.py` | 13-17 | `UserType` enum — add `ADMIN = "admin"` |
| `backend/app/models/user.py` | 1-60 | Add `hospital_id` FK |
| `.env.example` | 2 | Change `DATABASE_URL` to `postgresql://...` |
| `backend/requirements.txt` | — | Add `psycopg2-binary` (PostgreSQL driver) |

**Database URL change:**
```
# Before:
DATABASE_URL=sqlite:///./cere_signal.db

# After (Supabase):
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

**Remove SQLite-specific code** in `backend/app/core/database.py:11-14`:
```python
# Before:
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

# After:
engine = create_engine(settings.DATABASE_URL)
```

### 1C. Redis — Keep Celery but Point to Cloud Redis

The Celery task queue architecture stays in place but Redis must be a Railway service, not `localhost`.

**Relevant files:**

| File | Lines | What to change |
|------|-------|---------------|
| `backend/inference/infer.py` | 24-27 | `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` — read from env |
| `backend/app/services/inference_service.py` | 16-20 | Same — read from env |
| `.env.example` | 9 | `REDIS_URL=redis://localhost:6379` → Railway Redis URL |
| `backend/app/core/config.py` | 38 | `REDIS_URL` — keep reading from env (no code change needed) |
| `docker-compose.yml` | 1-10 | Redis service definition — document for Railway |

**Change in `backend/inference/infer.py:24-27`:**
```python
# Before:
CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "redis://localhost:6379/0"

# After:
import os
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://localhost:6379")
```

Same change needed in `backend/app/services/inference_service.py:16-20`.

### 1D. CORS & Frontend-Backend Decoupling

Frontend must talk to backend at a separate URL (e.g., `api.cereignal.com`), not `localhost`.

**Relevant files:**

| File | Lines | What to change |
|------|-------|---------------|
| `backend/app/core/config.py` | 34 | `BACKEND_CORS_ORIGINS` — add production frontend URLs |
| `backend/app/core/middleware.py` | 18-24 | CORS middleware — already reads from config, no code change needed |
| `frontend/src/services/api.ts` | 35 | `baseURL` — read from `REACT_APP_API_BASE_URL` |
| `frontend/.env.example` | 1 | `REACT_APP_API_BASE_URL=http://localhost:8000/api/v1` → production URL |
| `frontend/src/types/index.ts` | 1-10 | Add `Hospital` interface |

**CORS origins (`config.py:34`):**
```python
BACKEND_CORS_ORIGINS: list[str] = [
    "http://localhost:3000",
    "http://localhost:8080",
    "https://app.cereignal.com",      # Production frontend
    "https://*.railway.app",          # Railway preview URLs
]
```

### 1E. Dockerfiles for Railway

Railway needs separate deployable units for frontend, backend API, and Celery worker.

**Relevant files:**

| File | Lines | What to change |
|------|-------|---------------|
| `backend/Dockerfile.backend` | 1-20 | Ensure production-ready (no volume mounts for live reload) |
| `backend/app/Dockerfile` | 1-15 | Review/update for Railway |
| `frontend/Dockerfile.dev` | — | Create `frontend/Dockerfile` for production static build + nginx |
| `docker-compose.yml` | 1-50 | Review for Railway service definitions |

**New `frontend/Dockerfile` (production):**
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 1F. Disable/Remove Desktop Mode

Desktop mode (`DESKTOP_MODE=True`) bypasses auth and inference — not needed in cloud.

**Relevant files:**

| File | Lines | What to change |
|------|-------|---------------|
| `backend/app/core/config.py` | 48 | Set default to `False`, can remove env var |
| `backend/app/core/auth.py` | 82-108 | Remove desktop user auto-creation block |
| `backend/app/api/v1/api.py` | 20-24 | Remove `if not settings.DESKTOP_MODE` guard — always include auth |
| `backend/app/api/v1/endpoints/signals.py` | 70-88 | Remove `_DesktopInferenceService` stub class |
| `main.js` | — | Remove or mark as deprecated |
| `frontend/src/pages/DesktopWorkspace.tsx` | 1-117 | Can remove |
| `frontend/src/App.tsx` | 177-189 | Remove desktop mode branch |

### Step 1 Summary: Files by Change Area

```
AI API Replacement:
├── backend/inference/infer.py          (lines 226-284, 1-7)
├── backend/requirements.txt            (ollama → openai)
├── backend/app/core/config.py          (add OPENAI_API_KEY)
└── .env.example                        (add OpenAI vars)

Database Migration:
├── backend/app/core/database.py        (lines 11-14)
├── backend/app/core/config.py          (line 27)
├── backend/app/models/auth.py          (add ADMIN role)
├── backend/app/models/user.py          (add hospital_id)
└── backend/requirements.txt            (add psycopg2)

Redis Cloud:
├── backend/inference/infer.py          (lines 24-27)
├── backend/app/services/inference_service.py (lines 16-20)
└── backend/app/core/config.py          (line 38)

CORS & Decoupling:
├── backend/app/core/config.py          (line 34)
├── frontend/src/services/api.ts        (line 35)
├── frontend/.env.example               (line 1)
└── frontend/src/App.tsx                (remove desktop mode)

Dockerfiles:
├── backend/Dockerfile.backend
├── frontend/Dockerfile                 (NEW)
└── docker-compose.yml

Desktop Mode Cleanup:
├── backend/app/core/auth.py            (lines 82-108)
├── backend/app/api/v1/api.py           (lines 20-24)
├── backend/app/api/v1/endpoints/signals.py (lines 70-88)
├── frontend/src/pages/DesktopWorkspace.tsx
└── frontend/src/App.tsx                (lines 177-189)
```

---

## Step 2: Multi-Tenant Hospital Architecture

**Goal:** Restructure the data model and authorization system to support multiple hospitals with isolated data, each having their own admin who manages doctors/technicians. Add hospital-scoped access control.

### 2A. Add Hospital Model

A new `Hospital` table that all users, patients, and signal files are scoped to.

**New file:** `backend/app/models/hospital.py`

```python
class Hospital(Base):
    __tablename__ = "hospitals"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)  # short code for URL/API
    address = Column(String)
    phone = Column(String)
    email = Column(String)
    subscription_tier = Column(String, default="basic")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### 2B. Add Hospital Relationships to Existing Models

**Relevant files:**

| File | Lines | Change |
|------|-------|--------|
| `backend/app/models/auth.py` | 20-50 | Add `hospital_id` FK to `AuthUser` |
| `backend/app/models/user.py` | 20-60 | Add `hospital_id` FK to `User` (patient) |
| `backend/app/models/signal.py` | 22-69 | Add `hospital_id` FK to `SignalFile` |
| `backend/app/models/report.py` | 20-50 | Add `hospital_id` FK to `EEGReport` |
| `backend/app/models/__init__.py` | 1-6 | Import `Hospital` |

**Changes to `AuthUser` (`backend/app/models/auth.py:20-50`):**
```python
# Add:
hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
# Admin users belong to a hospital
```

### 2C. Add Admin Role

**Relevant files:**

| File | Lines | Change |
|------|-------|--------|
| `backend/app/models/auth.py` | 13-17 | Add `ADMIN = "admin"` to `UserType` enum |
| `backend/app/core/auth.py` | 1-161 | Add `get_current_admin_user()` dependency |
| `backend/app/schemas/auth.py` | 1-116 | Add `AdminRegister` schema, allow `admin` in `UserRegister` |

### 2D. Hospital-Scoped Data Access

All existing role-based filters must add a hospital scope. Currently doctors see "assigned patients," technicians see "all patients." After this change, both should only see data within their hospital.

**Relevant files (all endpoint files need hospital filtering):**

| File | Lines | Change description |
|------|-------|-------------------|
| `backend/app/api/v1/endpoints/users.py` | 33-38, 216-222, 275-289 | Add `hospital_id` filter to all queries |
| `backend/app/api/v1/endpoints/signals.py` | 159-184, 361-383, 584-603 | Add `hospital_id` filter to file access |
| `backend/app/api/v1/endpoints/reports.py` | 171-198 | Add `hospital_id` filter to report access |
| `backend/app/api/v1/endpoints/auth.py` | 438-458 | `GET /doctors` — filter by hospital |
| `backend/app/api/v1/endpoints/notifications.py` | 26-30 | Filter notifications by hospital |

**Pattern for hospital-scoped filtering:**
```python
# Add to every query:
query = query.filter(Model.hospital_id == current_user.hospital_id)
```

### 2E. Admin Endpoints

New CRUD endpoints for hospital admins to manage their doctors and technicians.

**New file:** `backend/app/api/v1/endpoints/admin.py`

Endpoints needed:
- `GET /admin/dashboard/stats` — pending reports, completed reports, user counts
- `GET /admin/doctors` — list doctors in hospital
- `POST /admin/doctors` — add doctor (admin creates account)
- `DELETE /admin/doctors/{id}` — remove doctor
- `GET /admin/technicians` — list technicians in hospital
- `POST /admin/technicians` — add technician
- `DELETE /admin/technicians/{id}` — remove technician
- `PUT /admin/users/{id}/status` — deactivate/activate users
- `GET /admin/patients` — list all patients in hospital

**Route registration in `backend/app/api/v1/api.py:17-31`:**
```python
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
```

### 2F. Hospital Statistics Endpoint

The existing `GET /signals/stats` (signals.py:955) returns global stats. Must be expanded with hospital-scoped stats.

**Relevant files:**

| File | Lines | Change |
|------|-------|--------|
| `backend/app/api/v1/endpoints/signals.py` | 955-1043 | Modify `stats` endpoint for hospital scope |
| `backend/app/api/v1/endpoints/admin.py` | — | Add admin-specific stats (per-doctor breakdown, per-technician) |

### 2G. Database Migration Script

Since schemas change significantly, create an Alembic migration or manual SQL script.

**Relevant files:**

| File | Lines | Change |
|------|-------|--------|
| `backend/requirements.txt` | — | Add `alembic` |
| — | — | Create `backend/alembic/` and `alembic.ini` |
| — | — | Create migration `001_add_hospitals_and_admin.sql` |

### Step 2 Summary: Files by Change Area

```
New Models:
├── backend/app/models/hospital.py              (NEW)
└── backend/app/models/__init__.py              (line 1-6, add Hospital import)

Model Changes:
├── backend/app/models/auth.py                  (lines 13-17, 20-50)
├── backend/app/models/user.py                  (lines 20-60)
├── backend/app/models/signal.py                (lines 22-69)
├── backend/app/models/report.py                (lines 20-50)

Auth Changes:
├── backend/app/core/auth.py                    (add get_current_admin_user)
├── backend/app/schemas/auth.py                 (add AdminRegister)
└── backend/app/api/v1/endpoints/auth.py        (filter by hospital)

Admin Endpoints:
├── backend/app/api/v1/endpoints/admin.py       (NEW)
├── backend/app/api/v1/api.py                   (line 17-31, register admin router)
└── backend/app/schemas/admin.py                (NEW)

Hospital-Scoped Filtering:
├── backend/app/api/v1/endpoints/users.py       (every query)
├── backend/app/api/v1/endpoints/signals.py     (every query)
├── backend/app/api/v1/endpoints/reports.py     (every query)
├── backend/app/api/v1/endpoints/notifications.py (every query)

Migrations:
├── backend/alembic/                            (NEW)
└── backend/alembic.ini                         (NEW)
```

---

## Step 3: Admin Dashboard & Cloud Deployment

**Goal:** Build the admin dashboard UI, update login/registration flows for the new multi-tenant model, configure Railway + Cloudflare deployment, and optionally migrate to Supabase.

### 3A. Admin Dashboard Frontend

**New pages/components needed:**

| Component | Purpose |
|-----------|---------|
| `frontend/src/pages/AdminDashboard.tsx` | Main admin view with stats cards, user management |
| `frontend/src/components/AdminStats.tsx` | Stats cards: pending reports, completed reports, active doctors/technicians |
| `frontend/src/components/AddUserDialog.tsx` | Dialog to add doctor/technician (admin sets name, email, role) |
| `frontend/src/components/UserManagementTable.tsx` | Table listing doctors/technicians with activate/deactivate/delete actions |

**Relevant existing files to modify:**

| File | Lines | Change |
|------|-------|--------|
| `frontend/src/pages/DashboardPage.tsx` | 27-34 | Add `case 'admin': return <AdminDashboard />` |
| `frontend/src/App.tsx` | 148-174 | No route change needed — dashboard already role-routes |
| `frontend/src/services/api.ts` | — | Add admin API methods (`getAdminStats`, `getDoctors`, `createDoctor`, `deleteDoctor`, etc.) |
| `frontend/src/types/index.ts` | 1-310 | Add `AdminStats`, `HospitalUser` types |

### 3B. Registration Flow Changes

Admins create doctors/technicians (no more self-registration). Doctors then log in. Adins are created via a seed/setup process.

**Relevant files:**

| File | Lines | Change |
|------|-------|--------|
| `frontend/src/pages/LoginPage.tsx` | 1-424 | Keep staff/patient login; remove self-registration links |
| `frontend/src/pages/SignupPage.tsx` | 1-311 | Remove from routing (or restrict to admin access) |
| `frontend/src/pages/DoctorRegistrationPage.tsx` | 1-309 | Remove from routing |
| `frontend/src/pages/TechnicianRegistrationPage.tsx` | 1-303 | Remove from routing |
| `frontend/src/App.tsx` | 148-174 | Remove `/signup`, `/register/doctor`, `/register/technician` routes |
| `backend/app/api/v1/endpoints/auth.py` | 35-130 | `POST /register` — make admin-only |
| — | — | Create admin seed script `backend/scripts/create_admin.py` |

### 3C. Railway Deployment Configuration

**New file:** `railway.json` at project root

```json
{
  "services": {
    "backend": {
      "build": { "dockerfilePath": "backend/Dockerfile.backend" },
      "port": 8000
    },
    "worker": {
      "build": { "dockerfilePath": "backend/Dockerfile.backend" },
      "command": "celery -A inference.infer worker -l info"
    },
    "frontend": {
      "build": { "dockerfilePath": "frontend/Dockerfile" },
      "port": 80
    }
  }
}
```

**Relevant files:**

| File | Lines | Change |
|------|-------|--------|
| `backend/Dockerfile.backend` | 1-20 | Update for production (no volume mounts, proper CMD) |
| `frontend/Dockerfile` | — | Create production nginx Dockerfile |
| `.env.example` | 1-50 | Add Railway-specific env vars |
| `backend/app/core/config.py` | 50-52 | Ensure `.env` loading still works |

### 3D. Cloudflare Domain Setup

- Purchase domain on Cloudflare
- Create DNS records:
  - `app.cereignal.com` → CNAME to Railway frontend URL
  - `api.cereignal.com` → CNAME to Railway backend URL
- Enable Cloudflare SSL (strict mode)
- Update CORS origins in `backend/app/core/config.py:34`

### 3E. Supabase Migration (Later Phase)

If migrating to Supabase later (not initially):
- Export SQLite data with a migration script
- Run on Supabase PostgreSQL
- Optionally use Supabase Auth instead of custom JWT (would require significant auth refactor)
- Use Supabase Storage for uploaded EDF files & generated PDFs (instead of local disk)

### 3F. Model Deployment Strategy on Railway

**Option A: Coupled (recommended for simplicity)**
- Both ML models are loaded in the Celery worker service
- Model weights are bundled in the Docker image (they're ~10-30 MB each)
- Worker service runs `celery -A inference.infer worker`

**Option B: Separate service**
- Each model runs in its own service with a lightweight HTTP API
- More scalable but adds complexity and network latency

**Recommendation:** Start with Option A. The NeuroGate and NeuroTransformer models run on CPU and process one file at a time. A single Railway worker service with 2-4 GB RAM is sufficient for hospital-scale usage. If concurrent processing needs grow, Railway can horizontally scale the worker service.

**Relevant files for model bundling:**

| File | Lines | Note |
|------|-------|------|
| `backend/external/models/neurogate_wgts.pt` | — | ~5 MB, include in Docker image |
| `backend/external/models/neurotransformer_wgts.pth` | — | ~10 MB, include in Docker image |
| `backend/inference/infer.py` | 2-7, 30-34 | Model loading paths — ensure relative paths work in container |
| `backend/Dockerfile.backend` | — | `COPY . .` already includes model weights |

### Step 3 Summary: Files by Change Area

```
Admin Dashboard (Frontend):
├── frontend/src/pages/AdminDashboard.tsx        (NEW)
├── frontend/src/components/AdminStats.tsx        (NEW)
├── frontend/src/components/AddUserDialog.tsx     (NEW)
├── frontend/src/components/UserManagementTable.tsx (NEW)
├── frontend/src/pages/DashboardPage.tsx          (line 27-34)
├── frontend/src/services/api.ts                  (add admin methods)
└── frontend/src/types/index.ts                   (add admin types)

Registration Changes:
├── frontend/src/pages/LoginPage.tsx              (remove self-registration links)
├── frontend/src/pages/SignupPage.tsx             (remove from routes)
├── frontend/src/pages/DoctorRegistrationPage.tsx (remove from routes)
├── frontend/src/pages/TechnicianRegistrationPage.tsx (remove from routes)
├── frontend/src/App.tsx                          (lines 148-174)
├── backend/app/api/v1/endpoints/auth.py          (line 35-130)
└── backend/scripts/create_admin.py               (NEW)

Deployment:
├── railway.json                                   (NEW)
├── backend/Dockerfile.backend                     (production hardening)
├── frontend/Dockerfile                            (NEW — nginx + static build)
├── .env.example                                   (Railway vars)
└── backend/app/core/config.py                     (line 34, CORS origins)

Supabase (optional, later):
├── backend/app/core/database.py                   (PostgreSQL connection)
├── backend/scripts/migrate_to_supabase.sql        (NEW)
└── (Storage integration for files/PDFs)
```

---

## Execution Order

Complete these 3 steps in order. Each step builds on the previous one.

### Step 1: Decouple & Containerize for Cloud

**Duration estimate:** 3-5 days

1. Add `OPENAI_API_KEY` to `.env` and `config.py`
2. Replace `ollama.chat()` with OpenAI API in `inference/infer.py:_generate_report()`
3. Update `requirements.txt` (remove ollama, add openai)
4. Change Redis URLs in `infer.py` and `inference_service.py` to read from env
5. Create production `frontend/Dockerfile` (nginx + static build)
6. Update `backend/Dockerfile.backend` for production (CMD for uvicorn)
7. Remove desktop mode code paths (auth.py desktop user block, api.py guard, signals.py stub, DesktopWorkspace.tsx, App.tsx desktop branch)
8. Update CORS origins to include production domain
9. Test locally with `docker-compose up` — verify OpenAI report generation works
10. Deploy to Railway staging environment and verify end-to-end flow

### Step 2: Multi-Tenant Hospital Architecture

**Duration estimate:** 5-7 days

1. Create `Hospital` model in `backend/app/models/hospital.py`
2. Add `ADMIN` role to `UserType` enum
3. Add `hospital_id` FK to AuthUser, User, SignalFile, EEGReport models
4. Add `get_current_admin_user()` dependency in `auth.py`
5. Create `admin.py` endpoint file with all CRUD operations
6. Register admin router in `api.py`
7. Add hospital-scoped filtering to ALL existing endpoints (users.py, signals.py, reports.py, notifications.py)
8. Create Alembic migration for schema changes
9. Update all Pydantic schemas to include `hospital_id`
10. Update `GET /signals/stats` for hospital scope
11. Write admin seed script
12. Test: create hospital, create admin, verify admin can add doctors, verify doctors see only their hospital data

### Step 3: Admin Dashboard & Cloud Deployment

**Duration estimate:** 5-7 days

1. Build `AdminDashboard.tsx` with stats cards and user management
2. Build `AddUserDialog.tsx` and `UserManagementTable.tsx`
3. Add admin API methods to `frontend/src/services/api.ts`
4. Add admin route to `DashboardPage.tsx` switch
5. Remove self-registration routes from frontend (`App.tsx`)
6. Update login page to remove self-registration links
7. Create `railway.json` with service definitions
8. Set up Cloudflare domain and DNS records
9. Configure Railway environment variables (via Railway dashboard)
10. Deploy frontend, backend, and worker to Railway
11. Verify: domain works, HTTPS works, auth works, upload+inference+report generation works end-to-end
12. (Optional) Migrate to Supabase — export data, import to PostgreSQL, switch DATABASE_URL

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| File upload storage on Railway (ephemeral disk) | Use Supabase Storage or S3-compatible object store for EDF files. Railway disk is ephemeral and resets on deploy. |
| Model weights too large for Railway free tier | NeuroGate (~5 MB) + NeuroTransformer (~10 MB) fit within Docker image. Railway allows up to 2 GB images. |
| Celery worker cold start takes time loading models | Acceptable for medical use case. Models load once on worker start. Can pre-warm with a health check endpoint. |
| OpenAI API latency for report generation | Reports are async already — user polls for completion. Add timeout handling (60s max). |
| Supabase connection pooling limits | Use connection pooling with `psycopg2` pool. Railway's built-in Postgres is an alternative if Supabase limits are restrictive. |
