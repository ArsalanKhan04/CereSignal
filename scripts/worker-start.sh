#!/usr/bin/env bash
# Run the Celery worker that executes the ML inference pipeline.
#
#   ./scripts/worker-start.sh            normal inference
#   ./scripts/worker-start.sh --no-ai    manual-entry-only for this run (.env untouched)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NO_AI=0
for arg in "$@"; do
    case "$arg" in
        --no-ai) NO_AI=1 ;;
        -h|--help) awk 'NR>1{ if (!/^#/) exit; sub(/^# ?/,""); print }' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) die "unknown argument: $arg (see --help)" ;;
    esac
done

require_venv
load_env

# After load_env so the flag wins over .env. Must match the backend's mode: the
# two read the flag independently, so a mismatch means the UI and the worker
# disagree about whether inference runs.
if [ "$NO_AI" = "1" ]; then
    export AI_INFERENCE_ENABLED=False
fi

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

announce_mode
log "starting Celery worker (Ctrl-C to stop)"
exec "$VENV/bin/celery" -A inference.infer worker -l info
