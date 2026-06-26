# Run from project root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\compose.ps1 -Team pittsburgh-steelers
# Or:  .\scripts\compose.ps1 -Team pittsburgh-steelers
# Optional: .\scripts\compose.ps1 -Date 2026-05-21 -Team pittsburgh-steelers
# Multiple teams (quote the list): -Team "pittsburgh-steelers,cleveland-browns"

param(
    [string]$Date,
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
    $pyArgs = @("-m", "src.run_compose")
    if ($Date) { $pyArgs += @("--date", $Date) }
    if ($Team) { $pyArgs += @("--team", $Team) }
    & $VenvPython @pyArgs
} finally {
    Pop-Location
}
