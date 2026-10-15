# First-time setup on Windows. Safe to re-run: every step is skipped if already done.
#
#   scripts\setup.ps1          with the ML stack
#   scripts\setup.ps1 -NoAi    manual-entry-only
#
# Run it as: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 [-NoAi]
#
# The Windows counterpart of setup.sh. -NoAi skips onnxruntime/openai and sets
# AI_INFERENCE_ENABLED=False in the generated .env: uploads are still converted for the
# viewer, then wait for a manual normal/abnormal label, and reports are typed by hand.
param(
    [switch]$NoAi,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'lib.ps1')
if ($Help) { Show-Usage $PSCommandPath; exit 0 }

Write-Step 'CereSignal setup (Windows)'

# -- Python virtualenv --------------------------------------------------
if (Test-Path $Py) {
    # DESKTOP_BUILD_WINDOWS.md used to put the desktop build's venv here. The web
    # requirements must stay out of it, or PyInstaller bundles them into the installer.
    if (Test-Path (Join-Path $Venv 'Scripts\pyinstaller.exe')) {
        Exit-WithError ("$Venv is the desktop build's virtualenv (PyInstaller is installed in it).`n" +
            "      Delete it and re-run this script. The desktop build now uses backend\desktop_env`n" +
            "      (DESKTOP_BUILD_WINDOWS.md); a moved venv would still point at the old path.")
    }
    Write-Skip "virtualenv already exists ($(& $Py -V))"
} else {
    # Exactly the version CI and backend/Dockerfile.backend use; the py launcher picks it
    # by number, where a bare `python` could be any install, or the Store alias.
    Confirm-Command 'py'
    & py -3.14 -c 'pass'
    if ($LASTEXITCODE -ne 0) { Exit-WithError 'need Python 3.14 to create the virtualenv (py -0 lists the installed ones).' }

    Write-Step "creating virtualenv at $Venv"
    Invoke-Native 'creating the virtualenv' { & py -3.14 -m venv $Venv }
    Write-Ok "virtualenv created ($(& $Py -V))"
}

# -- Python dependencies ------------------------------------------------
# onnxruntime and openai live in requirements-ai.txt and are needed only when
# AI_INFERENCE_ENABLED=True, which is the default - so install them unless -NoAi.
Write-Step 'installing backend dependencies (this takes a while - mne is large)'
# python -m pip, not pip.exe: on Windows pip cannot replace its own running executable.
Invoke-Native 'upgrading pip' { & $Py -m pip install --quiet --upgrade pip }
Invoke-Native 'installing requirements.txt' { & $Py -m pip install -r (Join-Path $BackendDir 'requirements.txt') }
if ($NoAi) {
    Write-Ok 'backend dependencies installed (no ML stack - manual-entry-only)'
} else {
    Write-Step 'installing ML dependencies (pass -NoAi to skip)'
    Invoke-Native 'installing requirements-ai.txt' { & $Py -m pip install -r (Join-Path $BackendDir 'requirements-ai.txt') }
    Write-Ok 'backend dependencies installed (with ML stack)'
}

# pytest and ruff, for scripts\test.ps1.
Invoke-Native 'installing requirements-dev.txt' { & $Py -m pip install --quiet -r (Join-Path $BackendDir 'requirements-dev.txt') }
Write-Ok 'test dependencies installed'

# -- Environment file ---------------------------------------------------
$envFile = Join-Path $BackendDir '.env'
if (Test-Path $envFile) {
    Write-Skip '.env already exists'
} else {
    Copy-Item (Join-Path $BackendDir '.env.example') $envFile
    Write-Ok 'created backend\.env from .env.example'
}

$envText = [IO.File]::ReadAllText($envFile)
$original = $envText

# The lookaheads match before the \r of a CRLF line too, where a bare $ would not.
if ($NoAi) {
    $commented = '(?m)^# AI_INFERENCE_ENABLED=False(?=\r?$)'
    if ($envText -match $commented) {
        $envText = $envText -replace $commented, 'AI_INFERENCE_ENABLED=False'
        Write-Ok 'set AI_INFERENCE_ENABLED=False in backend\.env'
    } else {
        Write-Skip 'AI_INFERENCE_ENABLED already set by hand - leaving backend\.env alone'
    }
}

# .env.example ships SECRET_KEY as a literal placeholder, which the API refuses to start
# with. setup.sh uses openssl; Windows has no openssl, so use .NET's CSPRNG.
$placeholder = '(?m)^SECRET_KEY=change-me-for-local-dev(?=\r?$)'
if ($envText -match $placeholder) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    $envText = $envText -replace $placeholder, "SECRET_KEY=$secret"
    Write-Ok 'generated a random SECRET_KEY'
} else {
    Write-Skip 'SECRET_KEY already set'
}

if ($envText -cne $original) {
    # UTF-8 without a BOM. In 5.1, Set-Content -Encoding UTF8 writes a BOM and `>` writes
    # UTF-16, neither of which the dotenv parsers expect.
    [IO.File]::WriteAllText($envFile, $envText, (New-Object Text.UTF8Encoding $false))
}

# -- Frontend dependencies ----------------------------------------------
if (Test-Path (Join-Path $FrontendDir 'node_modules')) {
    Write-Skip 'frontend node_modules already present'
} else {
    Confirm-Command 'npm'
    Write-Step 'installing frontend dependencies'
    # ci, not install: install rewrites package-lock.json whenever this npm disagrees
    # with the one that wrote it.
    Push-Location $FrontendDir
    try {
        Invoke-Native 'npm ci' { & npm ci }
    } finally {
        Pop-Location
    }
    Write-Ok 'frontend dependencies installed'
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green -NoNewline
Write-Host ' Start the website in two terminals:'
Write-Host ''
Write-Host '  terminal 1  powershell -ExecutionPolicy Bypass -File scripts\backend-start.ps1' -NoNewline
Write-Host '   # add -Fresh to reset and re-seed' -ForegroundColor DarkGray
Write-Host '  terminal 2  npm --prefix frontend run dev'
Write-Host ''
Write-Host 'There is no Redis and no Celery worker to start: on Windows the backend runs the'
Write-Host 'analysis and the report itself. Stop it with scripts\stop.ps1; test with scripts\test.ps1.'

if ($NoAi) {
    Write-Host ''
    Write-Host 'Manual-entry-only install' -ForegroundColor Yellow -NoNewline
    Write-Host ' - NeuroGate, NeuroTransformer and LLM report generation are off.'
    Write-Host 'Uploads are still preprocessed for the viewer and land in "Needs Review" for a manual'
    Write-Host 'label. Re-run scripts\setup.ps1 (no flag) and set AI_INFERENCE_ENABLED=True in'
    Write-Host 'backend\.env to turn the ML stack back on.'
}
