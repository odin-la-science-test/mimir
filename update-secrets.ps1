# ============================================================
# Script de mise à jour des secrets Fly.io
# ============================================================
# Ce script lit le fichier .env local et met à jour tous les
# secrets sur Fly.io automatiquement
# ============================================================

param(
    [string]$AppName = "mimir-bot"
)

$ErrorActionPreference = "Stop"
$flyctl = "$env:USERPROFILE\.fly\bin\flyctl.exe"

Write-Host "🔐 Mise à jour des secrets Fly.io..." -ForegroundColor Cyan
Write-Host ""

# Vérifier que le fichier .env existe
if (-not (Test-Path ".env")) {
    Write-Host "❌ Fichier .env introuvable!" -ForegroundColor Red
    Write-Host "   Assure-toi d'être dans le répertoire du projet." -ForegroundColor Yellow
    exit 1
}

# Lire le fichier .env
Write-Host "📖 Lecture du fichier .env..." -ForegroundColor Yellow
$envContent = Get-Content ".env" | Where-Object { $_ -match "^\s*[A-Z_]+=.+" -and $_ -notmatch "^\s*#" }

$secrets = @{}
foreach ($line in $envContent) {
    if ($line -match "^\s*([A-Z_]+)\s*=\s*(.+)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        
        # Ignorer les placeholders
        if ($value -notmatch "CLÉ_|_ICI|your_.*_here") {
            $secrets[$key] = $value
            Write-Host "   ✓ $key" -ForegroundColor Green
        } else {
            Write-Host "   ⚠ $key (ignoré, valeur placeholder)" -ForegroundColor Yellow
        }
    }
}

if ($secrets.Count -eq 0) {
    Write-Host "❌ Aucun secret valide trouvé dans .env" -ForegroundColor Red
    Write-Host "   Remplace les placeholders (CLÉ_*_ICI) par tes vraies clés API" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🚀 Mise à jour de $($secrets.Count) secret(s) sur Fly.io..." -ForegroundColor Cyan

# Construire la commande avec tous les secrets
$secretArgs = @()
foreach ($key in $secrets.Keys) {
    $secretArgs += "$key=$($secrets[$key])"
}

# Exécuter la commande
try {
    & $flyctl secrets set @secretArgs --app $AppName
    Write-Host ""
    Write-Host "✅ Secrets mis à jour avec succès!" -ForegroundColor Green
    Write-Host "   Le bot va redémarrer automatiquement sur Fly.io" -ForegroundColor Cyan
} catch {
    Write-Host ""
    Write-Host "❌ Erreur lors de la mise à jour des secrets:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
