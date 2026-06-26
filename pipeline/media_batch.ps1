param(
    [string]$Date,
    [switch]$AllTeams,
    [string]$Team,
    [int]$Workers = 6,
    [int]$MaxVideos,
    [int]$MaxEpisodes,
    [switch]$YoutubeOnly,
    [switch]$PodcastsOnly
)
& (Join-Path $PSScriptRoot "..\scripts\media_batch.ps1") @PSBoundParameters
