// ============================================================
// MIMIR — Bot Discord IA multi-provider (Gemini/Groq/Mistral, gratuit)
// ============================================================
// Le bot répond dès qu'un message commence par "mimir" (insensible à la
// casse). Ce fichier ne fait que l'amorçage : configuration, client
// Discord, healthcheck HTTP, et branchement des modules dans src/.
// Voir docs/adr/0001-architecture-modulaire.md pour la structure globale
// et README.md pour la vue d'ensemble des fonctionnalités.

process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || require("ffmpeg-static");
console.log(`🎬 ffmpeg utilisé : ${process.env.FFMPEG_PATH}`);

const { Client, GatewayIntentBits, Partials, Options } = require("discord.js");

const config = require("./src/config");
config.assertRequiredConfig();

const { startHealthServer } = require("./src/server/healthServer");
const { registerMessageRouter } = require("./src/discord/router");
const { registerTranslationHandler } = require("./src/discord/translation");
const { startAgentBridge } = require("./src/agent/bridge");

console.log("\n🤖 Configuration des providers IA :");
if (config.hasGemini) console.log(`   ✅ Gemini: ${config.GEMINI_API_KEYS.length} clé(s) configurée(s)`);
if (config.hasGroq) console.log("   ✅ Groq: 1 clé configurée (14 400 req/jour, ultra rapide)");
if (config.hasMistral) console.log(`   ✅ Mistral: ${config.MISTRAL_API_KEYS.length} clé(s) configurée(s)`);
if (config.hasElevenLabs) {
  console.log(`🗣️  TTS : ElevenLabs (voix ${config.ELEVENLABS_VOICE_ID})`);
} else if (config.hasGoogleTts) {
  console.log(`🗣️  TTS : Google Cloud (voix ${config.GOOGLE_TTS_VOICE})`);
} else {
  console.log("🗣️  TTS : Microsoft Edge (gratuit — voir docs/adr/0012 si le vocal échoue)");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
  // La machine de production tourne avec 256 Mo de RAM (fly.toml) : par
  // défaut, discord.js met en cache indéfiniment tout message/réaction/
  // présence vu passer, ce qui grossit sans limite sur une session
  // longue. Cette fonctionnalité ne s'appuie jamais sur ce cache long
  // terme (channels/contextReader.js fait toujours un fetch() explicite
  // à la demande), donc le brider ne change aucun comportement — voir
  // docs/adr/0014-limitation-cache-discordjs.md.
  makeCache: Options.cacheWithLimits({
    MessageManager: 50,
    PresenceManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    StageInstanceManager: 0,
    AutoModerationRuleManager: 0,
  }),
  sweepers: {
    messages: { interval: 300, lifetime: 900 }, // purge les messages en cache > 15 min toutes les 5 min
  },
});

client.once("clientReady", () => {
  console.log(`✅ Mimir est en ligne : ${client.user.tag}`);
  console.log(`🔮 Déclencheur : messages commençant par "${config.TRIGGER_WORD}"`);
});

registerMessageRouter(client);
registerTranslationHandler(client);
const healthServer = startHealthServer(client);

if (config.hasRemoteCoding) {
  startAgentBridge(healthServer);
} else {
  console.log("🌉 Codage à distance désactivé (OWNER_DISCORD_ID / LOCAL_AGENT_TOKEN non configurés).");
}

client.login(config.DISCORD_TOKEN);
