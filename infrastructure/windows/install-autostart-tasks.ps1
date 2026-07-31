$ErrorActionPreference = "Stop"

$isAdministrator = (New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdministrator) {
  throw "Run this script from PowerShell as Administrator."
}

$powerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

$tasks = @(
  @{
    Name = "UngPhoNhanh-Backend"
    Script = Join-Path $PSScriptRoot "run-backend.ps1"
    Description = "Starts the Ung Pho Nhanh NestJS backend on port 3100."
  },
  @{
    Name = "UngPhoNhanh-Frontend"
    Script = Join-Path $PSScriptRoot "run-frontend.ps1"
    Description = "Starts the Ung Pho Nhanh Next.js frontend on port 3200."
  },
  @{
    Name = "UngPhoNhanh-EdgeProxy"
    Script = Join-Path $PSScriptRoot "run-edge-proxy.ps1"
    Description = "Serves the hybrid LAN entry point on https://ungphonhanh.life."
  },
  @{
    Name = "UngPhoNhanh-AiService"
    Script = Join-Path $PSScriptRoot "run-ai-service.ps1"
    Description = "Starts the Ung Pho Nhanh FastAPI AI service on port 8000."
  }
)

foreach ($task in $tasks) {
  $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$($task.Script)`""
  $action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments

  Register-ScheduledTask `
    -Action $action `
    -Description $task.Description `
    -Force `
    -Principal $principal `
    -Settings $settings `
    -TaskName $task.Name `
    -Trigger $trigger | Out-Null
}

Write-Output "Registered UngPhoNhanh-Backend, UngPhoNhanh-Frontend, UngPhoNhanh-EdgeProxy, and UngPhoNhanh-AiService."
