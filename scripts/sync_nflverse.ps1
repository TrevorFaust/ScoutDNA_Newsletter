param(
    [switch]$RostersOnly,
    [switch]$DepthOnly,
    [switch]$CoachingOnly,
    [switch]$DraftOnly,
    [switch]$UsageOnly,
    [switch]$SkipCompose
)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Pacific Standard Time")
$nowPt = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
$isTuesdayPt = $nowPt.DayOfWeek -eq [DayOfWeek]::Tuesday

Push-Location $Pipeline
try {
    $pyArgs = @("-m", "src.run_sync_nflverse")
    if ($RostersOnly) { $pyArgs += "--rosters-only" }
    if ($DepthOnly) { $pyArgs += "--depth-only" }
    if ($CoachingOnly) { $pyArgs += "--coaching-only" }
    if ($DraftOnly) { $pyArgs += "--draft-only" }
    if ($UsageOnly) { $pyArgs += "--usage-only" }
    & $VenvPython @pyArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

if (-not $SkipCompose -and $isTuesdayPt -and -not ($RostersOnly -or $DepthOnly -or $CoachingOnly -or $DraftOnly)) {
    $today = $nowPt.ToString("yyyy-MM-dd")
    Write-Host "Tuesday nflverse sync finished — composing weekly $today"
    & (Join-Path $PSScriptRoot "compose_weekly.ps1") -Date $today
}

