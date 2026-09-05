#!/usr/bin/env bash
# First-time setup. Safe to re-run — every step is skipped if already done.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# --no-ai sets up a manual-entry-only install: no torch/openai, and
# AI_INFERENCE_ENABLED=False in the generated .env. See "No-AI Mode" in CLAUDE.md.
INSTALL_AI=true
for arg in "$@"; do
    case "$arg" in
        --no-ai) INSTALL_AI=false ;;
        -h|--help)
            echo "usage: $0 [--no-ai]"
            echo "  --no-ai   skip torch/openai and configure a manual-entry-only backend"
            exit 0
            ;;
        *) die "unknown option: $arg (try --help)" ;;
    esac
done

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
#
# torch and openai live in backend/requirements-ai.txt and are needed only when
# AI_INFERENCE_ENABLED=True, which is the default — so install them unless --no-ai.
log "installing backend dependencies (this takes a while — mne is large)"
"$PIP" install --quiet --upgrade pip
"$PIP" install -r "$BACKEND/requirements.txt"
if [ "$INSTALL_AI" = "true" ]; then
    log "installing ML dependencies (torch is large — pass --no-ai to skip)"
    "$PIP" install -r "$BACKEND/requirements-ai.txt"
    ok "backend dependencies installed (with ML stack)"
else
    ok "backend dependencies installed (no ML stack — manual-entry-only)"
fi

# ── Environment file ────────────────────────────────────────────
if [ -f "$BACKEND/.env" ]; then
    skip ".env already exists"
else
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    ok "created backend/.env from .env.example"
fi

# Only meaningful when the ML stack was skipped — leaving the default True would
# give a worker that dies on `import torch` at the first inference task.
# .env.example ships this commented out, so the default (True, from
# app/core/config.py) applies and `AI_INFERENCE_ENABLED=False ./scripts/...` can
# still override per run. --no-ai is the case where the mode is the persistent
# default, so uncomment it.
if [ "$INSTALL_AI" = "false" ]; then
    if grep -q '^# AI_INFERENCE_ENABLED=False$' "$BACKEND/.env"; then
        sed -i "s|^# AI_INFERENCE_ENABLED=False$|AI_INFERENCE_ENABLED=False|" "$BACKEND/.env"
        ok "set AI_INFERENCE_ENABLED=False in backend/.env"
    else
        skip "AI_INFERENCE_ENABLED already set by hand — leaving backend/.env alone"
    fi
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
    warn "docker not found — scripts/redis-start.sh needs it, or run a local redis-server on 6379."
fi

cat <<EOF

${_C_GREEN}Setup complete.${_C_OFF} Start the stack in three terminals:

  ${_C_DIM}terminal 1${_C_OFF}  ./scripts/redis-start.sh
  ${_C_DIM}terminal 2${_C_OFF}  ./scripts/backend-start.sh      ${_C_DIM}# add --fresh to reset and re-seed${_C_OFF}
  ${_C_DIM}terminal 3${_C_OFF}  ./scripts/worker-start.sh
  ${_C_DIM}terminal 4${_C_OFF}  npm --prefix frontend run dev

Stop everything with ./scripts/stop.sh
EOF

if [ "$INSTALL_AI" = "false" ]; then
    cat <<EOF
${_C_YELLOW}Manual-entry-only install${_C_OFF} — NeuroGate, NeuroTransformer and LLM report
generation are off. Uploads are still preprocessed for the viewer and land in
"Needs Review" for a manual label. Re-run ./scripts/setup.sh (no flag) and set
AI_INFERENCE_ENABLED=True in backend/.env to turn the ML stack back on.
EOF
fi
