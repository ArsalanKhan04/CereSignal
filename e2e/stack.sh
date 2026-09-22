#!/usr/bin/env bash
# Start a throwaway backend + Celery worker for the Playwright suite.
#
#   e2e/stack.sh        run by playwright.config.ts's webServer; not usually by hand
#
# Everything lives under e2e/.stack/, which is wiped on every start: its own SQLite
# database, its own local storage and a random SECRET_KEY. Nothing touches
# backend/cere_signal.db, backend/local_storage or backend/.env.
#
# AI is off and no model, OpenAI or Ollama is reached. Supabase is off, so storage
# is local disk. What remains needs Redis (the upload still queues preprocess_edf),
# which CI provides as a service container and locally comes from
# ./scripts/redis-start.sh.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/lib.sh"

require_venv

STACK="$REPO_ROOT/e2e/.stack"
rm -rf -- "$STACK"
mkdir -p "$STACK/storage" "$STACK/logs"

# Deliberately not load_env: the suite must behave the same on every machine,
# whatever a developer's backend/.env says.
export DATABASE_URL="sqlite:///$STACK/e2e.db"
export LOCAL_STORAGE_ROOT="$STACK/storage"
export SECRET_KEY="e2e-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export AI_INFERENCE_ENABLED=False
export SUPABASE_URL=""
export OPENAI_API_KEY=""
export OLLAMA_BASE_URL="http://127.0.0.1:9/v1"   # discard port: never answers
export RESEND_API_KEY=""
export MAIL_SERVER=""
export CERE_LOG_DIR="$STACK/logs"

"$PY" -c "import redis, os; redis.Redis.from_url(os.environ['REDIS_URL']).ping()" 2>/dev/null \
    || die "Redis is not reachable at $REDIS_URL — start it with ./scripts/redis-start.sh"

cd "$BACKEND"
"$PY" migrate.py >/dev/null
"$PY" -m scripts.seed_demo >/dev/null

# --pool=solo: one task at a time in the worker's own process, which is all a
# serial browser suite needs and avoids prefork's fork-per-child startup.
"$VENV/bin/celery" -A inference.infer worker --pool=solo -l warning \
    >"$STACK/logs/worker.log" 2>&1 &
WORKER_PID=$!
trap 'kill "$WORKER_PID" 2>/dev/null || true' EXIT INT TERM

"$VENV/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000 --log-level warning
