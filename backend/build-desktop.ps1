Param(
  [string]$OutputName = "cere-engine"
)

$ErrorActionPreference = "Stop"

Write-Host "Building desktop backend (no AI)" -ForegroundColor Cyan

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-Not (Test-Path "requirements-desktop.txt")) {
  throw "requirements-desktop.txt not found"
}

pip install --upgrade pip
pip install -r requirements-desktop.txt

pyinstaller --clean --noconfirm "pyinstaller/desktop.spec"

Write-Host "Build complete: dist\$OutputName" -ForegroundColor Green
