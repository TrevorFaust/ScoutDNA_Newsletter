param([string]$Date, [string]$Url, [int]$MaxVideos, [string]$WhisperModel, [string]$Team)
$script = Join-Path $PSScriptRoot "..\scripts\youtube.ps1"
& $script @PSBoundParameters
