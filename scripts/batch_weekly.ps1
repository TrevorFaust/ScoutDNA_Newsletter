# Backfill weekly issues sequentially
$weeks = @(
    @{ Label = "June 1-7";   Date = "2026-06-08" },
    @{ Label = "June 8-14";  Date = "2026-06-15" },
    @{ Label = "June 22-28"; Date = "2026-06-29" },
    @{ Label = "Jun 29-Jul 6"; Date = "2026-07-07"; Force = $true }
)

$Root = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Root "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "weekly_backfill_$(Get-Date -Format 'yyyy-MM-dd_HHmm').log"

function Write-Log($Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

Write-Log "Starting weekly backfill (4 weeks, skipping 2026-06-22 already done)"

foreach ($w in $weeks) {
    Write-Log "=== $($w.Label) -> $($w.Date)-weekly ==="
    $start = Get-Date
    $args = @{ Date = $w.Date }
    if ($w.Force) { $args.Force = $true }
    & (Join-Path $PSScriptRoot "compose_weekly.ps1") @args
    if ($LASTEXITCODE -ne 0) {
        Write-Log "FAILED $($w.Date) exit $LASTEXITCODE"
        exit 1
    }
    $mins = [math]::Round(((Get-Date) - $start).TotalMinutes, 1)
    Write-Log "Done $($w.Date)-weekly in ${mins}m"
}

Write-Log "All 4 weekly issues in_review. Log: $LogFile"
