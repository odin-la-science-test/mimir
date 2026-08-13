// ============================================================
// Commande Discord "mimir code" : déclenche une tâche de codage sur la
// machine locale de l'opérateur via le pont WebSocket (src/agent/bridge.js).
//
// 🔒 Restreint à OWNER_DISCORD_ID uniquement — voir
// docs/adr/0015-pont-agent-codage-local.md. Ce n'est pas une simple
// convention : n'importe qui d'autre sur le serveur Discord pourrait
// sinon déclencher une écriture de fichiers arbitraire sur la machine
// de l'opérateur en tapant un message.
// ============================================================

const { OWNER_DISCORD_ID, hasRemoteCoding } = require("../config");
const { sendCodingTask, isAgentConnected } = require("./bridge");

// Format attendu : mimir code "<chemin du projet>" <instruction>
// Les guillemets autour du chemin sont obligatoires (permet des chemins
// Windows avec espaces, et évite toute ambiguïté avec l'instruction qui
// suit).
const CODE_COMMAND_PATTERN = /^code\s+"([^"]+)"\s+(.+)$/is;

function isCodeCommand(lowerPrompt) {
  return /^code\s+"/i.test(lowerPrompt);
}

async function handleRemoteCodingRequest(message, prompt) {
  if (!hasRemoteCoding) {
    await message.reply(
      "⚠️ La fonctionnalité de codage à distance n'est pas configurée sur ce bot " +
        "(`OWNER_DISCORD_ID` et `LOCAL_AGENT_TOKEN` requis — voir `local-agent/README.md`)."
    );
    return;
  }

  if (message.author.id !== OWNER_DISCORD_ID) {
    await message.reply("🚫 Cette commande est réservée à l'opérateur du bot.");
    return;
  }

  const match = CODE_COMMAND_PATTERN.exec(prompt.trim());
  if (!match) {
    await message.reply(
      '⚠️ Format attendu : `mimir code "<chemin du projet>" <ce qu\'il faut faire>`\n' +
        'Exemple : `mimir code "C:\\projets\\mon-app" ajoute un bouton de connexion sur la page d\'accueil`'
    );
    return;
  }

  const [, projectPath, instruction] = match;

  if (!isAgentConnected()) {
    await message.reply(
      "⚠️ Aucun agent de codage local n'est connecté. Lance `local-agent/connect-discord.ps1` " +
        "sur ta machine, puis réessaie."
    );
    return;
  }

  await message.reply(
    `🛠️ Tâche envoyée à l'agent local sur \`${projectPath}\`. ` +
      "Ça peut prendre plusieurs minutes selon la complexité — je réponds dès que c'est fini."
  );
  await message.channel.sendTyping();

  try {
    const result = await sendCodingTask(projectPath, instruction);
    if (result.success) {
      await message.channel.send(`✅ **Tâche terminée.**\n${result.summary}`.slice(0, 2000));
    } else {
      // Le détail technique (trace, code de sortie...) reste dans les logs
      // du bot et le terminal de l'agent local, pas affiché dans Discord.
      console.error("Tâche de codage à distance échouée :", result.error || result.summary);
      await message.channel.send("❌ La tâche a échoué — voir les logs du bot ou le terminal de l'agent local pour le détail.");
    }
  } catch (err) {
    console.error("Erreur pendant l'exécution à distance :", err.message);
    await message.channel.send("❌ La tâche a échoué — voir les logs du bot ou le terminal de l'agent local pour le détail.");
  }
}

module.exports = { isCodeCommand, handleRemoteCodingRequest };
