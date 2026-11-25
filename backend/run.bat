@echo off
setlocal enabledelayedexpansion
title BSC Exclusive POMS - Full Stack Launcher

REM Unset npm configuration environment variables leaked by npm run (prevents EALLOWSCRIPTS on npm v11)
set npm_config_allow_scripts=

REM ============================================================
REM  BSC Exclusive POMS - ONE-CLICK FULL STACK LAUNCHER
REM  Runs the ENTIRE project:
REM    1. Verifies Node.js and npm
REM    2. Ensures the MySQL service is running
REM    3. Installs dependencies if missing (backend & frontend)
REM    4. Verifies MySQL, applies schema migrations, seeds a fresh database
REM    5. Starts backend API (http://localhost:4040)
REM    6. Starts frontend UI (http://localhost:5173)
REM    7. Opens the browser automatically
REM ============================================================

cd /d "%~dp0.."

echo.
echo ============================================================
echo   BSC Exclusive POMS - Starting Full Stack Application
echo ============================================================
echo.

REM ---- 0. Verify Node.js and npm ----
where node >NUL 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not found in PATH.
  echo         Please install Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK]   Node.js !NODE_VER! detected.

where npm >NUL 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not found in PATH.
  echo         Please install Node.js/npm from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo [OK]   npm v!NPM_VER! detected.
echo.

REM ---- 1. Ensure MySQL is running ----
echo [....] Checking MySQL service...
netstat -ano | findstr ":3306 " | findstr "LISTENING" >NUL 2>&1
if not errorlevel 1 (
  echo [OK]   MySQL is listening on port 3306.
) else (
  echo [....] Starting MySQL80 service...
  net start MySQL80 >NUL 2>&1
  if not errorlevel 1 (
    echo [OK]   MySQL80 started successfully.
  ) else (
    echo [WARN] Could not auto-start MySQL80. Start MySQL manually or check DB_HOST in backend.env.
  )
)
echo.

REM ---- 2. Install dependencies if missing ----
if not exist "%~dp0..\backend\node_modules\" (
  echo [....] Backend dependencies not found. Installing...
  pushd "%~dp0..\backend"
  set npm_config_allow_scripts=
  call npm install
  popd
  if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies.
    echo.
    pause
    exit /b 1
  )
  echo [OK]   Backend dependencies installed.
  echo.
) else (
  echo [OK]   Backend dependencies found.
)

if not exist "%~dp0..\frontend\node_modules\" (
  echo [....] Frontend dependencies not found. Installing...
  pushd "%~dp0..\frontend"
  set npm_config_allow_scripts=
  call npm install
  popd
  if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies.
    echo.
    pause
    exit /b 1
  )
  echo [OK]   Frontend dependencies installed.
  echo.
) else (
  echo [OK]   Frontend dependencies found.
)
echo.

REM ---- 3. Kill stale node processes on project ports ----
echo [....] Checking for stale processes on ports 4040 and 5173...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4040 " ^| findstr "LISTENING" 2^>NUL') do (
  echo [....] Killing stale backend process PID %%p on port 4040...
  taskkill /PID %%p /F >NUL 2>&1
  if not errorlevel 1 echo [OK]   Killed stale backend process [PID %%p]
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING" 2^>NUL') do (
  echo [....] Killing stale frontend process PID %%p on port 5173...
  taskkill /PID %%p /F >NUL 2>&1
  if not errorlevel 1 echo [OK]   Killed stale frontend process [PID %%p]
)
echo [OK]   Ports 4040 and 5173 are clear.
ping -n 2 127.0.0.1 >NUL 2>&1
echo.

REM ---- 4. Auto-setup & verify database ----
echo [....] Verifying database connection, schema, and seed data...
pushd "%~dp0..\backend"
node scripts\setup-db.mjs
set SETUP_STATUS=!errorlevel!
popd

if not "!SETUP_STATUS!"=="0" (
  echo.
  echo ============================================================
  echo   [ERROR] Database setup failed!
  echo.
  echo   Possible causes:
  echo     - MySQL service [MySQL80] is not running
  echo     - DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME in backend.env are wrong
  echo     - The MySQL account lacks CREATE / ALTER / INDEX / REFERENCES on the database
  echo.
  echo   Current target in backend.env [password not shown]:
  for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0..\backend.env") do (
    if "%%A"=="DB_HOST" echo     DB_HOST=%%B
    if "%%A"=="DB_PORT" echo     DB_PORT=%%B
    if "%%A"=="DB_NAME" echo     DB_NAME=%%B
    if "%%A"=="DB_USER" echo     DB_USER=%%B
  )
  echo.
  echo   Solutions:
  echo     1. Ensure MySQL is running: net start MySQL80
  echo     2. Diagnose: cd backend ^&^& npm run db:check
  echo.
  echo   Fix the above and try again.
  echo ============================================================
  echo.
  pause
  exit /b 1
)
echo.

REM ---- 5. Start backend API ----
echo [....] Starting backend API on http://localhost:4040...
start "POMS Backend" /D "%~dp0..\backend" cmd /k "title POMS Backend [port 4040] && npm run dev"

REM Wait for backend to be ready
set /a b_tries=0
:waitbackend
ping -n 2 127.0.0.1 >NUL 2>&1
set /a b_tries+=1
curl -s -o NUL -w "%%{http_code}" http://127.0.0.1:4040/api/health 2>NUL | findstr "200" >NUL 2>&1
if not errorlevel 1 (
  echo [OK]   Backend is up on http://localhost:4040
  goto backend_done
)
if !b_tries! lss 30 goto waitbackend
echo [WARN] Backend did not respond within 30s.
echo         Check the "POMS Backend" window for errors.
echo         Proceeding anyway...
:backend_done
echo.

REM ---- 6. Start frontend UI ----
echo [....] Starting frontend UI on http://localhost:5173...
start "POMS Frontend" /D "%~dp0..\frontend" cmd /k "title POMS Frontend [port 5173] && npm run dev"

REM Wait for frontend to be ready
set /a f_tries=0
:waitfrontend
ping -n 2 127.0.0.1 >NUL 2>&1
set /a f_tries+=1
curl -s -o NUL http://localhost:5173 >NUL 2>&1
if not errorlevel 1 (
  echo [OK]   Frontend is up on http://localhost:5173
  goto frontend_done
)
if !f_tries! lss 30 goto waitfrontend
echo [WARN] Frontend did not respond within 30s.
echo         Check the "POMS Frontend" window for errors.
:frontend_done
echo.

REM ---- 7. Open browser ----
echo [....] Opening browser...
timeout /t 2 /nobreak >NUL
start "" http://localhost:5173

echo.
echo ============================================================
echo.
echo   BSC Exclusive POMS is running!
echo.
echo     Frontend : http://localhost:5173
echo     Backend  : http://localhost:4040
echo     Database : MySQL [see DB_* in backend\.env]
echo.
echo   Demo Credentials:
echo     Super Admin : admin@bsc.local / Admin@123
echo     Supervisor  : men.supervisor@bsc.local / DS@12345
echo     Buyer / PE  : buyer.dvg@bsc.local / PE@12345
echo.
echo   Keep the POMS Backend and Frontend windows open.
echo   Close them when you want to stop the application.
echo.
echo ============================================================
echo.
pause

