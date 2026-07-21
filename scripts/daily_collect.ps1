# Daily pipeline: collect + media every day; compose (LLM draft) only on Mondays (weekly edition).
# Non-Monday days collect + ingest media + extract camp signals but do NOT spend Claude tokens
# composing a draft - there is no daily edition anymore, just the once-a-week Monday recap.
# Scheduled at 1:00 AM PT the morning after the edition date
# (e.g. June 30 1am -> issue 2026-06-29, content window = June 28).
# Leaves the issue in in_review for admin approve/publish.
#
# Manual run from project root:
#   .\scripts\daily_collect.ps1
#   .\scripts\daily_collect.ps1 -Date 2026-06-29
#   .\scripts\daily_collect.ps1 -SkipReddit
#   .\scripts\daily_collect.ps1 -SkipMedia   # skip YouTube/podcasts
#   .\scripts\daily_collect.ps1 -SkipCompose # collect only, no compose at all
#   .\scripts\daily_collect.ps1 -Weekly      # force weekly compose (backfill non-Monday date)
#   .\scripts\daily_collect.ps1 -DailyCompose # explicitly request a one-off daily edition (any day)

param(
    [string]$Date,
    [switch]$SkipReddit,
    [switch]$SkipMedia,
    [switch]$SkipCompose,
    [switch]$Weekly,
    [switch]$DailyCompose,
    [int]$MediaWorkers = 6,
    [int]$MaxVideos = 2,
    [int]$MaxEpisodes = 2
)

$includeMedia = -not $SkipMedia
$includeCompose = -not $SkipCompose

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Root "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Pacific Standard Time")
$nowPt = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
$isMondayPt = $nowPt.DayOfWeek -eq [DayOfWeek]::Monday

if (-not $Date) {
    if ($isMondayPt) {
        $Date = $nowPt.ToString("yyyy-MM-dd")
        if (-not $DailyCompose) { $Weekly = $true }
    } else {
        $Date = $nowPt.AddDays(-1).ToString("yyyy-MM-dd")
    }
}

if ($DailyCompose) {
    # Explicitly requested — one-off daily edition regardless of day of week.
    $includeWeeklyCompose = $false
    $includeDailyCompose = $includeCompose
} elseif ($Weekly) {
    # Monday's unattended run (auto-set above), or an explicit weekly backfill.
    $includeWeeklyCompose = $includeCompose
    $includeDailyCompose = $false
} else {
    # Default: collect + media only, no LLM compose. There is no daily edition
    # unless -DailyCompose (or -Weekly) is explicitly passed.
    $includeWeeklyCompose = $false
    $includeDailyCompose = $false
}

$LogFile = Join-Path $LogDir ("daily_collect_{0}.log" -f $Date)

function Write-Log($Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

$composeMode = if ($includeWeeklyCompose) { "weekly" } elseif ($includeDailyCompose) { "daily" } else { "none" }
Write-Log "Pipeline for issue date $Date (reddit=$([bool](-not $SkipReddit)), media=$includeMedia, compose=$composeMode)"

try {
    $collectArgs = @{ Date = $Date }
    if ($SkipReddit) { $collectArgs.SkipReddit = $true }
    Write-Log "Running collect.ps1..."
    & (Join-Path $PSScriptRoot "collect.ps1") @collectArgs
    if ($LASTEXITCODE -ne 0) { throw "collect exited $LASTEXITCODE" }

    if ($includeMedia) {
        Write-Log "Running media_batch.ps1 (YouTube + podcasts, all 32 teams)..."
        & (Join-Path $PSScriptRoot "media_batch.ps1") -Date $Date -AllTeams -Workers $MediaWorkers -MaxVideos $MaxVideos -MaxEpisodes $MaxEpisodes
        if ($LASTEXITCODE -ne 0) { throw "media_batch exited $LASTEXITCODE" }
    }

    Write-Log "Running extract_camp_signals.ps1 (camp momentum layer)..."
    & (Join-Path $PSScriptRoot "extract_camp_signals.ps1") -Date $Date
    if ($LASTEXITCODE -ne 0) { throw "extract_camp_signals exited $LASTEXITCODE" }

    if ($includeWeeklyCompose) {
        Write-Log "Running compose_weekly.ps1 (Monday week in review)..."
        & (Join-Path $PSScriptRoot "compose_weekly.ps1") -Date $Date
        if ($LASTEXITCODE -ne 0) { throw "compose_weekly exited $LASTEXITCODE" }
        $slug = "$Date-weekly"
        Write-Log "Done. Weekly issue $Date is in_review - review at /admin/review/$slug"
    } elseif ($includeDailyCompose) {
        Write-Log "Running compose.ps1 (all 32 teams)..."
        & (Join-Path $PSScriptRoot "compose.ps1") -Date $Date
        if ($LASTEXITCODE -ne 0) { throw "compose exited $LASTEXITCODE" }
        Write-Log "Done. Issue $Date is in_review - review at /admin/review/$Date"
    } else {
        Write-Log "Done. Raw items stored for issue $Date."
    }
} catch {
    Write-Log "FAILED: $_"
    exit 1
}