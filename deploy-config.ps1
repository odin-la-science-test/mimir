# Configuration pour le deploiement
# IMPORTANT: NE JAMAIS COMMITER CE FICHIER SUR GITHUB !
# Remplace les valeurs ci-dessous par tes vraies cles API

# 1. Token Discord (https://discord.com/developers/applications)
$DISCORD_TOKEN = "COLLE_TON_TOKEN_DISCORD_ICI"

# 2. Cle Gemini (https://aistudio.google.com/apikey)
$GEMINI_API_KEY = "COLLE_TA_CLE_GEMINI_ICI"

# 3. Cle Groq optionnelle (https://console.groq.com)
# Laisse vide "" si tu ne veux pas le module vocal
$GROQ_API_KEY = "COLLE_TA_CLE_GROQ_ICI_OU_LAISSE_VIDE"

# Ne modifie pas en dessous de cette ligne
# ==========================================

Write-Host "Configuration chargee!" -ForegroundColor Green
Write-Host "Discord Token: " -NoNewline
if ($DISCORD_TOKEN -ne "COLLE_TON_TOKEN_DISCORD_ICI") {
    Write-Host "[OK]" -ForegroundColor Green
} else {
    Write-Host "[MANQUANT]" -ForegroundColor Red
}

Write-Host "Gemini Key: " -NoNewline
if ($GEMINI_API_KEY -ne "COLLE_TA_CLE_GEMINI_ICI") {
    Write-Host "[OK]" -ForegroundColor Green
} else {
    Write-Host "[MANQUANT]" -ForegroundColor Red
}

Write-Host "Groq Key: " -NoNewline
if ($GROQ_API_KEY -ne "" -and $GROQ_API_KEY -ne "COLLE_TA_CLE_GROQ_ICI_OU_LAISSE_VIDE") {
    Write-Host "[OK]" -ForegroundColor Green
} else {
    Write-Host "[Optionnel - non configure]" -ForegroundColor Yellow
}
