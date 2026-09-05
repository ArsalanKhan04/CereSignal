# CereSignal API

A FastAPI-based backend for brain signal processing and analysis. :)

## Features

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
- **Signal Processing**: FFT analysis, filtering, feature extraction, and spectral
  analysis.
- **Notifications**: In-app notification feed for report and processing events.
- **Database Storage**: SQLite (Postgres-compatible) for users, hospitals, files,
  signals, reports and processing results.
- **RESTful API**: Clean REST API with automatic documentation.

## Project Structure

The FastAPI application lives under `backend/app/`; the paths below are relative
to `backend/`.

```
backend/
├── app/
│   ├── main.py                 # FastAPI application entry point
│   ├── core/
│   │   ├── auth.py            # JWT and role dependencies
│   │   ├── config.py          # Configuration management
│   │   ├── database.py        # Database connection and session
│   │   ├── logging_config.py  # Logging setup
│   │   └── middleware.py      # Custom middleware
│   ├── models/                # SQLAlchemy models
│   │   ├── auth.py            # auth_users, user_sessions, UserType
│   │   ├── contact.py         # contact form submissions
│   │   ├── hospital.py        # hospitals, staff_invitations
│   │   ├── notification.py    # in-app notifications
│   │   ├── report.py          # eeg_reports and version history
│   │   ├── signal.py          # signal_files, signals, results
│   │   └── user.py            # patient records
│   ├── schemas/               # Pydantic schemas, one per model area
│   ├── api/
│   │   └── v1/
│   │       ├── api.py         # Main API router
│   │       └── endpoints/
│   │           ├── admin.py         # hospital admin: invites, staff, stats
│   │           ├── auth.py          # login, registration, invites, portal
│   │           ├── contact.py       # public contact form
│   │           ├── dev_admin.py     # cross-hospital superuser views
│   │           ├── logs.py          # client log ingestion
│   │           ├── notifications.py # notification feed
│   │           ├── processing.py    # signal processing endpoints
│   │           ├── reports.py       # reports, versions, PDF export
│   │           ├── signals.py       # file upload, plots, inference status
│   │           └── users.py         # patient management
│   ├── services/
│   │   ├── brain_viz_service.py   # topomap rendering
│   │   ├── eeg_cache_service.py   # decoded-signal cache
│   │   ├── email_service.py       # invitations and portal links
│   │   ├── inference_service.py   # queues the Celery inference task
│   │   ├── pdf_service.py         # report PDF generation
│   │   └── storage_service.py     # Supabase or local-disk file storage
│   └── utils/
│       ├── file_processing.py    # File handling utilities
│       └── signal_processing.py  # Signal processing utilities
├── inference/infer.py         # Celery tasks: preprocess, infer, draft report
├── external/                  # NeuroGate / NeuroTransformer wrappers + weights
├── migrate.py                 # Schema creation and --reset
├── scripts/seed_demo.py       # Demo data seeder (idempotent)
├── requirements.txt           # Python dependencies
└── .env.example               # Environment variables template
```

## Installation

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

To run things by hand, use the virtualenv's binaries directly; there is no
`cere_env` pyenv virtualenv:

```bash
cd backend
./cere_env/bin/uvicorn app.main:app --reload
```

## API Documentation

Once the server is running, you can access:

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

- `POST /signals/upload` - Upload a signal file (optional `patient_id`)
- `GET /signals/files` - List uploaded files (with patient filtering)
- `GET /signals/files/{file_id}` - File details
- `DELETE /signals/files/{file_id}` - Delete a file
- `GET /signals/files/{file_id}/download` - Download the original file
- `PATCH /signals/files/{file_id}/label` - Update the file's clinical label
- `GET /signals/files/{file_id}/signals` - Channel records for a file
- `GET /signals/files/{file_id}/signal-data` - Raw samples for plotting
- `GET /signals/files/{file_id}/plot-data` - Downsampled plot series
- `GET /signals/files/{file_id}/topomap` - Generated topomap image
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

- `POST /processing/process` - Process signal data
- `GET /processing/results` - Get processing results
- `GET /processing/results/{result_id}` - Get specific result
- `DELETE /processing/results/{result_id}` - Delete result

### Misc

- `POST /contact/` - Public contact form submission (unauthenticated)
- `POST /logs/client` - Ingest a frontend log entry

## Supported File Types

- **EDF files** (.edf) - European Data Format for biomedical signals
- **CSV files** (.csv) - Comma-separated values
- **JSON files** (.json) - JavaScript Object Notation
- **TXT files** (.txt) - Plain text files

## Processing Types

- **FFT** - Fast Fourier Transform analysis
- **Filter** - Signal filtering (lowpass, highpass, bandpass)
- **Feature Extraction** - Statistical and signal features
- **Spectral Analysis** - Power spectral density analysis

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

There is currently **no backend test suite and no linter configuration** — no
`tests/` directory, and no pytest/black/mypy in any requirements file. Earlier
versions of this README documented `pytest`, `black app/ tests/` and `mypy app/`;
none of those work today.

The frontend has tests: `npm --prefix frontend test`.

## Configuration

The application can be configured through environment variables. See `.env.example` for available options.

Key configuration options:
- `DATABASE_URL` - Database connection string
- `MAX_FILE_SIZE` - Maximum file upload size
- `ALLOWED_FILE_TYPES` - Allowed file extensions
- `BACKEND_CORS_ORIGINS` - CORS allowed origins

## License

This project is licensed under the MIT License.
