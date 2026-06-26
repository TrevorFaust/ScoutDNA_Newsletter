param(
    [string]$Time = "07:00"
)

$Root = Split-Path $PSScriptRoot -Parent
$SyncScript = Join-Path $Root "scripts\sync_nflverse.ps1"
$TaskName = "ScoutDNA-nflverse-sync"

if (-not (Test-Path $SyncScript)) {
    Write-Error "Missing $SyncScript"
    exit 1
}

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -File `"$SyncScript`""
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "Daily nflverse roster/depth/coaching sync for ScoutDNA newsletter" -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' daily at $Time."
Write-Host "Test now: Start-ScheduledTask -TaskName '$TaskName'"
