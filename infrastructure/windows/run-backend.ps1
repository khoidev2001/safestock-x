$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendRoot = Join-Path $projectRoot "apps\backend"
$entryPoint = Join-Path $backendRoot "dist\src\main.js"
$nodePath = "C:\Program Files\nodejs\node.exe"
$logDirectory = Join-Path $env:ProgramData "UngPhoNhanh\logs"
$logFile = Join-Path $logDirectory "backend.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $nodePath)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Node.js not found: $nodePath"
  exit 2
}

if (-not (Test-Path -LiteralPath $entryPoint)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Backend build not found: $entryPoint"
  exit 3
}

Set-Location -LiteralPath $backendRoot
$env:NODE_ENV = "production"

while ($true) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Starting backend"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $nodePath $entryPoint *>> $logFile
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Backend exited with code $exitCode; restarting in 10 seconds"
  Start-Sleep -Seconds 10
}
