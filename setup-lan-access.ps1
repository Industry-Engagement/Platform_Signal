#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$ruleName = "Platform Signal Local Website"

$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    $existingRule | Remove-NetFirewallRule
}

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Description "Allow the Platform Signal local website from this trusted private subnet only." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8000 `
    -Profile Private `
    -RemoteAddress LocalSubnet | Out-Null

$privateProfiles = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq "Private" }
Write-Host "Platform Signal LAN access is enabled for TCP port 8000." -ForegroundColor Green
Write-Host "The rule applies only to Private networks and devices on the local subnet."
if (-not $privateProfiles) {
    Write-Warning "Windows does not currently show an active Private network. Set your trusted Wi-Fi network profile to Private before using LAN access."
}
Write-Host ""
Write-Host "Start the website with start-website.bat, then use the LAN URL printed in its server window."
