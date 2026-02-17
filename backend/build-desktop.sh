#!/usr/bin/env bash
set -euo pipefail

echo "Building desktop backend (no AI)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "requirements-desktop.txt" ]; then
  echo "requirements-desktop.txt not found" >&2
  exit 1
fi

python -m pip install --upgrade pip
python -m pip install -r requirements-desktop.txt

pyinstaller --clean --noconfirm "pyinstaller/desktop.spec"

echo "Build complete: dist/cere-engine"
