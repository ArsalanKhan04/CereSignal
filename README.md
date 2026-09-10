# CereSignal

A full-stack medical EEG analysis platform. Clinicians upload EDF recordings; CereSignal runs them
through two pre-trained PyTorch models, generates clinical report text with an LLM, and presents the
results alongside an interactive EEG viewer.

It ships as a multi-tenant web application (Railway + Supabase) and as a Windows desktop app
(Electron + PyInstaller).

## Features

- **EEG analysis**: NeuroGate (Normal/Abnormal classification) and NeuroTransformer
  (per-channel spike/slow-wave detection), plus posterior dominant rhythm
  estimation and topographic maps.
- **AI report drafting**: Factual report and impression text generated via the
  OpenAI API, editable by the clinician before sign-off.
- **Interactive EEG viewer**: Plotly-based waveform display with bookmarks,
  focus-point navigation and fullscreen review.
- **Multi-tenant hospitals**: Every staff account carries a `hospital_id`, and
  the API scopes patients, files and reports to the caller's hospital. A hospital
  is created by its first admin through `POST /auth/register/hospital`.
- **Staff invitations**: Hospital admins invite doctors and technicians by email;
  the invite is a single-use token with an expiry, redeemed at
  `POST /auth/register/invite/{token}`.
- **Roles**: `doctor`, `technician`, `patient` and `admin` (the `UserType` enum in
  `app/models/auth.py`), enforced through JWT middleware. A separate
  `is_superuser` flag gates the cross-hospital dev-admin views.
- **JWT Authentication**: Token-based auth over two tables — `auth_users` holds
  credentials and staff profile, `users` holds patient records.
- **Patient portal**: Patients sign in with a patient ID or an emailed portal link
  and see only their own studies.
- **File Upload**: EDF, CSV, JSON and TXT signal files, associated with a patient.
- **EEG Data Storage**: Channel metadata extracted with MNE on upload, plus
  bookmarks and per-file event annotations.
- **Clinical reports**: Draft reports with full version history, restore, and
  PDF export.
- **Signal Processing**: A separate synchronous DSP path — FFT analysis, filtering,
  feature extraction and spectral analysis — distinct from the ML pipeline above.
- **Notifications**: In-app notification feed for report and processing events.
- **Database Storage**: SQLAlchemy over SQLite locally and Postgres (Supabase) in
  deployment, for users, hospitals, files, signals, reports and processing results.
- **RESTful API**: Clean REST API with automatic documentation.

## Architecture

Analysis is asynchronous. The upload endpoint does the fast work inline and hands the rest to a
Celery worker over Redis; the frontend polls for completion. `CLAUDE.md` documents each stage in
detail.

1. The frontend uploads an EDF/CSV/JSON/TXT file to `POST /api/v1/signals/upload`.
2. The backend stores it through `storage_service` (Supabase, or local disk when `SUPABASE_URL`
   is unset), parses the EDF channels with MNE and saves the metadata.
3. The same handler calls `inference_service.start_inference()`, which queues the
   `preprocess_edf` Celery task.
4. `preprocess_edf` converts the recording, uploads `<name>_processed.edf` for the viewer, then
   chains to `infer`.
5. `infer` runs the two models in sequence — **NeuroGate** (21-channel Normal/Abnormal
   classification) then **NeuroTransformer** (per-channel normal/spike/slow-wave) — computes
   focus points and the posterior dominant rhythm, builds the regional report and renders the
   topographic map.
6. `generate_report` calls the OpenAI API to draft the factual report and impression. Without
   `OPENAI_API_KEY`, inference still completes and the report text is left blank for manual entry.
7. The frontend polls `GET /signals/files/{id}/inference-status` and `/report-status`, then
   renders the EEG viewer and the report.

Setting `AI_INFERENCE_ENABLED=False` skips steps 5 and 6 entirely and runs the platform as a
manual-entry system; files still upload and still pass through `preprocess_edf` for the viewer.

## Project Structure

