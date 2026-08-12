# Script de mise à jour rapide
# Usage: .\update.ps1 "description des changements"

param(
    [string]$message = "Update bot"
)

Write-Host "🔄 Mise à jour de Mimir..." -ForegroundColor Cyan
Write-Host ""

# Commit les changements
Write-Host "📝 Commit des changements..." -ForegroundColor Yellow
git add -A
git commit -m $message

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Aucun changement à commiter ou erreur git" -ForegroundColor Yellow
}

# Push sur GitHub
Write-Host "📤 Push sur GitHub..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push GitHub échoué" -ForegroundColor Red
    exit 1
}

# Déploiement sur Fly.io
Write-Host ""
Write-Host "🚀 Déploiement sur Fly.io..." -ForegroundColor Yellow
flyctl deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Déploiement échoué" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Mise à jour terminée!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Logs du bot:" -ForegroundColor Yellow

Start-Sleep -Seconds 2
flyctl logs
