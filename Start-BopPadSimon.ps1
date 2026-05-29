$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5173
$hostName = "127.0.0.1"
$url = "http://$hostName`:$port/?v=97"
$pidFile = Join-Path $appDir ".bop-pad-simon-server.pid"

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

if (-not (Test-Server)) {
  $python = Get-PythonCommand
  $server = Start-Process `
    -FilePath $python `
    -ArgumentList @("-m", "http.server", "$port", "--bind", "$hostName") `
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
  Start-Process -FilePath $browser -ArgumentList @("--new-window", "--kiosk", $url)
} else {
  Start-Process $url
}
