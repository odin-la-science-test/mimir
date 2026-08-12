# Script de verification et installation de Fly CLI
# Usage: .\check-fly.ps1

Write-Host "Verification de Fly CLI..." -ForegroundColor Cyan
Write-Host ""

# Ajouter le chemin au PATH
$flyPath = "$env:USERPROFILE\.fly\bin"
if (Test-Path $flyPath) {
    $env:Path = "$flyPath;$env:Path"
    Write-Host "[OK] Chemin trouve: $flyPath" -ForegroundColor Green
}

# Tester flyctl
try {
    $version = & "$flyPath\flyctl.exe" version 2>&1
    Write-Host "[OK] Fly CLI est installe!" -ForegroundColor Green
    Write-Host "Version: $version" -ForegroundColor White
    Write-Host ""
    Write-Host "Tu peux maintenant lancer:" -ForegroundColor Yellow
    Write-Host "  .\deploy.ps1" -ForegroundColor White
} catch {
    Write-Host "[ERREUR] Fly CLI non trouve" -ForegroundColor Red
    Write-Host ""
    Write-Host "Verification du dossier d'installation..." -ForegroundColor Yellow
    
    if (Test-Path "$env:USERPROFILE\.fly\bin\flyctl.exe") {
        Write-Host "[OK] Fichier flyctl.exe existe!" -ForegroundColor Green
        Write-Host "Chemin: $env:USERPROFILE\.fly\bin\flyctl.exe" -ForegroundColor White
        Write-Host ""
        Write-Host "Le probleme vient du PATH. Lance:" -ForegroundColor Yellow
        Write-Host "  .\deploy.ps1" -ForegroundColor White
        Write-Host "(Le script va corriger le PATH automatiquement)" -ForegroundColor Cyan
    } else {
        Write-Host "[ERREUR] Fly CLI pas installe" -ForegroundColor Red
        Write-Host ""
        Write-Host "Installation en cours..." -ForegroundColor Yellow
        iwr https://fly.io/install.ps1 -useb | iex
        
        Write-Host ""
        Write-Host "Relance ce script pour verifier:" -ForegroundColor Yellow
        Write-Host "  .\check-fly.ps1" -ForegroundColor White
    }
}
