# Lance l'agent de codage local, qui se connecte au bot Mimir sur Fly.io
# pour recevoir des taches de codage declenchees depuis Discord.
# Usage : .\local-agent\connect-discord.ps1
# Arret : Ctrl+C

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

if (-not (Test-Path "$scriptDir\.env")) {
    Write-Host "[ERREUR] local-agent\.env introuvable." -ForegroundColor Red
    Write-Host "Copie local-agent\env.example vers local-agent\.env et remplis les valeurs." -ForegroundColor Yellow
    exit 1
}

$claudeCheck = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCheck) {
    Write-Host "[ERREUR] Claude Code (commande 'claude') introuvable dans le PATH." -ForegroundColor Red
    Write-Host "Installe Claude Code et connecte-toi (claude login) avant de continuer." -ForegroundColor Yellow
    exit 1
}

Write-Host "Agent de codage local Mimir" -ForegroundColor Cyan
Write-Host "Ctrl+C pour arreter." -ForegroundColor Yellow
Write-Host ""

Push-Location $projectRoot
try {
    node local-agent/agent.js
} finally {
    Pop-Location
}
