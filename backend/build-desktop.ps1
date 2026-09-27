Param(
  [string]$OutputName = "cere-engine"
)

$ErrorActionPreference = "Stop"

Write-Host "Building desktop backend (no AI)" -ForegroundColor Cyan

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-Not (Test-Path "requirements-desktop.txt")) {
  throw "requirements-desktop.txt not found"
}

# $ErrorActionPreference does not cover native commands, so check each exit code;
# otherwise a failed build exits 0 and electron-builder ships an installer without
# a backend (extraResources skips a missing folder silently).
pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
pip install -r requirements-desktop.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

pyinstaller --clean --noconfirm "pyinstaller/desktop.spec"
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

if (-Not (Test-Path "dist\$OutputName\$OutputName.exe")) {
  throw "dist\$OutputName\$OutputName.exe was not produced"
}

Write-Host "Build complete: dist\$OutputName" -ForegroundColor Green
