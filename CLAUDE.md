# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CereSignal is a full-stack medical EEG analysis platform. It processes EDF files through two
pre-trained PyTorch models (NeuroGate + NeuroTransformer) and generates clinical report text via
the OpenAI API. It is a multi-tenant SaaS deployed on Railway, with Supabase for Postgres and file
storage; local development needs no cloud account. A Windows desktop build (Electron + PyInstaller)
also exists.

## Development Setup

One-time: `./scripts/setup.sh` (creates `backend/cere_env`, installs deps, writes `backend/.env`). Idempotent.

Four components must run simultaneously, one per terminal:

```bash
./scripts/redis-start.sh         # Redis broker
./scripts/backend-start.sh       # migrates + seeds demo data, then uvicorn on :8000
./scripts/worker-start.sh        # Celery worker (preprocessing + ML inference)
npm --prefix frontend run dev    # React frontend on :3000
```

`./scripts/stop.sh` stops all three backend components. `./scripts/backend-start.sh --fresh` drops every table, clears uploaded files/plots/logs, and re-seeds (typed confirmation; `--yes` to skip).

Seeded demo login: `admin` / `password`

There is **no** `cere_env` pyenv virtualenv — the environment is `backend/cere_env/`, and the scripts call its binaries directly rather than activating anything. The backend and worker must run with `backend/` as cwd: `inference/infer.py` resolves model weights relative to the current directory and `DATABASE_URL` is cwd-relative.

`docker compose up` is the containerised equivalent of all four, once `./scripts/setup.sh` has written `backend/.env`. The backend and worker services both bind-mount `./backend`, so they share the same `cere_signal.db` and `local_storage/` as the scripts above — the worker resolves the storage object paths it receives over Redis against its own filesystem, so they must.

Access points: Frontend → `localhost:3000`, API → `localhost:8000`, Docs → `localhost:8000/api/v1/docs`

**Storage backend is chosen automatically.** `app/services/storage_service.py` uses Supabase when
`SUPABASE_URL` is set and local disk (`backend/local_storage/`) when it isn't, so no cloud account
is needed for local development. The seeded `admin` / `password` account is the normal way in;
`python backend/scripts/create_admin.py` creates a real hospital and admin instead.

**Nothing in storage is public.** Recordings, report PDFs and topomaps are only reachable through
authenticated API routes. Bookmark screenshots are the one thing a browser loads directly (an
`<img src>` cannot send the bearer token), so they go out as a one-hour signed URL from
`storage_service.signed_url()`: Supabase's `create_signed_url` in deployment, or locally an HMAC
over the path and expiry, keyed with `SECRET_KEY`, which `main.py` checks on
`/static/eeg-assets/...`. That route replaced a `StaticFiles` mount over the whole of
`local_storage`, which used to serve every EDF and PDF to anyone who could guess a path. Never
reintroduce a public URL; `get_public_url()` was the original storage leak, fixed 2026-09-11.

**The API will not start without a real `SECRET_KEY`.** `create_application()` raises on an empty
key or on either placeholder that has ever shipped (`PLACEHOLDER_SECRET_KEYS` in
`app/core/config.py`), since anyone who knows the key can mint a JWT for any account.
`./scripts/setup.sh` generates one. The worker and `migrate.py` don't need one.

## Common Commands

```bash
# Frontend (from repo root)
npm --prefix frontend run dev            # dev server
npm --prefix frontend run build          # web production build
npm --prefix frontend run build:desktop  # Electron desktop build

# Tests (from repo root)
./scripts/test.sh                        # both suites
./scripts/test.sh --backend -k tenancy   # extra args pass through to pytest
./scripts/test.sh --cov                  # with coverage

# Database (from backend/)
./cere_env/bin/python migrate.py            # create missing tables
./cere_env/bin/python migrate.py --reset    # DESTRUCTIVE: drop and recreate
./cere_env/bin/python -m scripts.seed_demo  # demo data, idempotent

# Verify Celery worker is alive (from backend/)
./cere_env/bin/celery -A inference.infer inspect ping
```

