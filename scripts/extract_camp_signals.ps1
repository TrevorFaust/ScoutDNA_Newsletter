# Extract camp signals + rebuild 7-day slot scores + refresh the battle
# proposal queue (/admin/camp-signals). Run after collect/media.
#   .\scripts\extract_camp_signals.ps1
#   .\scripts\extract_camp_signals.ps1 -Date 2026-07-07
#   .\scripts\extract_camp_signals.ps1 -Team BAL
#   .\scripts\extract_camp_signals.ps1 -SkipExtract   # aggregate + propose only
#   .\scripts\extract_camp_signals.ps1 -SkipPropose   # extract + aggregate only

param(
    [string]$Date,
    [string]$Team,
    [switch]$SkipExtract,
    [switch]$SkipPropose,
    [int]$WindowDays = 7
)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Missing venv. Run: cd pipeline; python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
    exit 1
}

Push-Location $Pipeline
try {
    $args = @("-m", "src.run_extract_camp_signals", "--window-days", $WindowDays)
    if ($Date) { $args += @("--date", $Date) }
    if ($Team) { $args += @("--team", $Team) }
    if ($SkipExtract) { $args += "--skip-extract" }
    if ($SkipPropose) { $args += "--skip-propose" }
    & $VenvPython @args
} finally {
    Pop-Location
}
