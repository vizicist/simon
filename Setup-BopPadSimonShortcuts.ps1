$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $appDir "Start-BopPadSimon.cmd"
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$programsDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$taskbarDir = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
$startupScript = Join-Path $startupDir "simon_onboot.bat"
$startMenuShortcut = Join-Path $programsDir "Bop Pad Simon.lnk"
$taskbarShortcut = Join-Path $taskbarDir "Bop Pad Simon.lnk"
$iconLocation = Join-Path $env:SystemRoot "System32\shell32.dll"

function New-LauncherShortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $parent -Force | Out-Null

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $env:ComSpec
  $shortcut.Arguments = "/c ""$launcher"""
  $shortcut.WorkingDirectory = $appDir
  $shortcut.Description = "Start Bop Pad Simon"
  $shortcut.IconLocation = "$iconLocation,137"
  $shortcut.Save()
}

function Pin-StartMenuShortcutToTaskbar {
  try {
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.Namespace($programsDir)
    $item = $folder.ParseName("Bop Pad Simon.lnk")
    if (-not $item) {
      return $false
    }

    $verb = @($item.Verbs()) |
      Where-Object { $_.Name.Replace("&", "") -match "Pin to taskbar" } |
      Select-Object -First 1

    if (-not $verb) {
      return $false
    }

    $verb.DoIt()
    return $true
  } catch {
    return $false
  }
}

New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
Set-Content -LiteralPath $startupScript -Encoding ASCII -Value @(
  "@echo off",
  "call ""$launcher"""
)

New-LauncherShortcut -Path $startMenuShortcut
New-LauncherShortcut -Path $taskbarShortcut
$pinned = Pin-StartMenuShortcutToTaskbar

Write-Host "Installed BopPad Simon startup launcher to ""$startupScript"""
Write-Host "Installed BopPad Simon Start Menu shortcut to ""$startMenuShortcut"""
Write-Host "Installed BopPad Simon taskbar shortcut to ""$taskbarShortcut"""
if ($pinned) {
  Write-Host "Requested Windows taskbar pin for Bop Pad Simon."
} else {
  Write-Host "Created the taskbar shortcut. If Windows does not show it immediately, pin the Start Menu shortcut named Bop Pad Simon."
}
