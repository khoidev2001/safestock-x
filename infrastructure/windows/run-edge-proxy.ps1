$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$configPath = Join-Path $projectRoot "infrastructure\caddy\Caddyfile.hybrid"
$defaultCaddyPath = "C:\Program Files\Caddy\caddy.exe"
$caddyPath = if ($env:UNGPhoNhanh_CADDY_PATH) { $env:UNGPhoNhanh_CADDY_PATH } else { $defaultCaddyPath }
$stateDirectory = Join-Path $env:ProgramData "UngPhoNhanh\caddy"
$logDirectory = Join-Path $env:ProgramData "UngPhoNhanh\logs"
$logFile = Join-Path $logDirectory "edge-proxy.log"

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
. (Join-Path $PSScriptRoot "rotate-log.ps1")

if (-not (Test-Path -LiteralPath $caddyPath)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Caddy not found: $caddyPath"
  exit 2
}

if (-not (Test-Path -LiteralPath $configPath)) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Caddy configuration not found: $configPath"
  exit 3
}

# A fixed SYSTEM-owned storage path keeps the internal CA stable across task
# restarts. Back it up securely; recreating it would require trusting a new CA
# on every LAN client.
$env:XDG_DATA_HOME = $stateDirectory
$env:XDG_CONFIG_HOME = $stateDirectory

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $caddyPath validate --config $configPath --adapter caddyfile *>> $logFile
$validateExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($validateExitCode -ne 0) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Caddy configuration validation failed"
  exit $validateExitCode
}

while ($true) {
  Invoke-LogRotation -LogFile $logFile
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] Starting LAN edge proxy"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $caddyPath run --config $configPath --adapter caddyfile *>> $logFile
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format o)] LAN edge proxy exited with code $exitCode; restarting in 10 seconds"
  Start-Sleep -Seconds 10
}
