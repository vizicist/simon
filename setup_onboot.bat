@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-BopPadSimonShortcuts.ps1"
exit /b %ERRORLEVEL%
