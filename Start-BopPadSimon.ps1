$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5173
$hostName = "127.0.0.1"
$url = "http://$hostName`:$port/"
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

if (-not (Test-Server)) {
  $python = Get-Command python -ErrorAction Stop
  $server = Start-Process `
    -FilePath $python.Source `
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

Start-Process $url