The frontend scripts set `NODE_OPTIONS=--max-old-space-size=6144`; invoking `react-scripts` directly hits Node's 2 GB default and runs out of heap.

**Tests: `./scripts/test.sh`.** pytest for the backend (`backend/tests/`, config in
`backend/pytest.ini`, deps in `backend/requirements-dev.txt`) and CRA's jest for the frontend
(`frontend/src/**/*.test.ts`). Neither suite needs Redis, a worker, a `.env`, the model weights
or a network connection — the backend builds its own in-memory SQLite database and never touches
`backend/cere_signal.db`. `.github/workflows/test.yml` runs both on every PR. Run the backend
suite directly with `cd backend && ./cere_env/bin/python -m pytest`.

**Linting: `./scripts/test.sh --lint`.** ruff for the backend (pinned `ruff==0.16.7` in
`requirements-dev.txt`, configured in `backend/pyproject.toml`), plus `tsc --noEmit` and
`eslint --max-warnings 0` for the frontend (`npm run typecheck` / `npm run lint`). All three
are blocking in CI — ruff in its own `Lint (ruff)` job, the other two folded into the
frontend job. The pin is exact on purpose: ruff 0.16 widened its default `select`, so an
unpinned ruff can turn a green gate red on an unrelated PR.

Four things in that config are deliberate and should not be "fixed":

- **`E501` (line-too-long) is not selected** — 299 hits, none of them defects.
- **`E711`/`E712` are ignored.** `Model.col == True` inside `.filter()` builds a SQL clause;
  ruff's rewrite to `not Model.col` changes the query.
- **`B008` is defused via `extend-immutable-calls`.** FastAPI's whole dependency system lives
  in default arguments, so it otherwise fires 146 times on `= Depends(...)`.
- **`app/models/__init__.py` is exempt from `F401` and `I001`.** Those imports are what
  register the ten tables on `Base.metadata`, and the file documents its own required order.

**There is still no formatter and no type-checker for Python.** No black, no prettier, no
mypy. `ruff format` is deliberately not used: it would rewrite ~95 files for no
defect-detection value and destroy `git blame`, which here is audit evidence. `bandit` is
also unnecessary — ruff's `S` ruleset *is* flake8-bandit and is already enabled.

**Frontend component tests use React Testing Library over a mocked axios instance.**
`axios-mock-adapter` is attached to the real client (`new MockAdapter(apiClient.client)`),
never `jest.mock('../services/api')` — `services/api.ts` is 558 lines and its interceptors
(bearer-token injection, and the 401 handler that clears credentials and redirects *except*
on `/auth/login`) are the most security-relevant code on the frontend. Mocking the module
out would test none of it. msw is deliberately not used: it is ESM-first and needs a
`transformIgnorePatterns` override plus jsdom polyfills under CRA 5 / jest 27.

Four things that will bite when writing a new frontend test:

- **`react-scripts` sets jest's `resetMocks: true`.** `jest.fn(() => 'value')` loses its
  implementation between tests, silently returning `undefined`. Set it in `beforeEach` with
  `mockImplementation` instead.
- **`window.location` is stubbed in `src/setupTests.ts`** and its `href` must stay an
  absolute URL — axios evaluates `new URL(window.location.href)` at import.
- **`jest.requireActual('react-router-dom')` does not work**: it bypasses the
  `moduleNameMapper` in `package.json` and fails to resolve `react-router/dom`. Assert on
  real routing with `MemoryRouter` + `Routes` rather than mocking `useNavigate`.
- **`TextEncoder`/`TextDecoder` are polyfilled** in `setupTests.ts`; jsdom under jest 27
  ships neither and react-router's dev build needs them at import.

