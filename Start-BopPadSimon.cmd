@echo off
pushd "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-BopPadSimon.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-BopPadSimon.ps1"
set "exitCode=%ERRORLEVEL%"
popd
exit /b %exitCode%
