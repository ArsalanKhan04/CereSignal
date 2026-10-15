# Stop the backend that backend-start.ps1 runs. Exits 0 when nothing was running.
#
# Run it as: powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
#
# The Windows counterpart of stop.sh. There is no Celery worker or Redis to stop here:
# on Windows the backend runs the tasks itself.
param([switch]$Help)

. (Join-Path $PSScriptRoot 'lib.ps1')
if ($Help) { Show-Usage $PSCommandPath; exit 0 }

Write-Step 'stopping CereSignal services'

# Anchored to this repo's venv, so another checkout's backend, or an unrelated command
# that merely mentions uvicorn, is left alone.
$scriptsDir = Join-Path $Venv 'Scripts'
$servers = @(Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and
        $_.ExecutablePath.StartsWith($scriptsDir, [StringComparison]::OrdinalIgnoreCase) -and
        $_.CommandLine -and $_.CommandLine.Contains('app.main:app')
    })

if ($servers.Count -eq 0) {
    Write-Skip 'backend (uvicorn) was not running'
} else {
    # uvicorn.exe and the venv python.exe it launches both match; kill from the top only.
    $ids = @($servers | ForEach-Object { $_.ProcessId })
    $roots = @($servers | Where-Object { $ids -notcontains $_.ParentProcessId })
    foreach ($process in $roots) {
        # /T takes the whole tree: the interpreter that the venv's launcher starts, and
        # the server process that --reload runs it in. Windows has no SIGTERM for a
        # console process, so this is the equivalent of stop.sh's SIGKILL fallback.
        & taskkill.exe /PID $process.ProcessId /T /F | Out-Null
    }
    Write-Ok 'stopped backend (uvicorn)'
}

# The frontend dev server is started via npm, so it is left to its own terminal.
Write-Host ''
Write-Host 'Note' -ForegroundColor DarkGray -NoNewline
Write-Host ' the frontend dev server is not managed here - Ctrl-C it in its own terminal.'
