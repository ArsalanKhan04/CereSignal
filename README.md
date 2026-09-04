# CereSignal

A full-stack medical EEG analysis platform. Clinicians upload EDF recordings; CereSignal runs them
through two pre-trained PyTorch models, generates clinical report text with an LLM, and presents the
results alongside an interactive EEG viewer.

It ships as a multi-tenant web application (Railway + Supabase) and as a Windows desktop app
(Electron + PyInstaller).

## Features

- **EEG analysis** — NeuroGate (Normal/Abnormal classification) and NeuroTransformer (per-channel
  spike/slow-wave detection), plus posterior dominant rhythm estimation and topographic maps
- **AI report drafting** — factual report and impression text generated via the OpenAI API, editable
  by the clinician before sign-off
- **Interactive EEG viewer** — Plotly-based waveform display with bookmarks, focus-point navigation,
  and fullscreen review
- **Clinical reports** — versioned reports with restore, PDF export, and patient delivery
- **Multi-tenancy** — hospital-scoped data with invitation-based staff onboarding, plus a
  cross-hospital dev-admin portal
- **Authentication** — JWT auth with four roles (doctor, technician, patient, admin) and a separate
  superuser flag
- **Patient portal** — token-based access for patients to view their own reports

## Project Structure

```
CereSignal/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI application entry point
│   │   ├── core/                   # Config, database, auth, logging, middleware
│   │   ├── models/                 # SQLAlchemy models (auth, user, hospital,
│   │   │                           #   signal, report, notification, contact)
│   │   ├── schemas/                # Pydantic schemas
│   │   ├── services/               # Supabase storage, PDF, brain viz, inference dispatch
│   │   ├── utils/                  # File and signal processing helpers
│   │   └── api/v1/
│   │       ├── api.py              # Main API router
│   │       └── endpoints/          # auth, users, signals, processing, reports,
│   │                               #   admin, dev_admin, notifications, logs,
│   │                               #   contact, config
│   ├── inference/infer.py          # Celery tasks — preprocessing, ML, LLM report
│   ├── external/                   # Model wrappers, EDF utilities, PDR estimator
│   ├── scripts/                    # Admin/superuser creation, demo seeding
│   ├── migrate.py                  # Table creation + superuser bootstrap
│   ├── requirements.txt            # Python dependencies
│   └── .env.example                # Environment variables template
├── frontend/
│   └── src/
│       ├── pages/                  # Top-level page components
│       ├── components/             # Shared UI components
│       ├── contexts/               # Auth and demo React contexts
│       ├── services/               # API client
│       └── types/                  # Shared TypeScript types
├── main.js                         # Electron entry point
├── preload.js
├── docker-compose.yml
├── HOWTORUN.md                     # Development setup walkthrough
├── DESKTOP_BUILD_WINDOWS.md        # Windows desktop build guide
└── CLAUDE.md                       # Architecture notes for AI coding agents
```

## Getting Started

See **[HOWTORUN.md](HOWTORUN.md)** for the full development setup. In short, four components run
simultaneously — Redis, the FastAPI backend, a Celery worker, and the React frontend — and
`backend/.env` must be configured first.

No cloud account is required for local development — with `SUPABASE_URL` unset the backend
stores files on local disk and SQLite works as the database.

For the Windows desktop build, see **[DESKTOP_BUILD_WINDOWS.md](DESKTOP_BUILD_WINDOWS.md)**.

## API Documentation

Once the server is running:

- **Interactive API docs**: http://localhost:8000/api/v1/docs
- **ReDoc documentation**: http://localhost:8000/api/v1/redoc
- **OpenAPI schema**: http://localhost:8000/api/v1/openapi.json

## API Endpoints

The list below covers the main routes. See the interactive docs above for the complete, current set.

### Authentication

- `POST /api/v1/auth/login` — Login and get JWT token
- `POST /api/v1/auth/patient-login` — Patient login
- `GET /api/v1/auth/patient-portal/{token}` — Token-based patient portal access
- `GET /api/v1/auth/invite/{token}` — Look up a staff invitation
- `GET /api/v1/auth/me` — Get current user information
- `PUT /api/v1/auth/change-password` — Change user password
- `POST /api/v1/auth/logout` — Logout user

### Patient Management

- `POST /api/v1/users/` — Create a new patient
- `GET /api/v1/users/` — List patients (with search)
- `GET /api/v1/users/{user_id}` — Get patient details
- `PUT /api/v1/users/{user_id}` — Update patient
- `DELETE /api/v1/users/{user_id}` — Deactivate patient
- `GET /api/v1/users/{user_id}/files` — Get a patient's signal files
- `POST /api/v1/users/{user_id}/mark-report-sent` — Mark report as delivered
- `POST /api/v1/users/{user_id}/send-portal-email` — Email portal link to patient

### Signals

- `POST /api/v1/signals/upload` — Upload a signal file (triggers processing)
- `GET /api/v1/signals/files` — List uploaded files
- `GET /api/v1/signals/files/{file_id}` — Get file details
- `GET /api/v1/signals/files/{file_id}/signal-data` — Waveform data for the viewer
- `GET /api/v1/signals/files/{file_id}/events` — Detected events
- `GET /api/v1/signals/files/{file_id}/topomap` — Topographic map image
- `GET /api/v1/signals/files/{file_id}/inference-status` — Poll inference progress
- `GET /api/v1/signals/files/{file_id}/report-status` — Poll LLM report progress
- `PATCH /api/v1/signals/files/{file_id}/label` — Manually set Normal/Abnormal
- `GET|POST|DELETE /api/v1/signals/files/{file_id}/bookmarks` — Manage bookmarks
- `DELETE /api/v1/signals/files/{file_id}` — Delete a file

### Reports

- `POST /api/v1/reports/` — Create a report
- `GET /api/v1/reports/file/{file_id}` — Get the report for a file
- `PUT /api/v1/reports/{report_id}` — Update a report
- `GET /api/v1/reports/{report_id}/versions` — Version history
- `POST /api/v1/reports/{report_id}/versions/{version_id}/restore` — Restore a version
- `POST /api/v1/reports/{report_id}/generate-pdf` — Generate PDF
- `GET /api/v1/reports/{report_id}/download-pdf` — Download PDF

### Other routers

`/api/v1/admin`, `/api/v1/dev-admin`, `/api/v1/notifications`, `/api/v1/contact`, `/api/v1/logs`,
and `/api/v1/processing`.

## Supported File Types

- **EDF files** (.edf) — European Data Format for biomedical signals
- **CSV files** (.csv) — Comma-separated values
- **JSON files** (.json) — JavaScript Object Notation
- **TXT files** (.txt) — Plain text files

## Configuration

Configured through environment variables in `backend/.env`; see `backend/.env.example` for the full
template and `CLAUDE.md` for what each one does. Key options:

- `DATABASE_URL` — Postgres in deployment; SQLite works for local development
- `SECRET_KEY` — JWT signing key
- `REDIS_URL` — Celery broker
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — File storage; leave unset to use local disk
- `OPENAI_API_KEY`, `OPENAI_MODEL` — LLM report generation
- `MAX_FILE_SIZE`, `ALLOWED_FILE_TYPES`, `BACKEND_CORS_ORIGINS`

## Development

```bash
# Frontend tests
cd frontend && npm test

# Database — create missing tables, ensure dev superuser
cd backend && python migrate.py
```

The backend has no automated test suite yet, and no `black`/`mypy` configuration is checked in.

## License

This project is licensed under the MIT License.
