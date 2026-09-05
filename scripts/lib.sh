# Shared helpers for the CereSignal dev scripts.
# Sourced, not executed — every caller does `source "$(dirname "$0")/lib.sh"`.

# Resolve everything from this file's own location so the scripts work no matter
# what directory they are invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"
VENV="$BACKEND/cere_env"
PY="$VENV/bin/python"
PIP="$VENV/bin/pip"

REDIS_CONTAINER="redis_dev"

if [ -t 1 ]; then
    _C_BLUE=$'\033[34m'; _C_YELLOW=$'\033[33m'; _C_RED=$'\033[31m'
    _C_GREEN=$'\033[32m'; _C_DIM=$'\033[2m'; _C_OFF=$'\033[0m'
else
    _C_BLUE=""; _C_YELLOW=""; _C_RED=""; _C_GREEN=""; _C_DIM=""; _C_OFF=""
fi

log()  { printf '%s==>%s %s\n' "$_C_BLUE"   "$_C_OFF" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$_C_GREEN" "$_C_OFF" "$*"; }
skip() { printf '%s  --%s %s\n' "$_C_DIM"   "$_C_OFF" "$*"; }
warn() { printf '%swarn%s %s\n' "$_C_YELLOW" "$_C_OFF" "$*" >&2; }
die()  { printf '%serror%s %s\n' "$_C_RED"  "$_C_OFF" "$*" >&2; exit 1; }

# The venv must exist before anything can run. pyenv is deliberately not used:
# there is no `cere_env` pyenv virtualenv, and `pyenv activate` is a shell
# function that cannot work from inside a script. We call the venv's binaries
# by absolute path instead, which needs no activation at all.
require_venv() {
    [ -x "$PY" ] || die "no virtualenv at $VENV
      Run $REPO_ROOT/scripts/setup.sh first."
}

# Export backend/.env into the environment. DATABASE_URL, REDIS_URL and
# SUPERUSER_PASSWORD all come from here.
#
# Parsed line by line rather than sourced: .env holds unquoted values with
# spaces (PROJECT_NAME=CereSignal API), which the shell would try to execute.
load_env() {
    if [ ! -f "$BACKEND/.env" ]; then
        warn "no $BACKEND/.env — using defaults. Run scripts/setup.sh to create it."
        return 0
    fi

    local line key value
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line#"${line%%[![:space:]]*}"}"        # strip leading whitespace
        case "$line" in ''|'#'*) continue ;; esac      # blank or comment
        case "$line" in *=*) ;; *) continue ;; esac    # must be KEY=VALUE
        line="${line#export }"

        key="${line%%=*}"
        value="${line#*=}"
        key="${key%"${key##*[![:space:]]}"}"           # strip trailing whitespace
        case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac

        # Drop matching surrounding quotes, if any.
        case "$value" in
            \"*\") value="${value#\"}"; value="${value%\"}" ;;
            \'*\') value="${value#\'}"; value="${value%\'}" ;;
        esac

        export "$key=$value"
    done < "$BACKEND/.env"
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "'$1' is not installed or not on PATH."
}

# Typed confirmation for destructive actions. ASSUME_YES=1 (set by --yes) skips
# the prompt; a non-interactive stdin refuses rather than guessing.
confirm() {
    local prompt="$1" reply
    if [ "${ASSUME_YES:-0}" = "1" ]; then
        warn "$prompt — proceeding (--yes)"
        return 0
    fi
    [ -t 0 ] || die "$prompt
      Refusing to continue without confirmation. Pass --yes to override."
    printf '%s%s%s\n' "$_C_YELLOW" "$prompt" "$_C_OFF"
    printf "Type 'yes' to continue: "
    read -r reply
    [ "$reply" = "yes" ] || die "Aborted."
}

redis_running() {
    docker ps --filter "name=^${REDIS_CONTAINER}$" --format '{{.Names}}' 2>/dev/null \
        | grep -q "^${REDIS_CONTAINER}$"
}
