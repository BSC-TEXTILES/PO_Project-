@echo off
setlocal
title BSC Exclusive POMS - Dev Servers

REM Starts backend + frontend only. The database must already be running
REM (use run.bat for the full one-click setup including the database).

cd /d "%~dp0.."

if not exist "backend\node_modules\" (
  echo [ERROR] Backend dependencies are missing. Run run.bat first.
  pause
  exit /b 1
)
if not exist "frontend\node_modules\" (
  echo [ERROR] Frontend dependencies are missing. Run run.bat first.
  pause
  exit /b 1
)

echo Starting POMS backend on http://localhost:4040 ...
start "POMS Backend" cmd /k "cd /d "%~dp0..\backend" && npm run dev"

echo Starting POMS frontend on http://localhost:5173 ...
start "POMS Frontend" cmd /k "cd /d "%~dp0..\frontend" && npm run dev"

timeout /t 4 /nobreak >NUL
start "" http://localhost:5173

echo.
echo Backend and frontend are starting in separate windows.
echo Close those windows (or press Ctrl+C in them) to stop the servers.
