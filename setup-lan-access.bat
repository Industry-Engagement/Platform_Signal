@echo off
cd /d "%~dp0"
echo Windows will ask for Administrator approval to add the private-LAN firewall rule.
powershell.exe -NoProfile -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0setup-lan-access.ps1""'"