**Coverage has a floor.** `fail_under = 68` lives in `backend/.coveragerc`, so
`./scripts/test.sh --cov` and CI enforce the identical number and it can only ratchet up.
It is in `.coveragerc` rather than `pytest.ini` addopts on purpose: `.coveragerc` is inert
unless `--cov` is passed, so a plain `pytest` pays no tracing overhead. `external/models/*`
is omitted alongside the submodules — those two files need torch, which CI deliberately does
not install, so measuring them pinned the floor ~3 points below the honest number. Caveat:
`./scripts/test.sh --cov -k <subset>` will trip the floor; escape with `--cov-fail-under=0`.

`xfail(strict=True)` is the house convention for pinning a defect that is found but not yet
fixed: the test asserts the behaviour a route *should* have, fails today, and turns into an
XPASS — which `strict` reports as a failure — the moment the bug is fixed, so the marker cannot
be left behind. **There are four right now, all in `tests/test_pdr.py`**, covering two defects
in `external/pdr.py`: `fit()` raises `ValueError` for any `sfreq <= 140` (a 70 Hz filter cutoff
above Nyquist — 100 Hz and 128 Hz are ordinary clinical rates, and production only escapes it
because `inference/infer.py:301` hardcodes 200), and the RMS z-score channel rejection discards
O1/O2 precisely when they carry a strong posterior rhythm, so clean alpha reports as
"Not well-formed" while adding unrelated noise to another channel makes it succeed.

## Architecture

### Request Flow
1. Frontend uploads EDF/CSV/JSON/TXT → `POST /api/v1/signals/upload`
2. Backend stores the file via `storage_service` (`save_uploaded_file` in
   `app/utils/file_processing.py`), parses EDF channels with MNE, and saves metadata to the database
3. The same upload handler starts inference (`signals.py` → `inference_service.start_inference`),
   queueing the `preprocess_edf` Celery task via Redis
4. `preprocess_edf` (`backend/inference/infer.py`) converts the EDF, uploads `<name>_processed.edf`
   for the viewer, then chains to the `infer` task
5. `infer` runs the two models sequentially:
   - **NeuroGate** — 21-channel binary classifier (Normal/Abnormal + probability)
   - **NeuroTransformer** — per-channel 3-class classifier (normal/spike/slow wave)
6. It then computes focus points and PDR, builds a regional report, generates a topomap image, and
   queues the `generate_report` task
7. `generate_report` calls the OpenAI Chat Completions API (`OPENAI_MODEL`, default `gpt-4o-mini`)
   to write the factual report and impression. Without `OPENAI_API_KEY` set, the same client
   points at Ollama's OpenAI-compatible API (`OLLAMA_BASE_URL`) and uses `OLLAMA_MODEL`, or
   when that is empty the most recently pulled non-embedding model. If that fails too,
   inference still completes and the report text is left blank for manual entry.
   `GET /signals/files/{id}/report-status` treats that blank text as `failed` rather
   than as a finished report, so the form shows the failure instead of announcing a
   report it never received
8. Results are saved to the database; the frontend polls
   `GET /signals/files/{id}/inference-status` and `/report-status`, then displays the EEG
   visualization and report

Note: inference is triggered by the upload endpoint, not by a separate process call. The
`/api/v1/processing/*` router that used to sit alongside it was deleted — it was unauthenticated,
unreferenced by the frontend and untouched since the initial restructure.

### Known Data Issues

The sample EDFs are miscalibrated, which changes how model output should be read:

- **Physical dimension is `uM`, not `uV`.** MNE does not recognise `uM`, so it skips its own
  µV→V conversion and `raw.get_data()` returns physical units directly. `process_edf`'s
  `data * 1e-6` in `backend/external/edf_preprocess.py` is correct *because* of this — it is
  not redundant, and a genuine `uV` file would be scaled to nothing by it. Check the header
  before touching that line.
- **Amplitudes land ~100× below real EEG** (~0.12 µV rms). The cause is the source
  calibration — physical full scale ±56 against digital ±32768, with the data occupying about
  0.3% of the range — not the preprocessing; the average re-reference costs only 1.4×.
