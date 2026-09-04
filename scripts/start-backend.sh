#!/usr/bin/env bash
# Prepare the database, seed demo data, then run the FastAPI backend.
#
#   ./scripts/start-backend.sh            continue from the last run
#   ./scripts/start-backend.sh --fresh    wipe the DB and generated files, start over
#   ./scripts/start-backend.sh --fresh --yes   ... without the confirmation prompt
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FRESH=0
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        --fresh) FRESH=1 ;;
        --yes|-y) ASSUME_YES=1 ;;
        -h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
        *) die "unknown argument: $arg (see --help)" ;;
    esac
done

require_venv
load_env

# Everything below must run from backend/. inference/infer.py resolves the model
# weights with os.path.abspath(".") and DATABASE_URL is sqlite:///./cere_signal.db,
# so the wrong cwd means missing weights or a second, empty database.
cd "$BACKEND"

if [ "$FRESH" = "1" ]; then
    confirm "--fresh will DROP every table in ${DATABASE_URL:-sqlite:///./cere_signal.db} and delete uploaded files, generated plots, and logs."

    log "resetting database"
    # migrate.py --reset drops the 13 tables in FK-safe order and recreates them.
    # Preferred over deleting cere_signal.db so this also works against Postgres.
    "$PY" migrate.py --reset

    log "clearing generated files"
    rm -rf -- "$BACKEND/local_storage"/* 2>/dev/null || true
    rm -rf -- "$BACKEND/app/static/plots"/* 2>/dev/null || true
    rm -f  -- "$BACKEND/logs"/*.log* 2>/dev/null || true
    ok "uploads, plots and logs cleared"
else
    log "ensuring database schema is up to date"
    # No --reset: creates missing tables, leaves existing rows alone.
    "$PY" migrate.py
fi

# Every entity in seed_demo is get-or-create, so this is a no-op on a database
# that already has the demo data.
log "seeding demo data"
"$PY" -m scripts.seed_demo

cat <<EOF

${_C_GREEN}Backend starting${_C_OFF} on http://localhost:8000  ${_C_DIM}(docs at /api/v1/docs)${_C_OFF}
Demo login: ${_C_GREEN}admin_nl${_C_OFF} / ${_C_GREEN}Demo@2025!${_C_OFF}  ${_C_DIM}(from backend/scripts/seed_demo.py)${_C_OFF}

EOF

# exec so Ctrl-C goes straight to uvicorn rather than this wrapper.
exec "$VENV/bin/uvicorn" app.main:app --reload --host 0.0.0.0 --port 8000
