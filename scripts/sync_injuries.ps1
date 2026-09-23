# Sync ESPN NFL injury board into player_injury_status.
# Run before Tuesday weekly compose (or daily during the season).
#   .\scripts\sync_injuries.ps1

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Missing venv. See README Quick start."
    exit 1
}

Push-Location $Pipeline
try {
    & $VenvPython -m src.sync_espn_injuries
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
