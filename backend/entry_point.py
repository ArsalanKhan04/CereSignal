import multiprocessing
import os
import secrets
import sys

import uvicorn

# 1. Setup Paths
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

# 2. Define Critical Folders
required_dirs = [
    os.path.join(current_dir, "uploads"),
    os.path.join(current_dir, "app", "static"), 
]

# 3. Auto-Create Folders
for directory in required_dirs:
    if not os.path.exists(directory):
        print(f"Creating missing directory: {directory}")
        os.makedirs(directory, exist_ok=True)

# 4. Desktop defaults. main.js sets DESKTOP_MODE and CERE_DATA_DIR, the per-user app
# data folder, since the install directory is not writable. Must precede the settings
# import below; setdefault so an explicitly set variable still wins.
if os.getenv("DESKTOP_MODE", "false").lower() == "true":
    data_dir = os.getenv("CERE_DATA_DIR") or current_dir
    os.makedirs(data_dir, exist_ok=True)
    os.environ.setdefault("DATABASE_URL", "sqlite:///" + os.path.join(data_dir, "cere_signal.db"))
    os.environ.setdefault("LOCAL_STORAGE_ROOT", os.path.join(data_dir, "local_storage"))
    # The desktop build ships without torch (requirements-desktop.txt).
    os.environ.setdefault("AI_INFERENCE_ENABLED", "false")
    # The window loads frontend/build over file://, which sends `Origin: null`.
    os.environ.setdefault("BACKEND_CORS_ORIGINS", '["null"]')

# 5. Imports
# The packaged app ships no .env, and main.py refuses to start without a real
# SECRET_KEY. A per-process random key is enough for a single local server — its
# only cost is that sessions end when the app restarts. Must precede the app import:
# app/core/auth.py copies the key at import time.
from app.core.config import PLACEHOLDER_SECRET_KEYS, settings  # noqa: E402

if settings.SECRET_KEY in PLACEHOLDER_SECRET_KEYS:
    settings.SECRET_KEY = secrets.token_hex(32)

from app.main import app as fastapi_app  # noqa: E402

# 6. The "Traffic Cop" Logic
if __name__ == "__main__":
    multiprocessing.freeze_support()  # Mandatory for Windows

    # Normal mode: Start the API server
    print("--- Starting CereSignal Engine API ---")
    uvicorn.run(fastapi_app, host="127.0.0.1", port=8000, workers=1)
