# Desktop Build (Windows)

This guide covers building the CereSignal desktop app for Windows.

## Prerequisites

- Windows 10/11
- Node.js 18+
- Python 3.11+
- Visual Studio Build Tools (C++ workload)
- PowerShell

## Setup

1. Install backend Python deps:
   ```bash
   cd backend
   pyenv activate cere_env
   pip install -r requirements.txt
   ```

2. Install frontend deps:
   ```bash
   cd frontend
   npm install
   ```

## Build

From the repo root:

```bash
npm run build:desktop
```

## Output

The Windows installer will be created under:

```text
dist/
```
