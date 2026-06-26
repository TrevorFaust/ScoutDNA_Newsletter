param([string]$Date, [string]$Team)
$script = Join-Path $PSScriptRoot "..\scripts\compose.ps1"
if ($Date -and $Team) { & $script -Date $Date -Team $Team }
elseif ($Team) { & $script -Team $Team }
elseif ($Date) { & $script -Date $Date }
else { & $script }
