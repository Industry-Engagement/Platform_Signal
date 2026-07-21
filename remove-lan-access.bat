@echo off
cd /d "%~dp0"
echo Windows will ask for Administrator approval to remove the Platform Signal firewall rule.
powershell.exe -NoProfile -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0remove-lan-access.ps1""'"
