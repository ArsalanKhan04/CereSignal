# Shared helpers for the Windows dev scripts, the counterpart of lib.sh.
# Dot-sourced, not run: every caller does `. (Join-Path $PSScriptRoot 'lib.ps1')`.
#
# Keep every .ps1 here pure ASCII. Windows PowerShell 5.1 reads a file without a BOM
# as ANSI, so a stray em dash or box-drawing character arrives garbled.

$ErrorActionPreference = 'Stop'

# Dot-sourcing shares the caller's scope and variable names ignore case, so these must
# not match a caller's parameter: test.ps1's [switch]$Backend would reject a path.
$RepoRoot    = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'
$Venv        = Join-Path $BackendDir 'cere_env'
$Py          = Join-Path $Venv 'Scripts\python.exe'

function Write-Step { param([string]$Message) Write-Host '==> ' -ForegroundColor Blue -NoNewline; Write-Host $Message }
function Write-Ok   { param([string]$Message) Write-Host '  ok ' -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Skip { param([string]$Message) Write-Host "  -- $Message" -ForegroundColor DarkGray }
function Write-Warn { param([string]$Message) Write-Host 'warn ' -ForegroundColor Yellow -NoNewline; Write-Host $Message }

function Exit-WithError {
    param([string]$Message)
    Write-Host 'error ' -ForegroundColor Red -NoNewline
    Write-Host $Message
    exit 1
}

# Prints the comment block at the top of the calling script, whatever its length.
function Show-Usage {
    param([string]$Path)
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if (-not $line.StartsWith('#')) { break }
        Write-Host ($line -replace '^# ?', '')
    }
}

# $ErrorActionPreference does not cover native commands, so check each exit code.
# Never redirect a native command's stderr under 'Stop': in Windows PowerShell 5.1
# every stderr line then becomes a terminating error, pip's warnings included.
function Invoke-Native {
    param([string]$What, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { Exit-WithError "$What failed (exit code $LASTEXITCODE)" }
}

# The venv must exist before anything can run. Its binaries are called by path, so
# nothing needs activating.
function Confirm-Venv {
    if (-not (Test-Path $Py)) {
        Exit-WithError "no virtualenv at $Venv`n      Run scripts\setup.ps1 first."
    }
}

function Confirm-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Exit-WithError "'$Name' is not installed or not on PATH."
    }
}

# Export backend\.env into this process, as load_env does. pydantic reads the file
# itself; this is for what reads the environment instead, such as the mode banner below.
# Parsed line by line rather than run: values hold spaces (PROJECT_NAME=CereSignal API).
function Import-DotEnv {
    $envFile = Join-Path $BackendDir '.env'
    if (-not (Test-Path $envFile)) {
        Write-Warn "no $envFile - using defaults. Run scripts\setup.ps1 to create it."
        return
    }

    # ReadAllLines splits on CRLF too, so an autocrlf checkout leaves no stray \r.
    foreach ($raw in [IO.File]::ReadAllLines($envFile)) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        if ($line.StartsWith('export ')) { $line = $line.Substring(7) }

        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1)
        if ($key -notmatch '^[A-Za-z0-9_]+$') { continue }

        if ($value.Length -ge 2 -and (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        # An empty value unsets the variable, which pydantic then reads from .env as "".
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

# Typed confirmation for destructive actions. -AssumeYes (set by -Yes) skips the prompt;
# redirected input refuses rather than guessing.
function Request-Confirmation {
    param([string]$Prompt, [switch]$AssumeYes)
    if ($AssumeYes) {
        Write-Warn "$Prompt - proceeding (-Yes)"
        return
    }
    if ([Console]::IsInputRedirected) {
        Exit-WithError "$Prompt`n      Refusing to continue without confirmation. Pass -Yes to override."
    }
    Write-Host $Prompt -ForegroundColor Yellow
    $reply = Read-Host "Type 'yes' to continue"
    if ($reply -ne 'yes') { Exit-WithError 'Aborted.' }
}

# True when the backend will run with AI inference disabled. Reads the resolved value
# rather than the -NoAi flag, so it is also right for someone who uncommented
# AI_INFERENCE_ENABLED in .env. Unset means the app default, True.
function Test-AiDisabled {
    return ("$env:AI_INFERENCE_ENABLED" -match '^(false|0|no)$')
}

function Show-Mode {
    if (Test-AiDisabled) {
        Write-Host 'Manual-entry-only mode' -ForegroundColor Yellow -NoNewline
        Write-Host ' - no models, no LLM report. Uploads land in "Needs Review".'
    }
}