- **NeuroTransformer is sharply scale-dependent**, so this suppresses spike detection
  entirely: 65 spikes are found at argmax but none survive `preds[confidence < 0.9] = 0`.
  At ×100 the same recording yields 121. Treat "no spike waves" as a calibration artefact
  rather than a clinical finding until the calibration is resolved.

Two structural quirks in the sample files, both repaired by `process_edf`: the channel count is
mis-declared (24 in the header, 26 in reality — hence the reshape), and `signals` table rows
keep the *raw* upload's metadata, so their duration and channel names do not match the
processed EDF the viewer actually plots.

### Access Control
`app/core/access.py` is the single source of truth for which signal files and reports a user may
reach. `visible_signal_files()` / `visible_reports()` return a scoped query (used by the list and
stats endpoints); `get_accessible_file` / `get_accessible_report` are the FastAPI dependencies that
resolve a path param to a row, raising 404 when it is out of scope — 403 only when the row is inside
the caller's own hospital but assigned to another doctor, so a sequential id cannot be used to probe
another hospital. `forbid_patients()` adds the write denials, because read access does not imply
write access. Put new per-file or per-report routes behind these rather than re-deriving the rule;
four hand-copied copies of the check had already drifted apart, and none compared `hospital_id`.

Patient records (`users` rows) have the same pair: `visible_patients()` and the
`get_accessible_patient` dependency, which every `/users/{user_id}` route and the upload handler's
`patient_id` lookup go through. The rule is the file rule, with one difference: admins see their
whole hospital's patients, as technicians do. Doctors see their own and unassigned patients. The
checks this replaced used `if current_user.hospital_id and ...`, which skipped the hospital
comparison entirely for staff with no hospital.

Note `hospital_id` is nullable on every model that carries it, and `col == None` compiles to
`IS NULL` — so the helpers deliberately return nothing for a non-superuser whose own `hospital_id`
is unset, rather than matching every orphan row.

### Multi-Tenancy
- `hospitals` and `staff_invitations` tables (`app/models/hospital.py`)
- Staff are onboarded by invitation; `auth_users.hospital_id` scopes data access to one hospital
- `auth_users.is_superuser` grants cross-hospital access via the dev-admin portal
  (`app/api/v1/endpoints/dev_admin.py`, gated by the `get_current_superuser` dependency)

### Authentication
- Two separate tables: `auth_users` (credentials) and `users` (patient/contact info)
- Patients enter through `GET /auth/patient-portal/{token}`, which exchanges the unguessable
  `users.portal_token` for a JWT. There is no login-by-patient-id endpoint; the old
  `POST /auth/patient-login` took a bare integer and was removed
- Four roles in `UserType` (`app/models/auth.py`): `doctor`, `technician`, `patient`, `admin` —
  enforced via JWT middleware, plus the separate `is_superuser` flag above
