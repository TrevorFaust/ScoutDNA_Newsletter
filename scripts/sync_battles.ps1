# Upsert curated position battles from data/fantasy_position_battles_2026.csv
$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

Push-Location $Pipeline
try {
    & $VenvPython -m src.sync_fantasy_battles
} finally {
    Pop-Location
}
