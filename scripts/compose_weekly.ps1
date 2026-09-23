# Weekly compose (Tuesday week recap). Run from project root:
#   .\scripts\compose_weekly.ps1
#   .\scripts\compose_weekly.ps1 -Date 2026-09-15 -Force
#   .\scripts\compose_weekly.ps1 -Date 2026-09-22
#   .\scripts\compose_weekly.ps1 -Date 2026-09-16 -Force   # backfill non-Tuesday
#   .\scripts\compose_weekly.ps1 -Date 2026-09-22 -Team dallas-cowboys

param(
    [string]$Date,
    [switch]$Force,
    [string]$Team
)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Missing venv. See README Quick start."
    exit 1
}

Push-Location $Pipeline
try {
    Write-Host "Syncing ESPN injury board before weekly compose..."
    & $VenvPython -m src.sync_espn_injuries
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $pyArgs = @("-m", "src.run_compose_weekly")
    if ($Date) { $pyArgs += @("--date", $Date) }
    if ($Force) { $pyArgs += @("--force") }
    if ($Team) { $pyArgs += @("--team", $Team) }
    & $VenvPython @pyArgs
} finally {
    Pop-Location
}
