import os
import sys
import multiprocessing
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

# 4. Imports
from app.main import app as fastapi_app

IS_DESKTOP_MODE = os.getenv("DESKTOP_MODE", "false").lower() == "true"

# 5. The "Traffic Cop" Logic
if __name__ == "__main__":
    multiprocessing.freeze_support()  # Mandatory for Windows

    # Check if "worker" was passed as a command-line argument
    if len(sys.argv) > 1 and sys.argv[1] == "worker":
        if IS_DESKTOP_MODE:
            print("--- Desktop mode: Celery worker disabled ---")
            sys.exit(0)

        print("--- Starting Celery Worker ---")

        # Import Celery app lazily to avoid AI deps in desktop mode
        from inference.infer import app as celery_app

        celery_app.worker_main(
            argv=["worker", "--loglevel=info", "--pool=solo"]
        )

    else:
        # Normal mode: Start the API server
        print("--- Starting CereSignal Engine API ---")
        uvicorn.run(fastapi_app, host="127.0.0.1", port=8000, workers=1)
