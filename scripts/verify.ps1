# Pre-flight before migrations
$Root = Split-Path $PSScriptRoot -Parent
$Python = Join-Path $Root "pipeline\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    Write-Error "Run pipeline venv setup first."
    exit 1
}
Set-Location (Join-Path $Root "pipeline")
& $Python -m src.verify_connection
