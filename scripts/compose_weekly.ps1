# Weekly compose (Monday week-in-review). Run from project root:
#   .\scripts\compose_weekly.ps1
#   .\scripts\compose_weekly.ps1 -Date 2026-07-14
#   .\scripts\compose_weekly.ps1 -Date 2026-07-07 -Force   # backfill non-Monday

param(
    [string]$Date,
    [switch]$Force
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
    $pyArgs = @("-m", "src.run_compose_weekly")
    if ($Date) { $pyArgs += @("--date", $Date) }
    if ($Force) { $pyArgs += @("--force") }
    & $VenvPython @pyArgs
} finally {
    Pop-Location
}
