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

    # Normal mode: Start the API server
    print("--- Starting CereSignal Engine API ---")
    uvicorn.run(fastapi_app, host="127.0.0.1", port=8000, workers=1)
