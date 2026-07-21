#Requires -RunAsAdministrator

$ruleName = "Platform Signal Local Website"
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($rule) {
    $rule | Remove-NetFirewallRule
    Write-Host "Platform Signal LAN firewall access was removed." -ForegroundColor Green
} else {
    Write-Host "The Platform Signal LAN firewall rule was not present."
}
