$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$aiServiceRoot = Join-Path $projectRoot "apps\ai-service"
$pythonPath = Join-Path $aiServiceRoot ".venv\Scripts\python.exe"
$entryPoint = Join-Path $aiServiceRoot "main.py"
$logDirectory = Join-Path $env:ProgramData "UngPhoNhanh\logs"
$logFile = Join-Path $logDirectory "ai-service.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
. (Join-Path $PSScriptRoot "rotate-log.ps1")

if (-not (Test-Path -LiteralPath $pythonPath)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Python venv not found: $pythonPath"
  exit 2
}

if (-not (Test-Path -LiteralPath $entryPoint)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] AI service entry point not found: $entryPoint"
  exit 3
}

Set-Location -LiteralPath $aiServiceRoot
# Service chạy dưới SYSTEM với stdout mã cp1252; một dòng log tiếng Việt có dấu là
# UnicodeEncodeError và sập cả tiến trình. Khoá UTF-8 cho chắc.
$env:PYTHONIOENCODING = "utf-8"

while ($true) {
  Invoke-LogRotation -LogFile $logFile
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Starting AI service"
  # Uvicorn writes normal startup logs to stderr; do not treat those lines as fatal PowerShell errors.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $pythonPath -m uvicorn main:app --host 127.0.0.1 --port 8000 *>> $logFile
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] AI service exited with code $exitCode; restarting in 10 seconds"
  Start-Sleep -Seconds 10
}
