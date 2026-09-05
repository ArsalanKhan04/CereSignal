#!/usr/bin/env bash
# Stop the backend, the Celery worker and Redis. Exits 0 when nothing was running.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

log "stopping CereSignal services"

# Both patterns are anchored to this repo's venv path, so they cannot match
# another checkout's processes — or an unrelated command that merely happens to
# mention "celery" or "uvicorn" on its command line.
#
# Celery answers SIGTERM with a warm shutdown: it waits for in-flight tasks and
# its pool children to wind down, so the processes linger for a moment after
# pkill returns. Wait for them to actually go, and only then report success —
# otherwise a second run of this script claims to stop them all over again.
stop_matching() {
    local label="$1" pattern="$2"

    if ! pkill -f "$pattern" 2>/dev/null; then
        skip "$label was not running"
        return 0
    fi

    for _ in $(seq 1 30); do
        pgrep -f "$pattern" >/dev/null 2>&1 || { ok "stopped $label"; return 0; }
        sleep 0.5
    done

    warn "$label did not exit after 15s — sending SIGKILL"
    pkill -KILL -f "$pattern" 2>/dev/null || true
    ok "killed $label"
}

stop_matching "backend (uvicorn)" "$VENV/bin/uvicorn app.main:app"
stop_matching "Celery worker"     "$VENV/bin/celery -A inference.infer worker"

# Redis. Stopped, not removed, so redis-start.sh can reuse the container.
if command -v docker >/dev/null 2>&1; then
    if redis_running; then
        docker stop "$REDIS_CONTAINER" >/dev/null
        ok "stopped $REDIS_CONTAINER"
    else
        skip "$REDIS_CONTAINER was not running"
    fi
else
    skip "docker not installed — nothing to stop"
fi

# The frontend dev server is started via npm, so it is left to its own terminal.
printf '\n%sNote%s the frontend dev server is not managed here — Ctrl-C it in its own terminal.\n' \
    "$_C_DIM" "$_C_OFF"
