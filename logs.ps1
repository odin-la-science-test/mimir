# Script pour voir les logs en temps reel
# Usage: .\logs.ps1

Write-Host "Logs de Mimir (Ctrl+C pour quitter)" -ForegroundColor Cyan
Write-Host ""

flyctl logs
