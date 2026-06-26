param([string]$Date, [string]$Team, [int]$MaxEpisodes)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

Push-Location $Pipeline
try {
    $args = @("-m", "src.run_podcasts")
    if ($Date) { $args += @("--date", $Date) }
    if ($Team) { $args += @("--team", $Team) }
    if ($MaxEpisodes) { $args += @("--max-episodes", $MaxEpisodes) }
    & $VenvPython @args
} finally {
    Pop-Location
}
