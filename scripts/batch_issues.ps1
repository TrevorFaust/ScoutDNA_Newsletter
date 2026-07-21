# Backfill or refresh issues for a date range (collect, optional media, full 32-team compose).
#
# From project root:
#   .\scripts\batch_issues.ps1 -StartDate 2026-06-01 -EndDate 2026-06-26
#   .\scripts\batch_issues.ps1 -StartDate 2026-06-01 -EndDate 2026-06-26 -IncludeMedia
#   .\scripts\batch_issues.ps1 -StartDate 2026-06-01 -EndDate 2026-06-26 -SkipCollect

param(
    [string]$StartDate = "2026-06-01",
    [string]$EndDate = "2026-06-26",
    [switch]$SkipCollect,
    [switch]$IncludeMedia,
    [switch]$SkipReddit,
    [switch]$NewestFirst,
    [int]$MediaWorkers = 6,
    [int]$MaxVideos = 2,
    [int]$MaxEpisodes = 2
)

# Default: skip Reddit in batch runs (avoids rate limits; use RSS + media instead).
if (-not $PSBoundParameters.ContainsKey('SkipReddit')) {
    $SkipReddit = $true
}
if (-not $PSBoundParameters.ContainsKey('IncludeMedia')) {
    # Compose-only backfill (SkipCollect) should not re-ingest media unless asked.
    $IncludeMedia = -not $SkipCollect
}
if (-not $PSBoundParameters.ContainsKey('NewestFirst')) {
    $NewestFirst = $true
}

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Root "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir ("batch_{0}_{1}.log" -f $StartDate, $EndDate)

function Write-Log($Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

$start = [datetime]::ParseExact($StartDate, "yyyy-MM-dd", $null)
$end = [datetime]::ParseExact($EndDate, "yyyy-MM-dd", $null)
if ($end -lt $start) { throw "EndDate must be on or after StartDate" }

Write-Log "Batch start: $StartDate to $EndDate (collect=$([bool](-not $SkipCollect)), reddit=$([bool](-not $SkipReddit)), media=$IncludeMedia)"
Write-Log "Log file: $LogFile"

$dates = @()
for ($d = $start; $d -le $end; $d = $d.AddDays(1)) {
    $dates += $d.ToString("yyyy-MM-dd")
}
if ($NewestFirst) {
    [array]::Reverse($dates)
}

$failed = @()
foreach ($date in $dates) {
    Write-Log "========== $date =========="
    try {
        if (-not $SkipCollect) {
            Write-Log "Collecting $date..."
            $collectArgs = @{ Date = $date }
            if ($SkipReddit) { $collectArgs.SkipReddit = $true }
            & (Join-Path $PSScriptRoot "collect.ps1") @collectArgs
            if ($LASTEXITCODE -ne 0) { throw "collect exited $LASTEXITCODE" }
        }
        if ($IncludeMedia) {
            Write-Log "Media batch $date..."
            & (Join-Path $PSScriptRoot "media_batch.ps1") -Date $date -AllTeams -Workers $MediaWorkers -MaxVideos $MaxVideos -MaxEpisodes $MaxEpisodes
            if ($LASTEXITCODE -ne 0) { throw "media_batch exited $LASTEXITCODE" }
        }
        Write-Log "Composing all 32 teams for $date..."
        & (Join-Path $PSScriptRoot "compose.ps1") -Date $date
        if ($LASTEXITCODE -ne 0) { throw "compose exited $LASTEXITCODE" }
        Write-Log "Done $date - status in_review, review at /admin/review/$date"
    } catch {
        Write-Log "FAILED $date : $_"
        $failed += $date
    }
}

Write-Log "Batch complete. OK: $($dates.Count - $failed.Count) / $($dates.Count)"
if ($failed.Count) {
    Write-Log "Failed dates: $($failed -join ', ')"
    exit 1
}
