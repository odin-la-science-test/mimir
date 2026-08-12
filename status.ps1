# Script pour voir l'état du bot
# Usage: .\status.ps1

Write-Host "📊 État de Mimir sur Fly.io" -ForegroundColor Cyan
Write-Host ""

flyctl status

Write-Host ""
Write-Host "🌐 Liste des apps:" -ForegroundColor Yellow
flyctl apps list

Write-Host ""
Write-Host "💰 Utilisation des ressources:" -ForegroundColor Yellow
flyctl scale show
