$ErrorActionPreference = "SilentlyContinue"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $appDir ".bop-pad-simon-server.pid"

if (Test-Path -LiteralPath $pidFile) {
  $serverPid = Get-Content -LiteralPath $pidFile | Select-Object -First 1
  if ($serverPid) {
    Stop-Process -Id ([int]$serverPid) -Force
  }

  Remove-Item -LiteralPath $pidFile
}
