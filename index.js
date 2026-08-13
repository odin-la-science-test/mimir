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

const { Client, GatewayIntentBits, Partials } = require("discord.js");

const config = require("./src/config");
config.assertRequiredConfig();

const { startHealthServer } = require("./src/server/healthServer");
const { registerMessageRouter } = require("./src/discord/router");
const { registerTranslationHandler } = require("./src/discord/translation");

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
});

client.once("clientReady", () => {
  console.log(`✅ Mimir est en ligne : ${client.user.tag}`);
  console.log(`🔮 Déclencheur : messages commençant par "${config.TRIGGER_WORD}"`);
});

registerMessageRouter(client);
registerTranslationHandler(client);
startHealthServer(client);

client.login(config.DISCORD_TOKEN);
