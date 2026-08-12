# Script pour voir l'etat du bot
# Usage: .\status.ps1

$flyctl = "$env:USERPROFILE\.fly\bin\flyctl.exe"

Write-Host "Etat de Mimir sur Fly.io" -ForegroundColor Cyan
Write-Host ""

& $flyctl status --app mimir-bot

Write-Host ""
Write-Host "Liste des apps:" -ForegroundColor Yellow
& $flyctl apps list

Write-Host ""
Write-Host "Utilisation des ressources:" -ForegroundColor Yellow
& $flyctl scale show --app mimir-bot
