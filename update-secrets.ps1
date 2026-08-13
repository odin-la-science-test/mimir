# Script de mise a jour des secrets Fly.io
# Ce script lit le fichier .env local et met a jour tous les secrets sur Fly.io automatiquement

param(
    [string]$AppName = "mimir-bot"
)

$ErrorActionPreference = "Stop"
$flyctl = "$env:USERPROFILE\.fly\bin\flyctl.exe"

Write-Host "Mise a jour des secrets Fly.io..." -ForegroundColor Cyan
Write-Host ""

# Verifier que le fichier .env existe
if (-not (Test-Path ".env")) {
    Write-Host "Erreur: Fichier .env introuvable!" -ForegroundColor Red
    Write-Host "Assure-toi d'etre dans le repertoire du projet." -ForegroundColor Yellow
    exit 1
}

# Lire le fichier .env
Write-Host "Lecture du fichier .env..." -ForegroundColor Yellow
$envContent = Get-Content ".env" | Where-Object { $_ -match "^\s*[A-Z_]+=.+" -and $_ -notmatch "^\s*#" }

$secrets = @{}
foreach ($line in $envContent) {
    if ($line -match "^\s*([A-Z_]+)\s*=\s*(.+)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        
        # Ignorer les placeholders
        if ($value -notmatch "CLE_|_ICI|your_.*_here") {
            $secrets[$key] = $value
            Write-Host "   OK: $key" -ForegroundColor Green
        } else {
            Write-Host "   IGNORE: $key (valeur placeholder)" -ForegroundColor Yellow
        }
    }
}

if ($secrets.Count -eq 0) {
    Write-Host "Erreur: Aucun secret valide trouve dans .env" -ForegroundColor Red
    Write-Host "Remplace les placeholders par tes vraies cles API" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Mise a jour de $($secrets.Count) secret(s) sur Fly.io..." -ForegroundColor Cyan

# Construire la commande avec tous les secrets
$secretArgs = @()
foreach ($key in $secrets.Keys) {
    $secretArgs += "$key=$($secrets[$key])"
}

# Executer la commande
try {
    & $flyctl secrets set @secretArgs --app $AppName
    Write-Host ""
    Write-Host "Secrets mis a jour avec succes!" -ForegroundColor Green
    Write-Host "Le bot va redemarrer automatiquement sur Fly.io" -ForegroundColor Cyan
} catch {
    Write-Host ""
    Write-Host "Erreur lors de la mise a jour des secrets:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
