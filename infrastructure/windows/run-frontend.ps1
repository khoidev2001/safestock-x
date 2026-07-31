$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$frontendRoot = Join-Path $projectRoot "apps\frontend"
$entryPoint = Join-Path $frontendRoot "node_modules\next\dist\bin\next"
$buildId = Join-Path $frontendRoot ".next\BUILD_ID"
$nodePath = "C:\Program Files\nodejs\node.exe"
$logDirectory = Join-Path $env:ProgramData "UngPhoNhanh\logs"
$logFile = Join-Path $logDirectory "frontend.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $nodePath)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Node.js not found: $nodePath"
  exit 2
}

if (-not (Test-Path -LiteralPath $entryPoint)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Next.js entry point not found: $entryPoint"
  exit 3
}

if (-not (Test-Path -LiteralPath $buildId)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Frontend build not found: $buildId"
  exit 4
}

Set-Location -LiteralPath $frontendRoot
$env:NODE_ENV = "production"

while ($true) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Starting frontend"
  # Caddy is the only LAN ingress. Keeping Next on loopback prevents a direct
  # http://server:3200 path from bypassing the one-domain HTTPS boundary.
  & $nodePath $entryPoint "start" "-p" "3200" "--hostname" "127.0.0.1" *>> $logFile
  $exitCode = $LASTEXITCODE
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Frontend exited with code $exitCode; restarting in 10 seconds"
  Start-Sleep -Seconds 10
}
