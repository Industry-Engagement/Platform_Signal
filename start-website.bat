@echo off
setlocal
cd /d "%~dp0"
set "PYTHONDONTWRITEBYTECODE=1"

set "PYTHON_COMMAND="
where py >nul 2>nul
if not errorlevel 1 set "PYTHON_COMMAND=py -3"
if not defined PYTHON_COMMAND (
  where python >nul 2>nul
  if not errorlevel 1 set "PYTHON_COMMAND=python"
)

if not defined PYTHON_COMMAND (
  echo Python was not found.
  echo Install Python 3.10 or newer, then open a new terminal and run this launcher again.
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Get-NetFirewallRule -DisplayName 'Platform Signal Local Website' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo LAN firewall access is not configured yet.
  echo Before using another computer, double-click setup-lan-access.bat and approve the Administrator prompt.
  echo.
)

echo Starting the integrated Platform Signal website...
echo This window must remain open while the website is in use.
echo.
%PYTHON_COMMAND% "Flight_Data\realtime-flight-tracker\server.py" --host 0.0.0.0 --port 8000 --open-browser

if errorlevel 1 (
  echo.
  echo The integrated server stopped with an error.
  pause
)

endlocal
