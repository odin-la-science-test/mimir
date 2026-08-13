// ============================================================
// Agent de codage local : tourne SUR LA MACHINE DE L'OPÉRATEUR (pas sur
// Fly.io). Se connecte en sortant vers le bot cloud (aucun port à ouvrir
// côté machine locale), reçoit des tâches de codage déclenchées depuis
// Discord, et les exécute via Claude Code (réutilise la session
// `claude login` déjà active sur cette machine — aucune clé API séparée).
//
// Lancement : voir connect-discord.ps1 dans ce dossier, ou directement
// `node local-agent/agent.js` depuis la racine du projet.
//
// Voir docs/adr/0015-pont-agent-codage-local.md pour la justification
// complète de cette architecture et de ses limites de sécurité.
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");

const BOT_WS_URL = process.env.BOT_WS_URL;
const LOCAL_AGENT_TOKEN = process.env.LOCAL_AGENT_TOKEN;
const TASK_TIMEOUT_MS = 10 * 60 * 1000;
const RECONNECT_DELAY_MS = 5000;

if (!BOT_WS_URL || !LOCAL_AGENT_TOKEN) {
  console.error("❌ Il manque BOT_WS_URL ou LOCAL_AGENT_TOKEN dans local-agent/.env");
  console.error("   Copie local-agent/env.example vers local-agent/.env et remplis les valeurs.");
  process.exit(1);
}

/**
 * Exécute une tâche de codage via Claude Code en mode non-interactif,
 * dans le dossier projectPath, et retourne un résumé exploitable.
 *
 * --permission-mode acceptEdits : autorise la lecture et l'édition de
 * fichiers sans confirmation bloquante (personne n'est là pour répondre
 * à un prompt de permission), mais PAS l'exécution de commandes shell
 * arbitraires — un compromis délibéré entre autonomie et prudence, voir
 * ADR 0015. Pas de --bare : on veut réutiliser la session `claude login`
 * existante, --bare l'ignore et exige une clé API séparée.
 */
function runClaudeCode(projectPath, instruction) {
  return new Promise((resolve) => {
    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      resolve({ success: false, error: `Le dossier "${projectPath}" n'existe pas sur cette machine.` });
      return;
    }

    console.log(`🛠️  Tâche reçue sur "${projectPath}" : ${instruction}`);

    const proc = spawn(
      "claude",
      ["-p", instruction, "--output-format", "json", "--permission-mode", "acceptEdits"],
      { cwd: projectPath, shell: true }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGTERM");
      resolve({ success: false, error: `Timeout après ${TASK_TIMEOUT_MS / 60000} minutes (tâche tuée).` });
    }, TASK_TIMEOUT_MS);

    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        error: `Impossible de lancer Claude Code (${err.message}). Est-il installé et dans le PATH ?`,
      });
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        resolve({ success: false, error: `Claude Code a échoué (code ${code}) : ${(stderr || stdout).slice(-800)}` });
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const cost = typeof parsed.total_cost_usd === "number" ? ` (coût: $${parsed.total_cost_usd.toFixed(4)})` : "";
        resolve({ success: true, summary: `${parsed.result || "(pas de résumé)"}${cost}` });
      } catch {
        // Sortie non-JSON malgré --output-format json : on renvoie quand
        // même le texte brut plutôt que de considérer ça comme un échec.
        resolve({ success: true, summary: stdout.slice(-1500) || "Terminé, sans détail exploitable." });
      }
    });
  });
}

function connect() {
  console.log(`🔌 Connexion à ${BOT_WS_URL}...`);
  const ws = new WebSocket(BOT_WS_URL);

  ws.on("open", () => {
    ws.send(JSON.stringify({ type: "auth", token: LOCAL_AGENT_TOKEN }));
  });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "auth_ok") {
      console.log("✅ Authentifié auprès du bot. En attente de tâches...");
      return;
    }

    if (msg.type === "task") {
      const result = await runClaudeCode(msg.projectPath, msg.instruction);
      ws.send(JSON.stringify({ type: "result", taskId: msg.taskId, ...result }));
      console.log(result.success ? "✅ Tâche terminée, résultat envoyé." : `⚠️ Tâche échouée : ${result.error}`);
    }
  });

  ws.on("close", (code) => {
    console.log(`🔌 Déconnecté (code ${code}). Reconnexion dans ${RECONNECT_DELAY_MS / 1000}s...`);
    setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.on("error", (err) => console.error("Erreur de connexion :", err.message));
}

console.log("🤖 Agent de codage local Mimir — Ctrl+C pour arrêter.");
connect();
