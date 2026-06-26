# Run from project root or pipeline/ (via pipeline\youtube.ps1)
param(
    [string]$Date,
    [string]$Url,
    [int]$MaxVideos,
    [string]$WhisperModel,
    [string]$Team
)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Missing venv. See docs/YOUTUBE_SETUP.md"
    exit 1
}

Push-Location $Pipeline
try {
    $pyArgs = @("-m", "src.run_youtube")
    if ($Date) { $pyArgs += @("--date", $Date) }
    if ($Url) { $pyArgs += @("--url", $Url) }
    if ($PSBoundParameters.ContainsKey("MaxVideos")) { $pyArgs += @("--max-videos", $MaxVideos) }
    if ($WhisperModel) { $pyArgs += @("--whisper-model", $WhisperModel) }
    if ($Team) { $pyArgs += @("--team", $Team) }
    & $VenvPython @pyArgs
} finally {
    Pop-Location
}
