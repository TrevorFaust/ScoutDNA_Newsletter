param(
    [switch]$RostersOnly,
    [switch]$DepthOnly,
    [switch]$CoachingOnly
)
& (Join-Path $PSScriptRoot "..\scripts\sync_nflverse.ps1") @PSBoundParameters
