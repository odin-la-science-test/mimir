# Script de déploiement automatique sur Fly.io
# Usage: .\deploy.ps1

Write-Host "🚀 Déploiement de Mimir sur Fly.io" -ForegroundColor Cyan
Write-Host ""

# Étape 1: Vérification de Fly CLI
Write-Host "📋 Vérification de Fly CLI..." -ForegroundColor Yellow
try {
    $flyVersion = flyctl version
    Write-Host "✅ Fly CLI installé: $flyVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Fly CLI n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    Write-Host "Ferme et rouvre PowerShell, puis réessaie." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Étape 2: Vérification de l'authentification
Write-Host "🔑 Vérification de l'authentification Fly.io..." -ForegroundColor Yellow
$authStatus = flyctl auth whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Tu n'es pas connecté à Fly.io" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "👉 Je vais ouvrir la page de connexion..." -ForegroundColor Cyan
    Write-Host "   1. Crée un compte gratuit (sans carte bancaire)" -ForegroundColor White
    Write-Host "   2. Une fois connecté, reviens ici" -ForegroundColor White
    Write-Host ""
    Read-Host "Appuie sur Entrée pour ouvrir la page de connexion"
    
    flyctl auth login
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Connexion échouée" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Connecté à Fly.io!" -ForegroundColor Green
} else {
    Write-Host "✅ Déjà connecté: $authStatus" -ForegroundColor Green
}

Write-Host ""

# Étape 3: Vérification des secrets
Write-Host "🔐 Configuration des secrets (clés API)..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Je vais te demander tes 3 clés API:" -ForegroundColor Cyan
Write-Host "  1. DISCORD_TOKEN (depuis Discord Developer Portal)" -ForegroundColor White
Write-Host "  2. GEMINI_API_KEY (depuis https://aistudio.google.com/apikey)" -ForegroundColor White
Write-Host "  3. GROQ_API_KEY (depuis https://console.groq.com)" -ForegroundColor White
Write-Host ""

# Demander les secrets
$discordToken = Read-Host "DISCORD_TOKEN"
$geminiKey = Read-Host "GEMINI_API_KEY"
$groqKey = Read-Host "GROQ_API_KEY (optionnel pour le vocal, appuie sur Entrée si tu l'as pas)"

Write-Host ""

# Étape 4: Lancer l'app (si pas déjà fait)
Write-Host "🏗️  Configuration de l'application Fly.io..." -ForegroundColor Yellow
$appExists = flyctl apps list 2>&1 | Select-String "mimir-bot"

if (-not $appExists) {
    Write-Host "Création d'une nouvelle app..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Réponds aux questions suivantes:" -ForegroundColor Yellow
    Write-Host "  - App name: Appuie sur Entrée (ou tape 'mimir-bot-tonpseudo')" -ForegroundColor White
    Write-Host "  - Region: Tape 'cdg' pour Paris" -ForegroundColor White
    Write-Host "  - Postgresql: Tape 'n' (non)" -ForegroundColor White
    Write-Host "  - Redis: Tape 'n' (non)" -ForegroundColor White
    Write-Host "  - Deploy now: Tape 'n' (non)" -ForegroundColor White
    Write-Host ""
    Read-Host "Appuie sur Entrée quand tu es prêt"
    
    flyctl launch
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Échec du lancement" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ App déjà créée" -ForegroundColor Green
}

Write-Host ""

# Étape 5: Configurer les secrets
Write-Host "🔒 Configuration des secrets..." -ForegroundColor Yellow

flyctl secrets set DISCORD_TOKEN="$discordToken" --stage
flyctl secrets set GEMINI_API_KEY="$geminiKey" --stage

if ($groqKey -ne "") {
    flyctl secrets set GROQ_API_KEY="$groqKey" --stage
}

Write-Host "✅ Secrets configurés!" -ForegroundColor Green
Write-Host ""

# Étape 6: Déploiement
Write-Host "🚀 Déploiement en cours..." -ForegroundColor Yellow
Write-Host "⏳ Cela prend 2-3 minutes (construction Docker + déploiement)..." -ForegroundColor Cyan
Write-Host ""

flyctl deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Déploiement échoué" -ForegroundColor Red
    Write-Host "Vérifie les logs ci-dessus pour voir l'erreur" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "✅ ✅ ✅ DÉPLOIEMENT RÉUSSI ! ✅ ✅ ✅" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 Mimir tourne maintenant 24/7 sur Fly.io!" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Commandes utiles:" -ForegroundColor Yellow
Write-Host "  flyctl logs                  # Voir les logs en temps réel" -ForegroundColor White
Write-Host "  flyctl status                # Voir l'état du bot" -ForegroundColor White
Write-Host "  flyctl apps restart          # Redémarrer le bot" -ForegroundColor White
Write-Host "  flyctl dashboard             # Ouvrir le dashboard web" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Je vais maintenant afficher les logs..." -ForegroundColor Yellow
Write-Host ""

Start-Sleep -Seconds 3

flyctl logs
