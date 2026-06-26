param(
    [string]$Date,
    [string]$Team,
    [int]$MaxVideos,
    [int]$MaxEpisodes,
    [switch]$YoutubeOnly,
    [switch]$PodcastsOnly
)
& (Join-Path $PSScriptRoot "..\scripts\media.ps1") @PSBoundParameters
