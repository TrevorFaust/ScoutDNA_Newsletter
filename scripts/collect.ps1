# Run from anywhere: .\scripts\collect.ps1
# Optional: .\scripts\collect.ps1 -Date 2026-05-21 -Team pittsburgh-steelers
# YouTube (slower): .\scripts\media.ps1 -Team pittsburgh-steelers -MaxVideos 1

param([string]$Date, [string]$Team)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Missing venv. Run: cd pipeline; python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
    exit 1
}

Push-Location $Pipeline
try {
    $args = @("-m", "src.run_collect")
    if ($Date) { $args += @("--date", $Date) }
    if ($Team) { $args += @("--team", $Team) }
    & $VenvPython @args
} finally {
    Pop-Location
}
