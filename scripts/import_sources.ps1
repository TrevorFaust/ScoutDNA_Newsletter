param([string]$File, [switch]$DryRun)

$Root = Split-Path $PSScriptRoot -Parent
$Pipeline = Join-Path $Root "pipeline"
$VenvPython = Join-Path $Pipeline ".venv\Scripts\python.exe"
$Csv = if ($File) { $File } else { Join-Path $Root "data\sources_registry.csv" }

Push-Location $Pipeline
try {
    $args = @("-m", "src.import_sources", "--file", $Csv)
    if ($DryRun) { $args += "--dry-run" }
    & $VenvPython @args
} finally {
    Pop-Location
}
