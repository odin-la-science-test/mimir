# Script de mise a jour rapide
# Usage: .\update.ps1 "description des changements"

param(
    [string]$message = "Update bot"
)

Write-Host "[MISE A JOUR] Mimir..." -ForegroundColor Cyan
Write-Host ""

# Commit les changements
Write-Host "Commit des changements..." -ForegroundColor Yellow
git add -A
git commit -m $message

if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Aucun changement a commiter ou erreur git" -ForegroundColor Yellow
}

# Push sur GitHub
Write-Host "Push sur GitHub..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] Push GitHub echoue" -ForegroundColor Red
    exit 1
}

# Deploiement sur Fly.io
Write-Host ""
Write-Host "Deploiement sur Fly.io..." -ForegroundColor Yellow
flyctl deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] Deploiement echoue" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[OK] Mise a jour terminee!" -ForegroundColor Green
Write-Host ""
Write-Host "Logs du bot:" -ForegroundColor Yellow

Start-Sleep -Seconds 2
flyctl logs
