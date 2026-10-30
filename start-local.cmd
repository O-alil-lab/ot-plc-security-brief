@echo off
rem Double-click to run OT & PLC Security Brief on this computer.
rem Needs Node.js 20.11+ (https://nodejs.org). No database install required.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies - first run only, this takes a few minutes...
  call npm ci
  if errorlevel 1 (
    echo Dependency install failed. See the messages above.
    pause
    exit /b 1
  )
)
call npm run local
pause
