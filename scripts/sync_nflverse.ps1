param(
    [switch]$RostersOnly,
    [switch]$DepthOnly,
    [switch]$CoachingOnly,
    [switch]$DraftOnly
)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

Push-Location $Pipeline
try {
    $pyArgs = @("-m", "src.run_sync_nflverse")
    if ($RostersOnly) { $pyArgs += "--rosters-only" }
    if ($DepthOnly) { $pyArgs += "--depth-only" }
    if ($CoachingOnly) { $pyArgs += "--coaching-only" }
    if ($DraftOnly) { $pyArgs += "--draft-only" }
    & $VenvPython @pyArgs
} finally {
    Pop-Location
}
