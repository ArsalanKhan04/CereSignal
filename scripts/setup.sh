#!/usr/bin/env bash
# First-time setup. Safe to re-run — every step is skipped if already done.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

log "CereSignal setup"

# ── Python virtualenv ───────────────────────────────────────────
if [ -x "$PY" ]; then
    skip "virtualenv already exists ($("$PY" -V 2>&1))"
else
    PYTHON_BIN=""
    for candidate in python3.11 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            PYTHON_BIN="$candidate"
            break
        fi
    done
    [ -n "$PYTHON_BIN" ] || die "need python3.11 (or python3) on PATH to create the virtualenv."

    log "creating virtualenv at $VENV ($($PYTHON_BIN -V 2>&1))"
    "$PYTHON_BIN" -m venv "$VENV"
    ok "virtualenv created"
fi

# ── Python dependencies ─────────────────────────────────────────
# backend/requirements.txt is the real one — it is what CI (.github/workflows)
# and backend/Dockerfile.backend install. backend/app/requirements.txt and the
# root requirements.txt are stale duplicates.
log "installing backend dependencies (this takes a while — torch and mne are large)"
"$PIP" install --quiet --upgrade pip
"$PIP" install -r "$BACKEND/requirements.txt"
ok "backend dependencies installed"

# ── Environment file ────────────────────────────────────────────
if [ -f "$BACKEND/.env" ]; then
    skip ".env already exists"
else
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    ok "created backend/.env from .env.example"
fi

# .env.example ships SECRET_KEY as a literal placeholder and tells you to
# generate one with `openssl rand -hex 32`. Do it automatically.
if grep -q '^SECRET_KEY=change-me-for-local-dev$' "$BACKEND/.env"; then
    if command -v openssl >/dev/null 2>&1; then
        SECRET="$(openssl rand -hex 32)"
        # Use a non-/ delimiter: hex is safe, but keep the habit.
        sed -i "s|^SECRET_KEY=change-me-for-local-dev$|SECRET_KEY=$SECRET|" "$BACKEND/.env"
        ok "generated a random SECRET_KEY"
    else
        warn "openssl not found — SECRET_KEY is still the placeholder. Set it by hand in backend/.env."
    fi
else
    skip "SECRET_KEY already set"
fi

# ── Frontend dependencies ───────────────────────────────────────
if [ -d "$FRONTEND/node_modules" ]; then
    skip "frontend node_modules already present"
else
    require_cmd npm
    log "installing frontend dependencies"
    npm --prefix "$FRONTEND" install
    ok "frontend dependencies installed"
fi

# ── Optional tooling ────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
    ok "docker found"
else
    warn "docker not found — scripts/start-redis.sh needs it, or run a local redis-server on 6379."
fi

cat <<EOF

${_C_GREEN}Setup complete.${_C_OFF} Start the stack in three terminals:

  ${_C_DIM}terminal 1${_C_OFF}  ./scripts/start-redis.sh
  ${_C_DIM}terminal 2${_C_OFF}  ./scripts/start-backend.sh      ${_C_DIM}# add --fresh to reset and re-seed${_C_OFF}
  ${_C_DIM}terminal 3${_C_OFF}  ./scripts/start-worker.sh
  ${_C_DIM}terminal 4${_C_OFF}  npm --prefix frontend run dev

Stop everything with ./scripts/stop.sh
EOF