```
CereSignal/
├── scripts/                       # setup.sh, redis-start.sh, backend-start.sh,
│                                  #   worker-start.sh, stop.sh
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI application entry point
│   │   ├── core/
│   │   │   ├── auth.py            # JWT and role dependencies
│   │   │   ├── config.py          # Configuration management
│   │   │   ├── database.py        # Database connection and session
│   │   │   ├── logging_config.py  # Logging setup
│   │   │   └── middleware.py      # Custom middleware
│   │   ├── models/                # SQLAlchemy models
│   │   │   ├── auth.py            # auth_users, user_sessions, UserType
│   │   │   ├── contact.py         # contact form submissions
│   │   │   ├── hospital.py        # hospitals, staff_invitations
│   │   │   ├── notification.py    # in-app notifications
│   │   │   ├── report.py          # eeg_reports and version history
│   │   │   ├── signal.py          # signal_files, signals, results
│   │   │   └── user.py            # patient records
│   │   ├── schemas/               # Pydantic schemas, one per model area
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── api.py         # Main API router
│   │   │       └── endpoints/
│   │   │           ├── admin.py         # hospital admin: invites, staff, stats
│   │   │           ├── auth.py          # login, registration, invites, portal
│   │   │           ├── contact.py       # public contact form
│   │   │           ├── dev_admin.py     # cross-hospital superuser views
│   │   │           ├── logs.py          # client log ingestion
│   │   │           ├── notifications.py # notification feed
│   │   │           ├── processing.py    # signal processing endpoints
│   │   │           ├── reports.py       # reports, versions, PDF export
│   │   │           ├── signals.py       # file upload, plots, inference status
│   │   │           └── users.py         # patient management
│   │   ├── services/
│   │   │   ├── brain_viz_service.py   # topomap rendering
│   │   │   ├── eeg_cache_service.py   # decoded-signal cache
│   │   │   ├── email_service.py       # invitations and portal links
│   │   │   ├── inference_service.py   # queues the Celery inference task
│   │   │   ├── pdf_service.py         # report PDF generation
│   │   │   └── storage_service.py     # Supabase or local-disk file storage
│   │   └── utils/
│   │       ├── file_processing.py     # File handling utilities
│   │       └── signal_processing.py   # Signal processing utilities
│   ├── inference/infer.py         # Celery tasks: preprocess, infer, draft report
│   ├── external/                  # NeuroGate / NeuroTransformer wrappers + weights
│   ├── migrate.py                 # Schema creation and --reset
│   ├── scripts/                   # create_admin.py, seed_demo.py (idempotent)
│   ├── requirements.txt           # Python dependencies
│   └── .env.example               # Environment variables template
├── frontend/
│   └── src/
│       ├── pages/                 # Top-level page components
│       ├── components/            # Shared UI components
│       ├── contexts/              # Auth and demo React contexts
│       ├── services/              # API client
│       └── types/                 # Shared TypeScript types
├── main.js                        # Electron entry point
├── preload.js
├── docker-compose.yml
├── HOWTORUN.md                    # Development setup walkthrough
├── DESKTOP_BUILD_WINDOWS.md       # Windows desktop build guide
└── CLAUDE.md                      # Architecture notes for AI coding agents
```

## Getting Started

From the repository root:

```bash
./scripts/setup.sh
```

This creates the `backend/cere_env` virtualenv, installs dependencies, writes
`backend/.env` from the example and generates a `SECRET_KEY`. It is safe to
re-run.

Then start the backend (it migrates the schema and seeds demo data first):

```bash
./scripts/backend-start.sh
```

The full four-component setup — Redis, backend, Celery worker and frontend —
is documented in [HOWTORUN.md](HOWTORUN.md).

No cloud account is required for local development — with `SUPABASE_URL` unset
the backend stores files on local disk and SQLite works as the database.

To run things by hand, use the virtualenv's binaries directly; there is no
`cere_env` pyenv virtualenv:

```bash
cd backend
./cere_env/bin/uvicorn app.main:app --reload
```

For the Windows desktop build, see
**[DESKTOP_BUILD_WINDOWS.md](DESKTOP_BUILD_WINDOWS.md)**.

## API Documentation

Once the server is running:

- **Interactive API docs**: http://localhost:8000/api/v1/docs
- **ReDoc documentation**: http://localhost:8000/api/v1/redoc
- **OpenAPI schema**: http://localhost:8000/api/v1/openapi.json

## API Endpoints

