param(
    [string]$Date,
    [string]$Team,
    [int]$MaxVideos,
    [int]$MaxEpisodes,
    [switch]$YoutubeOnly,
    [switch]$PodcastsOnly
)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

Push-Location $Pipeline
try {
    # Do not use $args — PowerShell reserves it; breaks --team forwarding.
    $pyArgs = @("-m", "src.run_media")
    if ($Date) { $pyArgs += @("--date", $Date) }
    if ($Team) { $pyArgs += @("--team", $Team) }
    if ($PSBoundParameters.ContainsKey("MaxVideos")) { $pyArgs += @("--max-videos", $MaxVideos) }
    if ($PSBoundParameters.ContainsKey("MaxEpisodes")) { $pyArgs += @("--max-episodes", $MaxEpisodes) }
    if ($YoutubeOnly) { $pyArgs += "--youtube-only" }
    if ($PodcastsOnly) { $pyArgs += "--podcasts-only" }
    & $VenvPython @pyArgs
} finally {
    Pop-Location
}
