@echo off
setlocal
cd /d "%~dp0"
"runtime\node.exe" "launch.mjs"
if errorlevel 1 (
  echo Pixelhue Studio could not start. Check the message above.
  pause
)