All paths are relative to `/api/v1`. Most require a bearer token; the login,
registration, invite-validation and patient-portal routes below do not, nor do
`/contact/` and `/logs/client`. `/api/v1/docs` is the authoritative list — the
padlock icon there marks which routes carry an auth dependency.

> Note that `POST /auth/register` creates a staff account and requires an
> **admin** token, unlike the other `/auth/register/*` routes.

### Authentication

- `POST /auth/login` - Login and get a JWT
- `POST /auth/patient-login` - Patient login by patient ID
- `GET /auth/patient-portal/{token}` - Exchange an emailed portal link for a token
- `POST /auth/register` - Register an authentication user
- `POST /auth/register/hospital` - Create a hospital and its first admin
- `POST /auth/register/patient` - Self-registration for patients
- `GET /auth/invite/{token}` - Validate a staff invitation token
- `POST /auth/register/invite/{token}` - Redeem an invitation and create the account
- `GET /auth/me` - Current user information
- `GET /auth/doctors` - Doctors in the caller's hospital
- `PUT /auth/change-password` - Change password
- `POST /auth/logout` - Logout

### Hospital Administration (admin role)

- `POST /admin/invite` - Invite a doctor or technician by email
- `GET /admin/invitations` - List outstanding invitations
- `DELETE /admin/invitations/{invitation_id}` - Revoke an invitation
- `GET /admin/staff` - List hospital staff
- `PUT /admin/staff/{user_id}/toggle-active` - Enable or disable a staff account
- `GET /admin/stats` - Hospital dashboard statistics

### Dev Admin (superuser, cross-hospital)

- `GET /dev-admin/stats` - Global statistics across all hospitals
- `GET /dev-admin/hospitals` - List hospitals
- `GET /dev-admin/hospitals/{hospital_id}` - Hospital detail
- `GET /dev-admin/hospitals/{hospital_id}/download` - Bulk export a hospital
- `GET /dev-admin/hospitals/{hospital_id}/files/{file_id}/download` - Download a file
- `GET /dev-admin/hospitals/{hospital_id}/reports/{report_id}/download` - Download a report
- `GET /dev-admin/contacts` - Contact form submissions
- `PUT /dev-admin/contacts/{contact_id}/read` - Toggle read state

### Patient Management

- `POST /users/` - Create a new patient
- `GET /users/` - List patients (with search)
- `GET /users/{user_id}` - Patient details
- `PUT /users/{user_id}` - Update patient information
- `DELETE /users/{user_id}` - Deactivate patient
- `GET /users/{user_id}/files` - Patient's signal files
- `POST /users/{user_id}/send-portal-email` - Email the patient a portal link
- `POST /users/{user_id}/mark-report-sent` - Record that a report was sent

### Signal Management

- `POST /signals/upload` - Upload a signal file (optional `patient_id`, triggers processing)
- `GET /signals/files` - List uploaded files (with patient filtering)
- `GET /signals/files/{file_id}` - File details
- `DELETE /signals/files/{file_id}` - Delete a file
- `GET /signals/files/{file_id}/download` - Download the original file
- `PATCH /signals/files/{file_id}/label` - Update the file's clinical label
- `GET /signals/files/{file_id}/signals` - Channel records for a file
- `GET /signals/files/{file_id}/signal-data` - Raw samples for plotting
- `GET /signals/files/{file_id}/plot-data` - Downsampled plot series
- `GET /signals/files/{file_id}/topomap` - Generated topomap image (`<recording_basename>_topomap.png`)
- `GET /signals/files/{file_id}/events` - Detected events
- `GET /signals/files/{file_id}/inference-status` - Poll the ML inference task
- `GET /signals/files/{file_id}/report-status` - Poll the report drafting task
- `GET /signals/files/{file_id}/bookmarks` - List bookmarks
- `POST /signals/files/{file_id}/bookmarks` - Create a bookmark
- `DELETE /signals/files/{file_id}/bookmarks/{bookmark_id}` - Delete a bookmark
- `GET /signals/stats` - Dashboard counts

### Reports

