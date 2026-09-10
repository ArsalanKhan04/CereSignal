#!/usr/bin/env bash
# Run the CereSignal test suites.
#
#   ./scripts/test.sh              backend and frontend
#   ./scripts/test.sh --backend    backend only
#   ./scripts/test.sh --frontend   frontend only
#   ./scripts/test.sh --cov        add coverage reports
#
# Neither suite needs Redis, a Celery worker, a .env file, model weights or a
# network connection. The backend suite builds its own in-memory SQLite database
# and never touches backend/cere_signal.db.
#
# Any further arguments are passed through to pytest, so this works:
#   ./scripts/test.sh --backend -k tenancy -v
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RUN_BACKEND=1
RUN_FRONTEND=1
COVERAGE=0
PYTEST_ARGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --backend)  RUN_FRONTEND=0 ;;
        --frontend) RUN_BACKEND=0 ;;
        --cov)      COVERAGE=1 ;;
        -h|--help)  awk 'NR>1{ if (!/^#/) exit; sub(/^# ?/,""); print }' "${BASH_SOURCE[0]}"; exit 0 ;;
        *)          PYTEST_ARGS+=("$1") ;;
    esac
    shift
done

failed=0

if [ "$RUN_BACKEND" = "1" ]; then
    require_venv

    if [ ! -x "$VENV/bin/pytest" ]; then
        die "pytest is not installed in $VENV
      Run: $PIP install -r $BACKEND/requirements-dev.txt"
    fi

    # backend/ must be the cwd: pytest.ini lives there, and app.*, external.* and
    # inference.* are top-level packages resolved relative to it.
    cd "$BACKEND"

    args=("${PYTEST_ARGS[@]+"${PYTEST_ARGS[@]}"}")
    if [ "$COVERAGE" = "1" ]; then
        args+=(--cov=app --cov=external --cov=inference --cov-report=term-missing)
    fi

    log "running backend tests"
    if "$PY" -m pytest "${args[@]+"${args[@]}"}"; then
        ok "backend"
    else
        warn "backend tests failed"
        failed=1
    fi
fi

if [ "$RUN_FRONTEND" = "1" ]; then
    require_cmd npm

    if [ ! -d "$FRONTEND/node_modules" ]; then
        die "no $FRONTEND/node_modules
      Run: npm --prefix $FRONTEND install"
    fi

    log "running frontend tests"
    if [ "$COVERAGE" = "1" ]; then
        npm_args=(run test:ci -- --coverage)
    else
        npm_args=(run test:ci)
    fi

    if npm --prefix "$FRONTEND" "${npm_args[@]}"; then
        ok "frontend"
    else
        warn "frontend tests failed"
        failed=1
    fi
fi

[ "$failed" = "0" ] || die "one or more suites failed"
ok "all suites passed"
