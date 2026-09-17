# Daily pipeline: collect + media every day. Weekly LLM compose is NOT in this
# 1am job — it runs after the 3am PT nflverse sync on Tuesdays so MNF boxes exist.
#
# Scheduled at 1:00 AM PT the morning after the edition date
# (e.g. June 30 1am -> issue 2026-06-29, content window = June 28).
# Tuesday 1am also collects TODAY so Monday Night Football talk is in the weekly window.
#
# Manual run from project root:
#   .\scripts\daily_collect.ps1
#   .\scripts\daily_collect.ps1 -Date 2026-06-29
#   .\scripts\daily_collect.ps1 -SkipReddit
#   .\scripts\daily_collect.ps1 -SkipMedia   # skip YouTube/podcasts
#   .\scripts\daily_collect.ps1 -SkipCompose # collect only (default already skips compose)
#   .\scripts\daily_collect.ps1 -Weekly      # force weekly compose (backfill; use -Date)
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
$isTuesdayPt = $nowPt.DayOfWeek -eq [DayOfWeek]::Tuesday
$extraDate = $null

if (-not $Date) {
    $Date = $nowPt.AddDays(-1).ToString("yyyy-MM-dd")
    if ($isTuesdayPt -and -not $DailyCompose) {
        $extraDate = $nowPt.ToString("yyyy-MM-dd")
    }
}

if ($DailyCompose) {
    $includeWeeklyCompose = $false
    $includeDailyCompose = $includeCompose
} elseif ($Weekly) {
    $includeWeeklyCompose = $includeCompose
    $includeDailyCompose = $false
} else {
    $includeWeeklyCompose = $false
    $includeDailyCompose = $false
}

$LogFile = Join-Path $LogDir ("daily_collect_{0}.log" -f $Date)

function Write-Log($Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

function Invoke-CollectDate([string]$IssueDate) {
    $collectArgs = @{ Date = $IssueDate }
    if ($SkipReddit) { $collectArgs.SkipReddit = $true }
    Write-Log "Running collect.ps1 for $IssueDate..."
    & (Join-Path $PSScriptRoot "collect.ps1") @collectArgs
    if ($LASTEXITCODE -ne 0) { throw "collect exited $LASTEXITCODE" }

    if ($includeMedia) {
        Write-Log "Running media_batch.ps1 for $IssueDate..."
        & (Join-Path $PSScriptRoot "media_batch.ps1") -Date $IssueDate -AllTeams -Workers $MediaWorkers -MaxVideos $MaxVideos -MaxEpisodes $MaxEpisodes
        if ($LASTEXITCODE -ne 0) { throw "media_batch exited $LASTEXITCODE" }
    }

    Write-Log "Running extract_camp_signals.ps1 for $IssueDate..."
    & (Join-Path $PSScriptRoot "extract_camp_signals.ps1") -Date $IssueDate
    if ($LASTEXITCODE -ne 0) { throw "extract_camp_signals exited $LASTEXITCODE" }
}

$composeMode = if ($includeWeeklyCompose) { "weekly" } elseif ($includeDailyCompose) { "daily" } else { "none" }
Write-Log "Pipeline for issue date $Date extra=$extraDate (reddit=$([bool](-not $SkipReddit)), media=$includeMedia, compose=$composeMode)"

try {
    Invoke-CollectDate $Date
    if ($extraDate) {
        Invoke-CollectDate $extraDate
    }

    if ($includeWeeklyCompose) {
        Write-Log "Running compose_weekly.ps1 (week recap)..."
        $weeklyArgs = @{ Date = $Date }
        if (-not $isTuesdayPt) { $weeklyArgs.Force = $true }
        & (Join-Path $PSScriptRoot "compose_weekly.ps1") @weeklyArgs
        if ($LASTEXITCODE -ne 0) { throw "compose_weekly exited $LASTEXITCODE" }
        $slug = "$Date-weekly"
        Write-Log "Done. Weekly issue $Date is in_review - review at /admin/review/$slug"
    } elseif ($includeDailyCompose) {
        Write-Log "Running compose.ps1 (all 32 teams)..."
        & (Join-Path $PSScriptRoot "compose.ps1") -Date $Date
        if ($LASTEXITCODE -ne 0) { throw "compose exited $LASTEXITCODE" }
        Write-Log "Done. Issue $Date is in_review - review at /admin/review/$Date"
    } else {
        Write-Log "Done. Raw items stored for issue $Date$(if ($extraDate) { " and $extraDate" })."
    }
} catch {
    Write-Log "FAILED: $_"
    exit 1
}
