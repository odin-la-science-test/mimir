# Script pour voir les logs en temps reel
# Usage: .\logs.ps1

$flyctl = "$env:USERPROFILE\.fly\bin\flyctl.exe"

Write-Host "Logs de Mimir (Ctrl+C pour quitter)" -ForegroundColor Cyan
Write-Host ""

& $flyctl logs --app mimir-bot
