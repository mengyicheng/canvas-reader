@echo off
cd /d "%~dp0"

REM Add Node.js to PATH. When double-clicking, the system PATH often
REM lacks Node (it lives at D:\soft\work\NODEJS on this machine and is
REM only visible inside PowerShell). Without this, "npm" is not found.
if exist "D:\soft\work\NODEJS\node.exe" set "PATH=D:\soft\work\NODEJS;%PATH%"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] node.exe not found. Install Node.js or add it to PATH.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found even though node exists.
  pause
  exit /b 1
)

echo canvas_reader: starting tauri dev...
echo Current dir: %CD%
echo.
echo (First run compiles Rust deps - please wait a few minutes)
echo (Full log is written to dev-log.txt)
echo.

set LOG=%~dp0dev-log.txt
echo [%date% %time%] === tauri dev start === > "%LOG%"
call npm run tauri dev >> "%LOG%" 2>&1
set RC=%errorlevel%
echo [%date% %time%] === tauri dev exit code %RC% === >> "%LOG%"

echo.
echo ===== dev-log.txt (last 40 lines) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content '%LOG%' -Tail 40" 2>nul
echo.
if %RC% neq 0 (
  echo [FAILED] tauri dev exited with error. Check dev-log.txt or output above.
) else (
  echo [DONE] tauri dev exited normally.
)
pause