- Tokens expire in 30 min (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Desktop mode does **not** disable auth. `DESKTOP_MODE` is currently inert (see below), so JWT
  auth is enforced in every mode

### Desktop Mode
`main.js` (Electron) spawns the PyInstaller-bundled backend subprocess via `backend/entry_point.py`.
Logs go to `AppData/Roaming`.

**Desktop mode is unimplemented** — every switch for it is currently inert:
- `DESKTOP_MODE` reaches the backend (`main.js:51`) but `backend/entry_point.py:35` assigns `IS_DESKTOP_MODE` and never reads it. Auth is not bypassed.
- `REACT_APP_DESKTOP` is never read anywhere in `frontend/src`, and it is a build-time variable, so setting it on `electron .` cannot change an already-built bundle.
- `frontend/src/pages/DesktopWorkspace.tsx` exists but is never imported or routed, so `/` renders the normal `LoginPage`.
- `main.js:67-70` skips the Celery worker in desktop mode, but there is no synchronous inference path — `app/services/inference_service.py:44` always dispatches `preprocess_edf.delay(...)`. With no worker consuming the queue, processing would never complete.
- The unpackaged path spawns `cere-engine.exe` (`main.js:33`, `:76`), so it is Windows-only regardless.

### Deployment
Railway, three services, each with its own config:

| Config | Service |
|--------|---------|
| `backend/railway.toml` | FastAPI API |
| `backend/railway.worker.toml` | Celery worker |
| `frontend/railway.toml` | React frontend |

**Both GitHub workflows are dormant.** The Supabase project they targeted no longer exists —
every run of `.github/workflows/migrate.yml` since 2026-09-05 failed with
`FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`, so its push-to-`main` trigger was
removed. It and `reset-db.yml` are now manual-dispatch only, and a dispatch still fails at the
connection until there is a live database. To re-arm: set the `DATABASE_URL` secret to a live
Postgres URL, set `SUPERUSER_PASSWORD` (unset means `migrate.py` creates the tables and skips
the superuser), and restore migrate.yml's `push: branches: [main]` trigger. Nothing else in
either workflow is broken — they ran green 39 times through 2026-05-15.

**When Supabase storage is re-attached, make the `eeg-assets` bucket private** (Storage → bucket
settings; it's free). The code no longer relies on it being public — bookmark images are signed
URLs — but a bucket left public still serves every object to anyone who knows its path. `eeg-signals`
must stay private too.

## Security Scanning

Five mechanisms, none of which cost anything on a public repo:

| Mechanism | Where | Blocking |
|-----------|-------|----------|
| `pip-audit` | `Backend (pytest)` job, before pytest | yes |
| ruff `S` (flake8-bandit) | `Lint (ruff)` job | yes |
| CodeQL | GitHub **default setup** (repo settings, no workflow file) | yes, once required |
| Secret scanning + push protection | GitHub native, repo settings | push protection blocks |
| Dependabot | `.github/dependabot.yml`, weekly, grouped | no — opens PRs |

**`npm audit` is deliberately not a gate.** react-scripts 5.0.1 carries 64 advisories
(12 low / 17 moderate / 31 high / 4 critical) and `--omit=dev` returns an *identical* count,
because CRA ships `react-scripts` in `dependencies`. 28 of them resolve only to
"upgrade react-scripts to 0.0.0 (semver-major)" — eject. A permanently red list trains people
to ignore it, so Dependabot handles the fixable subset instead. Do not re-add it.

**`pip-audit` audits the installed environment, not `-r requirements.txt`** — that file is
largely unpinned, so `-r` makes pip-audit resolve its own set rather than auditing what the
tests actually ran against. It carries exactly one ignore, and it is load-bearing rather than
convenient: `PYSEC-2026-1325` (ecdsa, Minerva P-256 timing) has **no upstream fix and won't
get one**. `ecdsa` arrives transitively via `python-jose`; `app/core/auth.py` sets
`ALGORITHM = "HS256"` and decodes with `algorithms=["HS256"]`, so no ECDSA path is reachable.
The CI step upgrades `setuptools>=83.0.0` first, which clears the only other finding.

**gitleaks is not used.** GitHub's native secret scanning is free here and covers every
partner token this app handles (OpenAI, Supabase, Resend). It would not have caught the
`SECRET_KEY` default — but neither would gitleaks usefully, since its generic-entropy rules
are its noisiest and this repo commits 1.8 MB and 3.9 MB binary model weights. That gap is
closed precisely instead, by `PLACEHOLDER_SECRET_KEYS` in `app/core/config.py` and the
`TestSecretKeyIsRequired` tests, which are parametrized off that set so a newly added
placeholder is covered automatically.

**Workflows alone only report.** What actually makes a check blocking is the branch ruleset
on `main` requiring `Lint (ruff)`, `Backend (pytest)`, `Frontend (jest)` and `CodeQL`.

## Key Files

| Path | Purpose |
|------|---------|
| `scripts/` | Dev workflow — `setup.sh`, `redis-start.sh`, `backend-start.sh`, `worker-start.sh`, `stop.sh` |
| `backend/migrate.py` | Table creation + superuser bootstrap (`--reset` to drop). No Alembic — this is the whole migration system |
| `backend/scripts/` | Admin/superuser creation, plus `seed_demo.py` (idempotent demo data) |
| `backend/app/main.py` | FastAPI app, router registration, CORS config |
| `backend/app/models/` | SQLAlchemy ORM models (auth, user, hospital, signal, report, notification, contact) |
| `backend/app/core/access.py` | Tenant/role scoping — the shared file, report and patient access dependencies |
| `backend/app/api/v1/endpoints/` | Route handlers (auth, users, signals, reports, admin, dev_admin, notifications, logs, contact, config) |
| `backend/app/services/` | Storage (Supabase or local disk), PDF generation, brain visualization, inference dispatch |
| `backend/inference/infer.py` | Celery tasks — preprocessing, ML pipeline, LLM report |
| `backend/external/` | NeuroGate/NeuroTransformer model wrappers, EDF utilities |
| `frontend/src/pages/` | Top-level page components |
| `frontend/src/components/` | Shared UI components |
| `frontend/src/contexts/` | Auth and demo React contexts |
| `main.js` | Electron entry point |

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` (`./scripts/setup.sh` does this for you). Key variables:

- `DATABASE_URL` — Postgres in deployment; `sqlite:///./cere_signal.db` works locally
  (`app/core/database.py` applies `sslmode=require` only to Postgres URLs)
- `SECRET_KEY` — JWT signing and local signed asset URLs; the API refuses to start without a real one
- `REDIS_URL` — defaults to `redis://localhost:6379/0`
- `AI_INFERENCE_ENABLED` — defaults to `True`. Set `False` for a manual-entry-only
  deployment (see "No-AI Mode" below)
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — file storage. Leave `SUPABASE_URL` empty to store
  files on local disk instead (`SUPABASE_PUBLISHABLE_KEY` is the client-side key)
- `OPENAI_API_KEY`, `OPENAI_MODEL` — LLM report generation (default `gpt-4o-mini`)
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL` — local fallback used when `OPENAI_API_KEY` is empty
  (default `http://localhost:11434/v1`; empty model = most recently pulled)
- `RESEND_API_KEY` — invitation email; `MAIL_*` variables are the SMTP fallback
- `FRONTEND_URL` — used to build invitation email links
- `DESKTOP_MODE` — read only by `entry_point.py:35` and never acted on; currently has no effect
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
./scripts/setup.sh --no-ai                       # base deps only, no torch/openai
docker compose build --build-arg INSTALL_AI=false
```

To run an existing install in this mode for one session, without touching `.env` — both
components need the flag, since each reads `AI_INFERENCE_ENABLED` independently:

```bash
./scripts/backend-start.sh --no-ai
./scripts/worker-start.sh --no-ai
```

`.env.example` ships `AI_INFERENCE_ENABLED` commented out, so the `True` default in
`app/core/config.py` applies; uncomment it in `backend/.env` to make the mode permanent.

The frontend discovers the mode at runtime via `GET /api/v1/config`
(`frontend/src/contexts/ConfigContext.tsx`), so one build serves both modes. Redis and the
Celery worker are still required — `preprocess_edf` runs in both modes.

## Tech Stack

- **Frontend:** React 19 + TypeScript, MUI v7, React Router v7, Plotly.js, Recharts
- **Backend:** FastAPI, SQLAlchemy (SQLite locally, Postgres/Supabase in deployment), Celery + Redis, PyJWT
- **ML:** PyTorch, MNE-Python, OpenAI API (`gpt-4o-mini`)
- **Storage:** Supabase Storage in deployment; local disk for development
- **Desktop:** Electron 28, PyInstaller, electron-builder (NSIS installer)
