param([string]$File, [switch]$DryRun)
$script = Join-Path $PSScriptRoot "..\scripts\import_sources.ps1"
if ($File -and $DryRun) { & $script -File $File -DryRun }
elseif ($File) { & $script -File $File }
elseif ($DryRun) { & $script -DryRun }
else { & $script }
