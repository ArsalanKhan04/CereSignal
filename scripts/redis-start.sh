#!/usr/bin/env bash
# Start the Redis broker. Idempotent: works whether the container is missing,
# stopped, or already running.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd docker

if redis_running; then
    skip "$REDIS_CONTAINER is already running"
elif docker start "$REDIS_CONTAINER" >/dev/null 2>&1; then
    ok "started existing $REDIS_CONTAINER container"
else
    log "creating $REDIS_CONTAINER container"
    docker run -d --name "$REDIS_CONTAINER" -p 6379:6379 redis:7-alpine >/dev/null
    ok "created and started $REDIS_CONTAINER"
fi

# Wait for it to actually accept connections, so a worker started straight
# after this does not race the container's startup.
log "waiting for Redis to accept connections"
for _ in $(seq 1 30); do
    if [ "$(docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null || true)" = "PONG" ]; then
        ok "Redis is ready on localhost:6379"
        exit 0
    fi
    sleep 0.5
done

die "Redis did not respond to PING within 15s. Check: docker logs $REDIS_CONTAINER"
