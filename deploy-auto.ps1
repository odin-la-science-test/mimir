# Script de deploiement AUTOMATIQUE (sans interaction)
# Usage: 
#   1. Edite deploy-config.ps1 avec tes cles API
#   2. Lance: .\deploy-auto.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DEPLOIEMENT AUTOMATIQUE - Mimir" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Charger la configuration
if (-not (Test-Path ".\deploy-config.ps1")) {
    Write-Host "[ERREUR] Fichier deploy-config.ps1 introuvable" -ForegroundColor Red
    Write-Host ""
    Write-Host "Cree d'abord le fichier de config:" -ForegroundColor Yellow
    Write-Host "1. Edite deploy-config.ps1" -ForegroundColor White
    Write-Host "2. Remplace les valeurs par tes vraies cles API" -ForegroundColor White
    Write-Host "3. Relance ce script" -ForegroundColor White
    exit 1
}

Write-Host "[INFO] Chargement de la configuration..." -ForegroundColor Yellow
. .\deploy-config.ps1
Write-Host ""

# Verification des cles
$hasError = $false

if ($DISCORD_TOKEN -eq "COLLE_TON_TOKEN_DISCORD_ICI" -or $DISCORD_TOKEN -eq "") {
    Write-Host "[ERREUR] DISCORD_TOKEN manquant dans deploy-config.ps1" -ForegroundColor Red
    $hasError = $true
}

if ($GEMINI_API_KEY -eq "COLLE_TA_CLE_GEMINI_ICI" -or $GEMINI_API_KEY -eq "") {
    Write-Host "[ERREUR] GEMINI_API_KEY manquant dans deploy-config.ps1" -ForegroundColor Red
    $hasError = $true
}

if ($hasError) {
    Write-Host ""
    Write-Host "Edite deploy-config.ps1 et ajoute tes cles API" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Configuration valide!" -ForegroundColor Green
Write-Host ""

# Definir le chemin vers flyctl
$flyctl = "$env:USERPROFILE\.fly\bin\flyctl.exe"

if (-not (Test-Path $flyctl)) {
    Write-Host "[ERREUR] Fly CLI non installe" -ForegroundColor Red
    Write-Host "Lance d'abord: .\deploy.ps1" -ForegroundColor Yellow
    exit 1
}

# Verification de l'authentification
Write-Host "[ETAPE 1/4] Verification de l'authentification..." -ForegroundColor Yellow
$authStatus = & $flyctl auth whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] Non connecte a Fly.io" -ForegroundColor Red
    Write-Host "Lance: flyctl auth login" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Connecte: $authStatus" -ForegroundColor Green
Write-Host ""

# Verification/Creation de l'app
Write-Host "[ETAPE 2/4] Configuration de l'application..." -ForegroundColor Yellow
$appExists = & $flyctl apps list 2>&1 | Select-String "mimir-bot"

if (-not $appExists) {
    Write-Host "[INFO] Creation de l'app mimir-bot..." -ForegroundColor Cyan
    
    # Creer l'app sans interaction
    & $flyctl apps create mimir-bot --org personal 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Impossible de creer l'app" -ForegroundColor Red
        Write-Host "Lance manuellement: flyctl launch" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[OK] App creee!" -ForegroundColor Green
} else {
    Write-Host "[OK] App existe deja" -ForegroundColor Green
}
Write-Host ""

# Configuration des secrets
Write-Host "[ETAPE 3/4] Configuration des secrets..." -ForegroundColor Yellow

Write-Host "  - DISCORD_TOKEN..." -NoNewline
& $flyctl secrets set DISCORD_TOKEN="$DISCORD_TOKEN" --stage --app mimir-bot 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [ERREUR]" -ForegroundColor Red
}

Write-Host "  - GEMINI_API_KEY..." -NoNewline
& $flyctl secrets set GEMINI_API_KEY="$GEMINI_API_KEY" --stage --app mimir-bot 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [ERREUR]" -ForegroundColor Red
}

if ($GROQ_API_KEY -ne "" -and $GROQ_API_KEY -ne "COLLE_TA_CLE_GROQ_ICI_OU_LAISSE_VIDE") {
    Write-Host "  - GROQ_API_KEY..." -NoNewline
    & $flyctl secrets set GROQ_API_KEY="$GROQ_API_KEY" --stage --app mimir-bot 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [ERREUR]" -ForegroundColor Red
    }
} else {
    Write-Host "  - GROQ_API_KEY: [Optionnel - non configure]" -ForegroundColor Yellow
}

Write-Host ""

# Deploiement
Write-Host "[ETAPE 4/4] Deploiement..." -ForegroundColor Yellow
Write-Host "Cela prend 2-3 minutes (construction Docker)..." -ForegroundColor Cyan
Write-Host ""

& $flyctl deploy --app mimir-bot

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERREUR] Deploiement echoue" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOIEMENT REUSSI !" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Ton bot tourne maintenant 24/7 sur Fly.io!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Commandes utiles:" -ForegroundColor Yellow
Write-Host "  .\logs.ps1       # Voir les logs" -ForegroundColor White
Write-Host "  .\status.ps1     # Verifier l'etat" -ForegroundColor White
Write-Host ""

Start-Sleep -Seconds 2

Write-Host "Affichage des logs..." -ForegroundColor Yellow
Write-Host ""
& $flyctl logs --app mimir-bot
