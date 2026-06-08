$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 80
$hostName = "127.0.0.1"
$url = "http://$hostName/?v=97"
$pidFile = Join-Path $appDir ".bop-pad-simon-server.pid"
$browserPidFile = Join-Path $appDir ".bop-pad-simon-browser.pid"
$browserProfileDir = Join-Path $appDir ".chrome-kiosk-profile"

function Stop-PreviousServer {
  if (-not (Test-Path -LiteralPath $pidFile)) {
    return
  }

  $serverPid = Get-Content -LiteralPath $pidFile | Select-Object -First 1
  if ($serverPid) {
    try {
      Stop-Process -Id ([int]$serverPid) -Force -ErrorAction Stop
    } catch {
      # The previous server may already be gone.
    }
  }

  Remove-Item -LiteralPath $pidFile -Force
}

function Stop-PreviousBrowser {
  if (-not (Test-Path -LiteralPath $browserPidFile)) {
    return
  }

  $browserPid = Get-Content -LiteralPath $browserPidFile | Select-Object -First 1
  if ($browserPid) {
    try {
      Stop-Process -Id ([int]$browserPid) -Force -ErrorAction Stop
    } catch {
      # The previous kiosk browser may already be gone.
    }
  }

  Remove-Item -LiteralPath $browserPidFile -Force
}

function Test-Server {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $connect = $client.BeginConnect($hostName, $port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(300)) {
      $client.Close()
      return $false
    }

    $client.EndConnect($connect)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-BrowserCommand {
  foreach ($name in @("chrome")) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  foreach ($path in @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return $path
    }
  }

  return $null
}

function Get-PythonCommand {
  $candidates = @(
    "py",
    "python3",
    "python",
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe")
  )

  foreach ($candidate in $candidates) {
    try {
      $command = Get-Command $candidate -ErrorAction SilentlyContinue
      if (-not $command) {
        continue
      }

      $output = & $command.Source --version 2>&1
      if ($LASTEXITCODE -eq 0 -and "$output" -match "Python \d+\.\d+") {
        return $command.Source
      }
    } catch {
      continue
    }
  }

  throw "Python is required to start Bop Pad Simon. Install Python from https://www.python.org/downloads/ or add a working python.exe to PATH."
}

Stop-PreviousServer
Stop-PreviousBrowser

if (-not (Test-Server)) {
  $python = Get-PythonCommand
  $server = Start-Process `
    -FilePath $python `
    -ArgumentList @("bop_pad_simon_server.py") `
    -WorkingDirectory $appDir `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $server.Id

  $deadline = (Get-Date).AddSeconds(5)
  while (-not (Test-Server)) {
    if ((Get-Date) -gt $deadline) {
      throw "Bop Pad Simon server did not start on $url"
    }

    Start-Sleep -Milliseconds 150
  }
}

$browser = Get-BrowserCommand
if ($browser) {
  $browserProfileArg = "--user-data-dir=`"$browserProfileDir`""
  $browserProcess = Start-Process `
    -FilePath $browser `
    -ArgumentList @("--new-window", "--kiosk", $browserProfileArg, $url) `
    -PassThru

  Set-Content -LiteralPath $browserPidFile -Value $browserProcess.Id
} else {
  Start-Process $url
}
