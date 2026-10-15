# Run the CereSignal test suites on Windows.
#
#   scripts\test.ps1              backend and frontend
#   scripts\test.ps1 -Backend     backend only
#   scripts\test.ps1 -Frontend    frontend only
#   scripts\test.ps1 -Cov         add coverage reports
#   scripts\test.ps1 -Lint        run linters/type-checks instead of the suites
#
# Run it as: powershell -ExecutionPolicy Bypass -File scripts\test.ps1 [flags]
#
# -Lint runs ruff over backend\ and `npm run typecheck` + `npm run lint` over frontend\.
# It honours -Backend/-Frontend the same way the suites do.
#
# Neither suite needs Redis, a .env file, model weights or a network connection. The
# Playwright suite (test.sh --e2e) does not run on Windows: playwright.config.ts starts
# its stack with e2e/stack.sh, which is bash. CI runs it on every PR.
#
# Any further arguments are passed through to pytest, so this works:
#   scripts\test.ps1 -Backend -k tenancy -v
# A short pytest flag that is also the start of a switch above binds to that switch
# (-l is -Lint, -c is -Cov), so use pytest's long form: --showlocals, --config-file=...
#
# No [CmdletBinding()] on purpose: in a simple script, arguments that match no
# parameter (-k, -v) land in $args instead of failing to bind.
param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$Cov,
    [switch]$Lint,
    [switch]$E2E,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'lib.ps1')
if ($Help) { Show-Usage $PSCommandPath; exit 0 }

if ($E2E) {
    Exit-WithError ("the Playwright suite needs bash: playwright.config.ts starts its stack with e2e/stack.sh.`n" +
        "      Run ./scripts/test.sh --e2e on macOS or Linux, or rely on CI's 'E2E (Playwright)' job.")
}

$pytestArgs = @($args)
$runBackend = -not $Frontend
$runFrontend = -not $Backend
$failed = $false

if ($Lint) {
    if ($runBackend) {
        Confirm-Venv
        $ruff = Join-Path $Venv 'Scripts\ruff.exe'
        if (-not (Test-Path $ruff)) {
            Exit-WithError "ruff is not installed in $Venv`n      Run: scripts\setup.ps1"
        }
        Write-Step 'running ruff'
        # Config is backend\pyproject.toml; run from there so its excludes apply.
        Push-Location $BackendDir
        try { & $ruff check . } finally { Pop-Location }
        if ($LASTEXITCODE -eq 0) { Write-Ok 'ruff' } else { Write-Warn 'ruff found problems'; $failed = $true }
    }

    if ($runFrontend) {
        Confirm-Command 'npm'
        if (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
            Exit-WithError "no $FrontendDir\node_modules`n      Run: scripts\setup.ps1"
        }
        Write-Step 'running tsc'
        & npm --prefix $FrontendDir run typecheck --silent
        if ($LASTEXITCODE -eq 0) { Write-Ok 'typecheck' } else { Write-Warn 'typecheck failed'; $failed = $true }

        Write-Step 'running eslint'
        & npm --prefix $FrontendDir run lint --silent
        if ($LASTEXITCODE -eq 0) { Write-Ok 'eslint' } else { Write-Warn 'eslint found problems'; $failed = $true }
    }

    if ($failed) { Exit-WithError 'one or more checks failed' }
    Write-Ok 'all checks passed'
    exit 0
}

if ($runBackend) {
    Confirm-Venv
    if (-not (Test-Path (Join-Path $Venv 'Scripts\pytest.exe'))) {
        Exit-WithError "pytest is not installed in $Venv`n      Run: scripts\setup.ps1"
    }

    if ($Cov) {
        $pytestArgs += @('--cov=app', '--cov=external', '--cov=inference', '--cov-report=term-missing')
    }

    Write-Step 'running backend tests'
    # backend\ must be the working directory: pytest.ini lives there, and app.*,
    # external.* and inference.* are top-level packages resolved relative to it.
    Push-Location $BackendDir
    try { & $Py -m pytest @pytestArgs } finally { Pop-Location }
    if ($LASTEXITCODE -eq 0) { Write-Ok 'backend' } else { Write-Warn 'backend tests failed'; $failed = $true }
}

if ($runFrontend) {
    Confirm-Command 'npm'
    if (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
        Exit-WithError "no $FrontendDir\node_modules`n      Run: scripts\setup.ps1"
    }

    Write-Step 'running frontend tests'
    # '--' quoted: bare, PowerShell takes it as its own end-of-parameters marker when
    # npm resolves to npm.ps1, and --coverage would then go to npm instead of jest.
    if ($Cov) {
        & npm --prefix $FrontendDir run test:ci '--' --coverage
    } else {
        & npm --prefix $FrontendDir run test:ci
    }
    if ($LASTEXITCODE -eq 0) { Write-Ok 'frontend' } else { Write-Warn 'frontend tests failed'; $failed = $true }
}

if ($failed) { Exit-WithError 'one or more suites failed' }
Write-Ok 'all suites passed'
