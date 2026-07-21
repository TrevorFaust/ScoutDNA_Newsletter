# Register Windows Task Scheduler job: daily collect + media at 1:00 AM local time.
# Set Windows timezone to Pacific (PT) so 1am = 1am PT.
# Issue date = yesterday (PT). Example: June 30 1am -> issue 2026-06-29 -> in_review when done.
#
# Default: Reddit + RSS + YouTube + podcasts + camp signals every day, LLM compose only on
# Mondays (weekly recap). Non-Monday runs collect/ingest only - no daily edition, no extra
# Claude spend. Expect ~2-5 hours on Monday, faster the rest of the week.
#
# Run once from PowerShell:
#   cd "path\to\nfl_newsletter"
#   .\scripts\register_collect_task.ps1
#
# Collect only, no compose ever (not even Monday):
#   .\scripts\register_collect_task.ps1 -SkipCompose
#
# Reddit/RSS only (no media):
#   .\scripts\register_collect_task.ps1 -SkipMedia
#
# Want a one-off daily edition on a non-Monday? Run manually:
#   .\scripts\daily_collect.ps1 -DailyCompose
#
# Test immediately:
#   Start-ScheduledTask -TaskName "ScoutDNA-daily-collect"
#
# Remove:
#   Unregister-ScheduledTask -TaskName "ScoutDNA-daily-collect" -Confirm:$false

param(
    [string]$Time = "01:00",
    [switch]$SkipMedia,
    [switch]$SkipCompose
)

$Root = Split-Path $PSScriptRoot -Parent
$DailyScript = Join-Path $Root "scripts\daily_collect.ps1"
$TaskName = "ScoutDNA-daily-collect"

if (-not (Test-Path $DailyScript)) {
    Write-Error "Missing $DailyScript"
    exit 1
}

$extraFlags = ""
if ($SkipMedia) { $extraFlags += " -SkipMedia" }
if ($SkipCompose) { $extraFlags += " -SkipCompose" }
$Argument = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$DailyScript`"$extraFlags"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Argument -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 8)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "ScoutDNA daily pipeline: collect + media every day, compose only on Monday (weekly recap) -> in_review." `
    -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' daily at $Time (local system time)."
Write-Host "  Ensure Windows is set to Pacific time, or adjust -Time to match PT."
Write-Host "  Script: $DailyScript"
Write-Host "  Pipeline: Reddit + RSS$(if (-not $SkipMedia) { ' + YouTube + podcasts' })$(if (-not $SkipCompose) { ' + weekly compose on Monday -> in_review' } else { ' (no compose, ever)' })"
Write-Host ""
Write-Host "Test now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "View logs: Get-Content '$Root\logs\daily_collect_*.log' -Tail 30"