- `POST /reports/` - Create a report
- `GET /reports/` - List reports
- `GET /reports/{report_id}` - Report details
- `PUT /reports/{report_id}` - Update a report (creates a new version)
- `DELETE /reports/{report_id}` - Delete a report
- `GET /reports/file/{file_id}` - The report for a given signal file
- `GET /reports/{report_id}/versions` - Version history
- `GET /reports/{report_id}/versions/{version_id}` - A single version
- `POST /reports/{report_id}/versions/{version_id}/restore` - Restore a version
- `POST /reports/{report_id}/generate-pdf` - Queue PDF generation
- `GET /reports/{report_id}/pdf-status` - Poll PDF generation
- `GET /reports/{report_id}/download-pdf` - Download the PDF

### Notifications

- `GET /notifications/` - Notification feed
- `POST /notifications/{notification_id}/read` - Mark as read

### Signal Processing

A synchronous DSP path, separate from the ML inference pipeline described under
[Architecture](#architecture) and not used by the frontend.

- `POST /processing/process` - Process signal data
- `GET /processing/results` - Get processing results
- `GET /processing/results/{result_id}` - Get specific result
- `DELETE /processing/results/{result_id}` - Delete result

Operations accepted by `POST /processing/process`:

- **FFT** - Fast Fourier Transform analysis
- **Filter** - Signal filtering (lowpass, highpass, bandpass)
- **Feature Extraction** - Statistical and signal features
- **Spectral Analysis** - Power spectral density analysis

### Misc

- `POST /contact/` - Public contact form submission (unauthenticated)
- `POST /logs/client` - Ingest a frontend log entry

## Supported File Types

- **EDF files** (.edf) - European Data Format for biomedical signals
- **CSV files** (.csv) - Comma-separated values
- **JSON files** (.json) - JavaScript Object Notation
- **TXT files** (.txt) - Plain text files

## Configuration

Configured through environment variables in `backend/.env`; see `backend/.env.example` for the full
template and `CLAUDE.md` for what each one does. Key options:

- `DATABASE_URL` — Postgres in deployment; SQLite works for local development
- `SECRET_KEY` — JWT signing key
- `REDIS_URL` — Celery broker
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — File storage; leave unset to use local disk
- `OPENAI_API_KEY`, `OPENAI_MODEL` — LLM report generation
- `AI_INFERENCE_ENABLED` — set `False` for a manual-entry-only deployment (no models, no LLM)
- `MAX_FILE_SIZE`, `ALLOWED_FILE_TYPES`, `BACKEND_CORS_ORIGINS`

## Development

### Database

No Alembic — `backend/migrate.py` is the whole migration system.

```bash
cd backend
./cere_env/bin/python migrate.py            # create missing tables
./cere_env/bin/python migrate.py --reset    # DESTRUCTIVE: drop and recreate
./cere_env/bin/python -m scripts.seed_demo  # demo data (idempotent)
```

Or `./scripts/backend-start.sh --fresh` to reset, re-seed and serve in one step.

### Tests and linting

```bash
./scripts/test.sh              # both suites
./scripts/test.sh --backend    # pytest only
./scripts/test.sh --frontend   # jest only
./scripts/test.sh --cov        # with coverage
```

Neither suite needs Redis, a Celery worker, a `.env` file, the model weights or a
network connection. The backend suite builds its own in-memory SQLite database and
never touches `backend/cere_signal.db`.

Run either directly if you prefer:

```bash
cd backend && ./cere_env/bin/python -m pytest    # backend
npm --prefix frontend test                       # frontend, watch mode
```

`.github/workflows/test.yml` runs both on every pull request. It needs no secrets
and no database, unlike the two dormant migration workflows.

Backend tests live in `backend/tests/` (config in `backend/pytest.ini`, dependencies
in `backend/requirements-dev.txt`). Frontend tests sit next to the code they cover
as `*.test.ts`.

A handful of tests are marked `xfail(strict=True)`. Those assert how a route or
function *should* behave and fail today because it does not — each one names the
defect it pins, and fixing the defect makes the test pass, which `strict` reports as
a failure so the marker gets removed rather than forgotten.

There is still **no linter configuration** — no black/mypy/ruff in any requirements
file. Earlier versions of this README documented `black app/ tests/` and `mypy app/`;
those still do not work.

## License

This project is licensed under the MIT License.
