# Prepare the database, seed demo data, then run the FastAPI backend on Windows.
#
#   scripts\backend-start.ps1               continue from the last run
#   scripts\backend-start.ps1 -Fresh        wipe the DB and generated files, start over
#   scripts\backend-start.ps1 -Fresh -Yes   ... without the confirmation prompt
#   scripts\backend-start.ps1 -NoAi         manual-entry-only for this run (.env untouched)
#
# Run it as: powershell -ExecutionPolicy Bypass -File scripts\backend-start.ps1 [flags]
#
# Unlike backend-start.sh, nothing else needs starting: with IN_PROCESS_TASKS this process
# runs the preprocessing, the models and the report itself, so there is no Redis and no
# Celery worker. Run one backend only - task results live in its memory.
param(
    [switch]$Fresh,
    [switch]$Yes,
    [switch]$NoAi,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'lib.ps1')
if ($Help) { Show-Usage $PSCommandPath; exit 0 }

Confirm-Venv
Import-DotEnv

# After Import-DotEnv so the flag wins over .env. One run only - nothing is written to .env.
if ($NoAi) { $env:AI_INFERENCE_ENABLED = 'False' }

# Redis has no Windows build (app/core/config.py, IN_PROCESS_TASKS).
$env:IN_PROCESS_TASKS = 'true'

# Everything below must run from backend\. inference\infer.py resolves the model files
# against the working directory and DATABASE_URL is sqlite:///./cere_signal.db, so the
# wrong directory means missing models or a second, empty database. Push-Location rather
# than Set-Location, so a run from an open shell leaves that shell where it was.
Push-Location $BackendDir
try {
    if ($Fresh) {
        $db = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { 'sqlite:///./cere_signal.db' }
        Request-Confirmation "-Fresh will DROP every table in $db and delete uploaded files, generated plots, and logs." -AssumeYes:$Yes

        Write-Step 'resetting database'
        # migrate.py --reset drops the tables in FK-safe order and recreates them.
        # Preferred over deleting cere_signal.db so this also works against Postgres.
        Invoke-Native 'migrate.py --reset' { & $Py migrate.py --reset }

        Write-Step 'clearing generated files'
        foreach ($dir in @('local_storage', 'app\static\plots')) {
            Get-ChildItem -Path (Join-Path $BackendDir $dir) -Force -ErrorAction SilentlyContinue |
                Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        }
        Get-ChildItem -Path (Join-Path $BackendDir 'logs') -Filter '*.log*' -ErrorAction SilentlyContinue |
            Remove-Item -Force -ErrorAction SilentlyContinue
        Write-Ok 'uploads, plots and logs cleared'
    } else {
        Write-Step 'ensuring database schema is up to date'
        # No --reset: creates missing tables, leaves existing rows alone.
        Invoke-Native 'migrate.py' { & $Py migrate.py }
    }

    # Every entity in seed_demo is get-or-create, so this is a no-op on a database that
    # already has the demo data.
    Write-Step 'seeding demo data'
    Invoke-Native 'seeding demo data' { & $Py -m scripts.seed_demo }

    Write-Host ''
    Write-Host 'Backend starting' -ForegroundColor Green -NoNewline
    Write-Host ' on http://localhost:8000  (docs at /api/v1/docs)'
    Write-Host 'Demo accounts are listed above, from backend\scripts\seed_demo.py' -ForegroundColor DarkGray
    Write-Host 'No Redis or worker needed: this process runs the analysis and the report.' -ForegroundColor DarkGray
    Write-Host ''

    Show-Mode

    # 127.0.0.1, not backend-start.sh's 0.0.0.0: binding every interface makes Windows
    # Firewall prompt and exposes the dev server to the network. The frontend calls localhost.
    & (Join-Path $Venv 'Scripts\uvicorn.exe') app.main:app --reload --host 127.0.0.1 --port 8000
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
