# Script pour finaliser le deploiement
# L'app mimir-bot existe deja, il ne reste qu'a configurer les secrets et deployer

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FINALISATION DU DEPLOIEMENT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$flyctl = "$env:USERPROFILE\.fly\bin\flyctl.exe"

Write-Host "[INFO] App 'mimir-bot' existe deja!" -ForegroundColor Green
Write-Host ""
Write-Host "Il ne reste que 2 etapes:" -ForegroundColor Yellow
Write-Host "  1. Configurer les secrets (cles API)" -ForegroundColor White
Write-Host "  2. Deployer le bot" -ForegroundColor White
Write-Host ""

# Demander les secrets
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ETAPE 1/2 : Configuration des secrets" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Je vais te demander tes 3 cles API:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. DISCORD_TOKEN" -ForegroundColor White
Write-Host "   --> https://discord.com/developers/applications" -ForegroundColor Gray
Write-Host "   --> Ton app > Bot > Reset Token" -ForegroundColor Gray
Write-Host ""

$discordToken = Read-Host "Colle ton DISCORD_TOKEN ici"

Write-Host ""
Write-Host "2. GEMINI_API_KEY" -ForegroundColor White
Write-Host "   --> https://aistudio.google.com/apikey" -ForegroundColor Gray
Write-Host "   --> Create API key (gratuit)" -ForegroundColor Gray
Write-Host ""

$geminiKey = Read-Host "Colle ta GEMINI_API_KEY ici"

Write-Host ""
Write-Host "3. GROQ_API_KEY (optionnel, pour le module vocal)" -ForegroundColor White
Write-Host "   --> https://console.groq.com" -ForegroundColor Gray
Write-Host "   --> API Keys > Create (gratuit)" -ForegroundColor Gray
Write-Host "   --> Appuie sur Entree si tu n'en veux pas" -ForegroundColor Gray
Write-Host ""

$groqKey = Read-Host "Colle ta GROQ_API_KEY ici (ou Entree pour passer)"

Write-Host ""
Write-Host "Configuration des secrets sur Fly.io..." -ForegroundColor Yellow

# Configurer les secrets
& $flyctl secrets set DISCORD_TOKEN="$discordToken" --app mimir-bot 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] DISCORD_TOKEN configure" -ForegroundColor Green
} else {
    Write-Host "  [ERREUR] DISCORD_TOKEN" -ForegroundColor Red
}

& $flyctl secrets set GEMINI_API_KEY="$geminiKey" --app mimir-bot 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] GEMINI_API_KEY configure" -ForegroundColor Green
} else {
    Write-Host "  [ERREUR] GEMINI_API_KEY" -ForegroundColor Red
}

if ($groqKey -ne "") {
    & $flyctl secrets set GROQ_API_KEY="$groqKey" --app mimir-bot 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] GROQ_API_KEY configure" -ForegroundColor Green
    } else {
        Write-Host "  [ERREUR] GROQ_API_KEY" -ForegroundColor Red
    }
} else {
    Write-Host "  [INFO] GROQ_API_KEY non configure (module vocal desactive)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ETAPE 2/2 : Deploiement" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Deploiement en cours..." -ForegroundColor Yellow
Write-Host "Cela prend 2-3 minutes (construction Docker)..." -ForegroundColor Cyan
Write-Host ""

& $flyctl deploy --app mimir-bot

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERREUR] Deploiement echoue" -ForegroundColor Red
    Write-Host "Regarde les logs ci-dessus pour voir l'erreur" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOIEMENT REUSSI !" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Ton bot Discord 'Mimir' tourne maintenant 24/7 sur Fly.io!" -ForegroundColor Cyan
Write-Host ""
Write-Host "URL de l'app: https://fly.io/apps/mimir-bot" -ForegroundColor White
Write-Host ""
Write-Host "Commandes utiles:" -ForegroundColor Yellow
Write-Host "  .\logs.ps1       # Voir les logs en temps reel" -ForegroundColor White
Write-Host "  .\status.ps1     # Verifier l'etat du bot" -ForegroundColor White
Write-Host ""

Start-Sleep -Seconds 2

Write-Host "Affichage des logs..." -ForegroundColor Yellow
Write-Host ""
& $flyctl logs --app mimir-bot
