#!/usr/bin/env bash
# Run the Celery worker that executes the ML inference pipeline.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_venv
load_env

# Fail loudly here rather than letting Celery sit in an opaque reconnect loop.
if command -v docker >/dev/null 2>&1 && ! redis_running; then
    warn "Redis container '$REDIS_CONTAINER' is not running — start it with ./scripts/redis-start.sh"
    warn "(ignore this if you run Redis outside Docker)"
fi

# The cd is mandatory, not cosmetic. inference/infer.py loads the NeuroGate and
# NeuroTransformer weights via os.path.abspath(".") + external/models/..., so
# from any other directory torch.load raises FileNotFoundError. The SQLite
# DATABASE_URL is cwd-relative too.
cd "$BACKEND"

log "starting Celery worker (Ctrl-C to stop)"
exec "$VENV/bin/celery" -A inference.infer worker -l info
