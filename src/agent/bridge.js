// ============================================================
// Pont WebSocket entre le bot (cloud, Fly.io) et l'agent de codage
// local (Claude Code, exécuté sur la machine de l'opérateur).
//
// Le bot cloud ne peut physiquement pas atteindre la machine locale de
// l'opérateur (pas d'IP publique, pas de port ouvert) : c'est donc
// l'agent local qui se connecte VERS le bot (connexion sortante,
// aucune configuration réseau nécessaire côté opérateur), et reste
// ouverte pour recevoir des tâches à la demande.
//
// Voir docs/adr/0015-pont-agent-codage-local.md pour la justification
// complète (authentification, permissions, choix d'architecture).
// ============================================================

const { WebSocketServer } = require("ws");
const crypto = require("crypto");
const { LOCAL_AGENT_TOKEN } = require("../config");

const TASK_TIMEOUT_MS = 10 * 60 * 1000; // les tâches de codage peuvent prendre plusieurs minutes

let agentSocket = null;
const pendingTasks = new Map(); // taskId -> { resolve, reject, timer }

function isAgentConnected() {
  return agentSocket !== null && agentSocket.readyState === agentSocket.OPEN;
}

function handleAgentMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    console.warn("⚠️ Message illisible reçu de l'agent local (JSON invalide), ignoré.");
    return;
  }

  if (message.type === "result" && message.taskId) {
    const pending = pendingTasks.get(message.taskId);
    if (!pending) return; // résultat tardif d'une tâche déjà abandonnée (timeout)
    clearTimeout(pending.timer);
    pendingTasks.delete(message.taskId);
    pending.resolve({
      success: !!message.success,
      summary: message.summary || "(aucun résumé fourni)",
      error: message.error || null,
    });
  }
}

/**
 * Démarre le pont : attache un WebSocketServer au serveur HTTP existant
 * (même port que le health-check, pas de configuration réseau
 * supplémentaire côté Fly.io) sur le chemin /agent-bridge.
 */
function startAgentBridge(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/agent-bridge" });

  wss.on("connection", (ws) => {
    let authenticated = false;

    const authTimeout = setTimeout(() => {
      if (!authenticated) ws.close(4001, "Timeout d'authentification");
    }, 5000);

    ws.once("message", (raw) => {
      clearTimeout(authTimeout);
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(4002, "Message d'authentification invalide");
        return;
      }

      // Comparaison en temps constant : évite qu'un timing attack sur la
      // comparaison de chaînes ne laisse deviner le token octet par octet.
      const provided = Buffer.from(String(msg.token || ""));
      const expected = Buffer.from(String(LOCAL_AGENT_TOKEN || ""));
      const valid =
        msg.type === "auth" &&
        provided.length === expected.length &&
        crypto.timingSafeEqual(provided, expected);

      if (!valid) {
        console.warn("⚠️ Tentative de connexion au pont agent avec un token invalide, refusée.");
        ws.close(4003, "Authentification refusée");
        return;
      }

      authenticated = true;
      // Un seul agent local à la fois : une nouvelle connexion authentifiée
      // remplace l'ancienne (utile si l'opérateur relance son script après
      // une coupure réseau, sans laisser une connexion fantôme bloquer tout).
      if (agentSocket) agentSocket.close(4000, "Remplacée par une nouvelle connexion");
      agentSocket = ws;
      ws.send(JSON.stringify({ type: "auth_ok" }));
      console.log("🔌 Agent de codage local connecté.");

      ws.on("message", handleAgentMessage);
      ws.on("close", () => {
        if (agentSocket === ws) {
          agentSocket = null;
          console.log("🔌 Agent de codage local déconnecté.");
        }
      });
    });

    ws.on("error", (err) => console.error("Erreur WebSocket (pont agent):", err.message));
  });

  console.log("🌉 Pont agent de codage local disponible sur /agent-bridge");
}

/**
 * Envoie une tâche de codage à l'agent local connecté et attend son
 * résultat. Rejette si aucun agent n'est connecté ou si la tâche dépasse
 * TASK_TIMEOUT_MS sans réponse.
 */
function sendCodingTask(projectPath, instruction) {
  if (!isAgentConnected()) {
    return Promise.reject(new Error("Aucun agent de codage local connecté."));
  }

  const taskId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTasks.delete(taskId);
      reject(new Error(`Timeout : pas de réponse de l'agent local après ${TASK_TIMEOUT_MS / 60000} min.`));
    }, TASK_TIMEOUT_MS);

    pendingTasks.set(taskId, { resolve, reject, timer });
    agentSocket.send(JSON.stringify({ type: "task", taskId, projectPath, instruction }));
  });
}

module.exports = { startAgentBridge, sendCodingTask, isAgentConnected };
