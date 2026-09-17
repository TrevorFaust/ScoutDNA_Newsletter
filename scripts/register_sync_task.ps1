param(
    [string]$Time = "03:00"
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

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "3am PT nflverse roster/depth/usage/games sync; Tuesday also composes the weekly recap." -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' daily at $Time."
Write-Host "Test now: Start-ScheduledTask -TaskName '$TaskName'"
