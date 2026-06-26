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



$Root = Split-Path $PSScriptRoot -Parent

$Pipeline = Join-Path $Root "pipeline"

$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"



Push-Location $Pipeline

try {

    $args = @("-m", "src.run_media_batch", "--workers", $Workers)

    if ($Date) { $args += @("--date", $Date) }

    if ($Team) { $args += @("--team", $Team) }

    if ($AllTeams) { $args += "--all-teams" }

    if ($MaxVideos) { $args += @("--max-videos", $MaxVideos) }

    if ($MaxEpisodes) { $args += @("--max-episodes", $MaxEpisodes) }

    if ($YoutubeOnly) { $args += "--youtube-only" }

    if ($PodcastsOnly) { $args += "--podcasts-only" }

    & $VenvPython @args

} finally {

    Pop-Location

}

