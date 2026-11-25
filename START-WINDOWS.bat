@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20.19 or newer, then run this file again.
  pause
  exit /b 1
)

echo Installing the exact project dependencies...
call npm run setup
if errorlevel 1 (
  echo Dependency installation failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo Starting SmartBiz Manager...
start "" http://localhost:5173
call npm run dev
pause
