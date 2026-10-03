Param(
  [string]$OutputName = "cere-engine"
)

$ErrorActionPreference = "Stop"

Write-Host "Building desktop backend (ONNX models + local LLM)" -ForegroundColor Cyan

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

# Size guards. The models run as ONNX and resampling is numpy, so torch and numba have
# no business in the bundle; one stray top-level import would quietly add 100-700 MB.
$internal = "dist\$OutputName\_internal"
foreach ($heavy in @("torch", "numba", "llvmlite", "sympy")) {
  if (Test-Path (Join-Path $internal $heavy)) {
    throw "$heavy was bundled into $internal. Find the import that pulls it in, or add it to excludes in desktop.spec"
  }
}
foreach ($model in @("neurogate.onnx", "neurotransformer.onnx")) {
  if (-Not (Test-Path (Join-Path $internal "external\models\$model"))) {
    throw "external\models\$model is missing from $internal"
  }
}
$backendSize = (Get-ChildItem -Recurse -File "dist\$OutputName" | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("Backend bundle: {0:N0} MB" -f $backendSize)

& (Join-Path $PSScriptRoot "fetch-desktop-llm.ps1")

Write-Host "Build complete: dist\$OutputName" -ForegroundColor Green
