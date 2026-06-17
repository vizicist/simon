@echo off
call "%~dp0Start-BopPadSimon.cmd"

"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --start-fullscreen %USERPROFILE%\github\simon\index.html
