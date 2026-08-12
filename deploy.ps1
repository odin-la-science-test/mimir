# Script de deploiement automatique sur Fly.io
# Usage: .\deploy.ps1

Write-Host "[DEPLOIEMENT] Mimir sur Fly.io" -ForegroundColor Cyan
Write-Host ""

# Etape 1: Verification de Fly CLI
Write-Host "[ETAPE 1/6] Verification de Fly CLI..." -ForegroundColor Yellow
try {
    $flyVersion = flyctl version
    Write-Host "[OK] Fly CLI installe: $flyVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERREUR] Fly CLI n'est pas installe ou pas dans le PATH" -ForegroundColor Red
    Write-Host "Ferme et rouvre PowerShell, puis reessaie." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Etape 2: Verification de l'authentification
Write-Host "[ETAPE 2/6] Verification de l'authentification Fly.io..." -ForegroundColor Yellow
$authStatus = flyctl auth whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Tu n'es pas connecte a Fly.io" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Je vais ouvrir la page de connexion..." -ForegroundColor Cyan
    Write-Host "   1. Cree un compte gratuit (sans carte bancaire)" -ForegroundColor White
    Write-Host "   2. Une fois connecte, reviens ici" -ForegroundColor White
    Write-Host ""
    Read-Host "Appuie sur Entree pour ouvrir la page de connexion"
    
    flyctl auth login
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Connexion echouee" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "[OK] Connecte a Fly.io!" -ForegroundColor Green
} else {
    Write-Host "[OK] Deja connecte: $authStatus" -ForegroundColor Green
}

Write-Host ""

# Etape 3: Verification des secrets
Write-Host "[ETAPE 3/6] Configuration des secrets (cles API)..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Je vais te demander tes 3 cles API:" -ForegroundColor Cyan
Write-Host "  1. DISCORD_TOKEN (depuis Discord Developer Portal)" -ForegroundColor White
Write-Host "  2. GEMINI_API_KEY (depuis https://aistudio.google.com/apikey)" -ForegroundColor White
Write-Host "  3. GROQ_API_KEY (depuis https://console.groq.com)" -ForegroundColor White
Write-Host ""

# Demander les secrets
$discordToken = Read-Host "DISCORD_TOKEN"
$geminiKey = Read-Host "GEMINI_API_KEY"
$groqKey = Read-Host "GROQ_API_KEY (optionnel pour le vocal, appuie sur Entree si tu l'as pas)"

Write-Host ""

# Etape 4: Lancer l'app (si pas deja fait)
Write-Host "[ETAPE 4/6] Configuration de l'application Fly.io..." -ForegroundColor Yellow
$appExists = flyctl apps list 2>&1 | Select-String "mimir-bot"

if (-not $appExists) {
    Write-Host "Creation d'une nouvelle app..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[IMPORTANT] Reponds aux questions suivantes:" -ForegroundColor Yellow
    Write-Host "  - App name: Appuie sur Entree (ou tape 'mimir-bot-tonpseudo')" -ForegroundColor White
    Write-Host "  - Region: Tape 'cdg' pour Paris" -ForegroundColor White
    Write-Host "  - Postgresql: Tape 'n' (non)" -ForegroundColor White
    Write-Host "  - Redis: Tape 'n' (non)" -ForegroundColor White
    Write-Host "  - Deploy now: Tape 'n' (non)" -ForegroundColor White
    Write-Host ""
    Read-Host "Appuie sur Entree quand tu es pret"
    
    flyctl launch
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Echec du lancement" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] App deja creee" -ForegroundColor Green
}

Write-Host ""

# Etape 5: Configurer les secrets
Write-Host "[ETAPE 5/6] Configuration des secrets..." -ForegroundColor Yellow

flyctl secrets set DISCORD_TOKEN="$discordToken" --stage
flyctl secrets set GEMINI_API_KEY="$geminiKey" --stage

if ($groqKey -ne "") {
    flyctl secrets set GROQ_API_KEY="$groqKey" --stage
}

Write-Host "[OK] Secrets configures!" -ForegroundColor Green
Write-Host ""

# Etape 6: Deploiement
Write-Host "[ETAPE 6/6] Deploiement en cours..." -ForegroundColor Yellow
Write-Host "Cela prend 2-3 minutes (construction Docker + deploiement)..." -ForegroundColor Cyan
Write-Host ""

flyctl deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] Deploiement echoue" -ForegroundColor Red
    Write-Host "Verifie les logs ci-dessus pour voir l'erreur" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOIEMENT REUSSI !" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Mimir tourne maintenant 24/7 sur Fly.io!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Commandes utiles:" -ForegroundColor Yellow
Write-Host "  flyctl logs                  # Voir les logs en temps reel" -ForegroundColor White
Write-Host "  flyctl status                # Voir l'etat du bot" -ForegroundColor White
Write-Host "  flyctl apps restart          # Redemarrer le bot" -ForegroundColor White
Write-Host "  flyctl dashboard             # Ouvrir le dashboard web" -ForegroundColor White
Write-Host ""
Write-Host "Affichage des logs dans 3 secondes..." -ForegroundColor Yellow
Write-Host ""

Start-Sleep -Seconds 3

flyctl logs
