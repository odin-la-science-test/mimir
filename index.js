// ============================================================
// MIMIR — Bot Discord IA propulsé par Google Gemini (gratuit)
// ============================================================
// Le bot répond dès qu'un message commence par "mimir" (insensible à la casse).
// Exemple : "mimir explique-moi la photosynthèse"

require("dotenv").config();
process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || require("ffmpeg-static");
console.log(`🎬 ffmpeg utilisé : ${process.env.FFMPEG_PATH}`);

const {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
  PermissionsBitField,
  MessageFlags,
  Routes,
} = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  EndBehaviorType,
  StreamType,
} = require("@discordjs/voice");
const prism = require("prism-media");
const { Readable } = require("stream");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const FormData = require("form-data");

// Patch pour msedge-tts : injecter crypto dans le contexte global
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ============================================================
// SYSTÈME DE ROTATION INTELLIGENTE MULTI-PROVIDERS
// ============================================================
// Configuration des providers IA avec rotation automatique
// Gemini (3 clés) → Groq → Mistral (2 clés)

const GEMINI_API_KEYS = process.env.GEMINI_API_KEY
  ? process.env.GEMINI_API_KEY.split(",").map(k => k.trim()).filter(k => k.length > 0)
  : [];

const MISTRAL_API_KEYS = process.env.MISTRAL_API_KEY
  ? process.env.MISTRAL_API_KEY.split(",").map(k => k.trim()).filter(k => k.length > 0)
  : [];

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// État de rotation des providers
let currentProvider = "gemini"; // "gemini" | "groq" | "mistral"
let currentGeminiIndex = 0;
let currentMistralIndex = 0;

// Modèles à utiliser
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // Excellent modèle, rapide et performant
const MISTRAL_MODEL = "mistral-small-latest"; // Bon compromis qualité/vitesse

/**
 * Obtient la configuration du provider actuel
 */
function getCurrentProviderConfig() {
  switch (currentProvider) {
    case "gemini":
      if (GEMINI_API_KEYS.length === 0) return null;
      return {
        provider: "gemini",
        apiKey: GEMINI_API_KEYS[currentGeminiIndex],
        model: GEMINI_MODEL,
        index: currentGeminiIndex,
        total: GEMINI_API_KEYS.length
      };
    case "groq":
      if (!GROQ_API_KEY) return null;
      return {
        provider: "groq",
        apiKey: GROQ_API_KEY,
        model: GROQ_MODEL,
        index: 0,
        total: 1
      };
    case "mistral":
      if (MISTRAL_API_KEYS.length === 0) return null;
      return {
        provider: "mistral",
        apiKey: MISTRAL_API_KEYS[currentMistralIndex],
        model: MISTRAL_MODEL,
        index: currentMistralIndex,
        total: MISTRAL_API_KEYS.length
      };
    default:
      return null;
  }
}

/**
 * Passe au provider suivant en cas de quota dépassé
 * Ordre : Gemini (rotation de clés) → Groq → Mistral (rotation de clés) → Gemini...
 */
function switchToNextProvider() {
  const startProvider = currentProvider;
  let attempts = 0;
  const maxAttempts = 10; // Évite les boucles infinies

  while (attempts < maxAttempts) {
    attempts++;

    if (currentProvider === "gemini") {
      // Essayer la clé Gemini suivante
      if (GEMINI_API_KEYS.length > 1 && currentGeminiIndex < GEMINI_API_KEYS.length - 1) {
        currentGeminiIndex++;
        console.log(`🔄 Gemini : passage à la clé ${currentGeminiIndex + 1}/${GEMINI_API_KEYS.length}`);
        return true;
      }
      // Toutes les clés Gemini épuisées, passer à Groq
      if (GROQ_API_KEY) {
        currentProvider = "groq";
        console.log(`🔄 Basculement : Gemini → Groq`);
        return true;
      }
      // Pas de Groq, passer à Mistral
      if (MISTRAL_API_KEYS.length > 0) {
        currentProvider = "mistral";
        currentMistralIndex = 0;
        console.log(`🔄 Basculement : Gemini → Mistral`);
        return true;
      }
      // Aucun fallback disponible
      return false;
    }

    if (currentProvider === "groq") {
      // Groq épuisé, passer à Mistral
      if (MISTRAL_API_KEYS.length > 0) {
        currentProvider = "mistral";
        currentMistralIndex = 0;
        console.log(`🔄 Basculement : Groq → Mistral`);
        return true;
      }
      // Pas de Mistral, retour à Gemini
      if (GEMINI_API_KEYS.length > 0) {
        currentProvider = "gemini";
        currentGeminiIndex = 0;
        console.log(`🔄 Basculement : Groq → Gemini (nouveau cycle)`);
        return true;
      }
      return false;
    }

    if (currentProvider === "mistral") {
      // Essayer la clé Mistral suivante
      if (MISTRAL_API_KEYS.length > 1 && currentMistralIndex < MISTRAL_API_KEYS.length - 1) {
        currentMistralIndex++;
        console.log(`🔄 Mistral : passage à la clé ${currentMistralIndex + 1}/${MISTRAL_API_KEYS.length}`);
        return true;
      }
      // Toutes les clés Mistral épuisées, retour à Gemini
      if (GEMINI_API_KEYS.length > 0) {
        currentProvider = "gemini";
        currentGeminiIndex = 0;
        console.log(`🔄 Basculement : Mistral → Gemini (nouveau cycle)`);
        return true;
      }
      // Pas de Gemini, essayer Groq
      if (GROQ_API_KEY) {
        currentProvider = "groq";
        console.log(`🔄 Basculement : Mistral → Groq`);
        return true;
      }
      return false;
    }

    // Provider inconnu, réinitialiser
    if (GEMINI_API_KEYS.length > 0) {
      currentProvider = "gemini";
      currentGeminiIndex = 0;
    } else if (GROQ_API_KEY) {
      currentProvider = "groq";
    } else if (MISTRAL_API_KEYS.length > 0) {
      currentProvider = "mistral";
      currentMistralIndex = 0;
    } else {
      return false;
    }
  }

  console.error("⚠️ Rotation bloquée après trop de tentatives");
  return false;
}
// Voix française pour la synthèse vocale (Microsoft Edge TTS, gratuit, sans clé).
// Autres voix FR possibles : fr-FR-DeniseNeural, fr-FR-VivienneMultilingualNeural,
// fr-CA-JeanNeural... Liste complète : https://github.com/Migushthe2nd/MsEdgeTTS
const DEFAULT_TTS_VOICE = "fr-FR-HenriNeural";
// Format attendu : xx-XX-NomNeural (ex: fr-FR-HenriNeural). Un nom qui ne
// respecte pas ce format (ex: reliquat "Mathieu" de l'ancien TTS
// StreamElements) fait planter la synthèse Edge TTS silencieusement plus
// tard — on le détecte ici et on retombe sur la voix par défaut.
const TTS_VOICE_PATTERN = /^[a-z]{2}-[A-Z]{2}-\w+Neural$/;
let TTS_VOICE = process.env.TTS_VOICE || DEFAULT_TTS_VOICE;
if (!TTS_VOICE_PATTERN.test(TTS_VOICE)) {
  console.warn(
    `⚠️ TTS_VOICE="${TTS_VOICE}" n'est pas un nom de voix Edge TTS valide (format attendu : ` +
      `xx-XX-NomNeural, ex: fr-FR-HenriNeural). Utilisation de la voix par défaut à la place. ` +
      `Corrige TTS_VOICE dans ton .env pour faire disparaître cet avertissement.`
  );
  TTS_VOICE = DEFAULT_TTS_VOICE;
}

// Mot déclencheur (en début de phrase)
const TRIGGER_WORD = "mimir";

// Limite de longueur d'un message Discord
const DISCORD_MAX_LENGTH = 2000;

// Historique de conversation par salon (optionnel, mémoire courte)
const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 10;

// Nombre de messages récents à lire quand on demande à Mimir de consulter un salon
const CHANNEL_CONTEXT_MESSAGE_COUNT = 50;

// Pour une recherche "tout le serveur" : nb de messages par salon et nb de salons max
const GLOBAL_SEARCH_MESSAGES_PER_CHANNEL = 15;
const GLOBAL_SEARCH_MAX_CHANNELS = 15;
const GLOBAL_SEARCH_TRIGGERS = [
  "tout le serveur",
  "tous les salons",
  "tous les canaux",
  "l'ensemble du serveur",
];

// Déclencheurs pour la génération d'images
const IMAGE_TRIGGERS = [
  "génère une image",
  "genere une image",
  "génère moi une image",
  "dessine",
  "crée une image",
  "cree une image",
  "image de",
  "image :",
  "image:",
];

// Déclencheurs pour la génération CSV/graphique
const CSV_TRIGGERS = ["csv", "graphique", "diagramme", "tableau de données", "tableau de donnees"];

// Déclencheurs pour demander une réponse sous forme de VRAI message vocal
// Discord (la bulle audio native avec forme d'onde), pas juste parlé en
// direct dans un salon vocal.
const VOICE_MESSAGE_TRIGGERS = [
  "message vocal",
  "note vocale",
  "réponds en vocal",
  "reponds en vocal",
  "réponds moi en vocal",
  "reponds moi en vocal",
  "envoie en vocal",
  "envoie ça en vocal",
  "envoie ca en vocal",
  "vocal stp",
  "vocal svp",
];

// Déclencheurs pour la modération (ban, kick, timeout...). L'ordre de
// vérification dans messageCreate compte : "unban"/"untimeout"/"unmute"
// doivent être testés AVANT "ban"/"timeout"/"mute" car ils contiennent
// ces mots comme sous-chaîne.
const BAN_TRIGGERS = ["ban ", "bannis", "banni "];
const UNBAN_TRIGGERS = ["unban", "débannis", "debannis", "dé-bannis"];
const KICK_TRIGGERS = ["kick ", "expulse"];
const TIMEOUT_TRIGGERS = ["timeout", "mute", "réduis au silence", "reduis au silence"];
const UNTIMEOUT_TRIGGERS = [
  "untimeout",
  "unmute",
  "enlève le timeout",
  "enleve le timeout",
  "enlève le mute",
  "enleve le mute",
  "retire le timeout",
  "retire le mute",
];

// Emojis drapeaux → langue cible pour le traducteur (réagir à un message avec le drapeau)
const FLAG_LANGUAGE_MAP = {
  "🇫🇷": "français",
  "🇬🇧": "anglais",
  "🇺🇸": "anglais",
  "🇪🇸": "espagnol",
  "🇩🇪": "allemand",
  "🇮🇹": "italien",
  "🇵🇹": "portugais",
  "🇯🇵": "japonais",
  "🇰🇷": "coréen",
  "🇨🇳": "chinois (mandarin)",
  "🇷🇺": "russe",
  "🇳🇱": "néerlandais",
  "🇸🇦": "arabe",
  "🇮🇳": "hindi",
  "🇹🇷": "turc",
  "🇵🇱": "polonais",
};

// Déclencheurs pour rejoindre / quitter le salon vocal
const JOIN_VOICE_TRIGGERS = [
  "rejoins le vocal",
  "rejoins mon vocal",
  "viens en vocal",
  "rejoins le salon vocal",
  "come",
  "viens",
];
const LEAVE_VOICE_TRIGGERS = [
  "quitte le vocal",
  "pars du vocal",
  "quitte le salon vocal",
  "stop mimir",
];

// Paramètres audio pour la capture vocale (format brut fourni par Discord)
const VOICE_SAMPLE_RATE = 48000;
const VOICE_CHANNELS = 2;
const MIN_AUDIO_BYTES = VOICE_SAMPLE_RATE * VOICE_CHANNELS * 2 * 0.3; // ignore les clips < 0.3s (bruit)

// Connexions vocales actives par serveur (guildId -> { connection, textChannel })
const activeVoiceSessions = new Map();

// Vérification des clés API
const hasGemini = GEMINI_API_KEYS.length > 0;
const hasGroq = !!GROQ_API_KEY;
const hasMistral = MISTRAL_API_KEYS.length > 0;

if (!DISCORD_TOKEN) {
  console.error("❌ Il manque DISCORD_TOKEN dans le fichier .env");
  process.exit(1);
}

if (!hasGemini && !hasGroq && !hasMistral) {
  console.error("❌ Aucune clé API IA configurée !");
  console.error("   Configure au moins une des clés suivantes dans .env :");
  console.error("   - GEMINI_API_KEY (recommandé, sépare plusieurs clés par des virgules)");
  console.error("   - GROQ_API_KEY (très rapide, quota généreux)");
  console.error("   - MISTRAL_API_KEY (excellent en français, sépare plusieurs clés par des virgules)");
  process.exit(1);
}

console.log("\n🤖 Configuration des providers IA :");
if (hasGemini) console.log(`   ✅ Gemini: ${GEMINI_API_KEYS.length} clé(s) configurée(s)`);
if (hasGroq) console.log(`   ✅ Groq: 1 clé configurée (14 400 req/jour, ultra rapide)`);
if (hasMistral) console.log(`   ✅ Mistral: ${MISTRAL_API_KEYS.length} clé(s) configurée(s)`);

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

client.once("ready", () => {
  console.log(`✅ Mimir est en ligne : ${client.user.tag}`);
  console.log(`🔮 Déclencheur : messages commençant par "${TRIGGER_WORD}"`);
  console.log(`� Rotation intelligente activée : ${hasGemini ? `Gemini(${GEMINI_API_KEYS.length})` : ""}${hasGemini && (hasGroq || hasMistral) ? " → " : ""}${hasGroq ? "Groq" : ""}${hasGroq && hasMistral ? " → " : ""}${hasMistral ? `Mistral(${MISTRAL_API_KEYS.length})` : ""}`);
});

client.on("messageCreate", async (message) => {
  // Ignore les messages des bots (y compris lui-même)
  if (message.author.bot) return;

  // Message vocal Discord (le micro dans le chat texte) : on répond aussi
  // en vocal, sans avoir besoin du mot "mimir".
  const voiceAttachment = message.attachments.find(
    (a) => a.duration !== undefined && a.duration !== null
  );
  if (voiceAttachment) {
    await handleVoiceMessage(message, voiceAttachment);
    return;
  }

  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (!lower.startsWith(TRIGGER_WORD)) return;

  // Retire le mot déclencheur du prompt envoyé à l'IA
  let prompt = content.slice(TRIGGER_WORD.length).trim();

  // Si l'utilisateur a juste tapé "mimir" sans rien derrière
  if (!prompt) {
    prompt = "Salue l'utilisateur brièvement et demande ce qu'il veut savoir.";
  }

  // Affiche "en train d'écrire..." pendant la génération
  await message.channel.sendTyping();

  try {
    const lowerPrompt = prompt.toLowerCase();

    // 0a. Rejoindre le vocal ?
    if (JOIN_VOICE_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await joinVoiceAndListen(message);
      return;
    }

    // 0b. Quitter le vocal ?
    if (LEAVE_VOICE_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await leaveVoice(message.guild.id, "👋 D'accord, je quitte le vocal.");
      return;
    }

    // 0c. Réponse sous forme de message vocal Discord natif (note vocale) ?
    if (VOICE_MESSAGE_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleVoiceMessageReply(message, prompt);
      return;
    }

    // 0d. Modération : débannissement ? (à tester avant "ban")
    if (UNBAN_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleUnbanCommand(message, prompt);
      return;
    }

    // 0e. Modération : bannissement ?
    if (BAN_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleBanCommand(message, prompt);
      return;
    }

    // 0e. Modération : expulsion (kick) ?
    if (KICK_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleKickCommand(message, prompt);
      return;
    }

    // 0f. Modération : retrait de timeout ? (à tester avant "timeout"/"mute")
    if (UNTIMEOUT_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleUntimeoutCommand(message, prompt);
      return;
    }

    // 0g. Modération : timeout (mute temporaire) ?
    if (TIMEOUT_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleTimeoutCommand(message, prompt);
      return;
    }

    // 1. Demande d'image ?
    if (IMAGE_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleImageRequest(message, prompt);
      return;
    }

    // 2. Demande de CSV / graphique ?
    if (CSV_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      await handleCsvChartRequest(message, prompt);
      return;
    }

    // 3. Question normale : avec contexte d'un salon mentionné (#salon),
    //    ou contexte global si "tout le serveur" est demandé, sinon rien.
    let channelContext = await getMentionedChannelContext(message);
    if (!channelContext && GLOBAL_SEARCH_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
      channelContext = await getGlobalServerContext(message.guild);
    }

    const reply = await askGemini(message.channel.id, prompt, channelContext);
    await sendLongReply(message, reply);
    await maybeSpeakReply(message.guild.id, reply);
  } catch (err) {
    console.error("Erreur Mimir:", err);
    await message.reply(
      "⚠️ Désolé, je n'ai pas réussi à traiter ta demande (voir logs du bot)."
    );
  }
});

/**
 * Parcourt tous les salons texte accessibles au bot sur le serveur et
 * récupère un échantillon récent de chacun, pour une question du type
 * "résume-moi ce qui s'est passé sur tout le serveur".
 * Limité en nombre de salons et de messages pour éviter de saturer
 * le prompt envoyé à Gemini.
 */
async function getGlobalServerContext(guild) {
  if (!guild) return null;

  const textChannels = guild.channels.cache
    .filter((c) => c.isTextBased && c.isTextBased() && !c.isVoiceBased?.())
    .first(GLOBAL_SEARCH_MAX_CHANNELS);

  const sections = [];

  for (const channel of textChannels) {
    try {
      const fetched = await channel.messages.fetch({
        limit: GLOBAL_SEARCH_MESSAGES_PER_CHANNEL,
      });
      const ordered = Array.from(fetched.values()).reverse();
      const formatted = ordered
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => `[${m.author.username}] ${m.content}`)
        .join("\n");

      if (formatted) {
        sections.push(`### Salon #${channel.name}\n${formatted}`);
      }
    } catch {
      // Pas de permission sur ce salon : on l'ignore silencieusement
      continue;
    }
  }

  if (sections.length === 0) return null;

  return {
    channelName: "tout le serveur",
    text: sections.join("\n\n"),
  };
}

/**
 * Si le message contient une vraie mention Discord de salon (#nom-du-salon,
 * celle qui devient cliquable/bleue), va chercher les N derniers messages
 * de ce salon et les formate en texte pour servir de contexte à Gemini.
 * Retourne null si aucun salon n'est mentionné ou si le bot n'a pas accès.
 */
async function getMentionedChannelContext(message) {
  const mentionedChannel = message.mentions.channels.first();
  if (!mentionedChannel || !mentionedChannel.isTextBased()) return null;

  try {
    const fetched = await mentionedChannel.messages.fetch({
      limit: CHANNEL_CONTEXT_MESSAGE_COUNT,
    });

    // Discord renvoie du plus récent au plus ancien : on remet dans l'ordre chronologique
    const ordered = Array.from(fetched.values()).reverse();

    const formatted = ordered
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => `[${m.author.username}] ${m.content}`)
      .join("\n");

    if (!formatted) return null;

    return {
      channelName: mentionedChannel.name,
      text: formatted,
    };
  } catch (err) {
    console.warn(
      `⚠️ Impossible de lire l'historique de #${mentionedChannel.name} (permissions manquantes ?):`,
      err.message
    );
    return null;
  }
}

// Coupe-circuit partagé : après un 429 (quota dépassé), on évite de
// gaspiller le peu de quota restant sur des appels "bonus" non essentiels
let aiCooldownUntil = 0;

/**
 * Appelle l'API IA actuelle (Gemini, Groq ou Mistral) avec rotation automatique.
 * En cas de quota dépassé (429), passe au provider suivant et réessaie.
 */
async function callAIGenerateContent(messages, config = {}) {
  const maxRetries = GEMINI_API_KEYS.length + (GROQ_API_KEY ? 1 : 0) + MISTRAL_API_KEYS.length;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const providerConfig = getCurrentProviderConfig();
    
    if (!providerConfig) {
      throw new Error(
        "❌ Aucun provider IA disponible ! Configure au moins une clé API dans .env " +
        "(GEMINI_API_KEY, GROQ_API_KEY ou MISTRAL_API_KEY)"
      );
    }

    try {
      console.log(`🤖 Tentative ${attempt + 1}/${maxRetries} : ${providerConfig.provider} (${providerConfig.model})`);
      
      if (providerConfig.provider === "gemini") {
        return await callGeminiAPI(messages, providerConfig, config);
      } else if (providerConfig.provider === "groq") {
        return await callGroqAPI(messages, providerConfig, config);
      } else if (providerConfig.provider === "mistral") {
        return await callMistralAPI(messages, providerConfig, config);
      }
    } catch (error) {
      // Erreur 429 = quota dépassé, on passe au suivant
      if (error.message.includes("429") || error.message.includes("quota") || error.message.includes("rate limit")) {
        console.warn(`⚠️ Quota dépassé pour ${providerConfig.provider}`);
        
        if (switchToNextProvider()) {
          console.log(`🔄 Passage au provider suivant...`);
          continue; // Réessayer avec le nouveau provider
        } else {
          aiCooldownUntil = Date.now() + 60_000;
          throw new Error(
            `❌ Tous les quotas IA sont épuisés ! ` +
            `Gemini: ${GEMINI_API_KEYS.length} clé(s), ` +
            `Groq: ${GROQ_API_KEY ? "1 clé" : "non configuré"}, ` +
            `Mistral: ${MISTRAL_API_KEYS.length} clé(s). ` +
            `Attends la réinitialisation quotidienne ou ajoute plus de clés API.`
          );
        }
      }
      
      // Autre erreur, on la remonte
      throw error;
    }
  }
  
  throw new Error("❌ Échec après toutes les tentatives de rotation");
}

/**
 * Appelle l'API Gemini
 */
async function callGeminiAPI(messages, providerConfig, config) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${providerConfig.model}:generateContent?key=${providerConfig.apiKey}`;
  
  const body = {
    contents: messages.map(msg => ({
      role: msg.role === "system" ? "user" : msg.role,
      parts: [{ text: msg.content || msg.parts?.[0]?.text || "" }]
    })),
    generationConfig: {
      temperature: config.temperature || 0.8,
      maxOutputTokens: config.maxTokens || 1024,
    },
  };

  // Ajouter l'instruction système si présente
  if (config.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: config.systemInstruction }]
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "(réponse vide)";
  
  return { text, provider: "gemini" };
}

/**
 * Appelle l'API Groq (OpenAI-compatible)
 */
async function callGroqAPI(messages, providerConfig, config) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  
  const body = {
    model: providerConfig.model,
    messages: messages.map(msg => ({
      role: msg.role === "system" ? "system" : (msg.role === "model" ? "assistant" : "user"),
      content: msg.content || msg.parts?.[0]?.text || ""
    })),
    temperature: config.temperature || 0.8,
    max_tokens: config.maxTokens || 1024,
  };

  // Ajouter l'instruction système si présente
  if (config.systemInstruction && !body.messages.find(m => m.role === "system")) {
    body.messages.unshift({
      role: "system",
      content: config.systemInstruction
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "(réponse vide)";
  
  return { text, provider: "groq" };
}

/**
 * Appelle l'API Mistral (OpenAI-compatible)
 */
async function callMistralAPI(messages, providerConfig, config) {
  const url = "https://api.mistral.ai/v1/chat/completions";
  
  const body = {
    model: providerConfig.model,
    messages: messages.map(msg => ({
      role: msg.role === "system" ? "system" : (msg.role === "model" ? "assistant" : "user"),
      content: msg.content || msg.parts?.[0]?.text || ""
    })),
    temperature: config.temperature || 0.8,
    max_tokens: config.maxTokens || 1024,
  };

  // Ajouter l'instruction système si présente
  if (config.systemInstruction && !body.messages.find(m => m.role === "system")) {
    body.messages.unshift({
      role: "system",
      content: config.systemInstruction
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mistral API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "(réponse vide)";
  
  return { text, provider: "mistral" };
}

/**
 * Envoie le prompt à l'API IA actuelle et retourne le texte généré.
 * Garde un petit historique par salon pour un semblant de mémoire.
 * Si channelContext est fourni, l'historique du salon mentionné est
 * injecté dans le prompt comme contexte.
 */
async function askGemini(channelId, prompt, channelContext = null) {
  const history = conversationHistory.get(channelId) || [];

  let finalPrompt = prompt;
  if (channelContext) {
    finalPrompt =
      `Voici un extrait récent des messages de ${channelContext.channelName === "tout le serveur" ? "plusieurs salons du serveur" : `#${channelContext.channelName}`} ` +
      `(format "[auteur] message") :\n\n---\n${channelContext.text}\n---\n\n` +
      `Question de l'utilisateur : ${prompt}`;
  }

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.parts?.[0]?.text || "" })),
    { role: "user", content: finalPrompt },
  ];

  const result = await callAIGenerateContent(messages, {
    systemInstruction: "Tu es Mimir, un assistant IA sur un serveur Discord. " +
      "Réponds de façon claire, concise et utile. " +
      "Utilise le markdown Discord (gras, listes, blocs de code) quand c'est pertinent.",
    temperature: 0.8,
    maxTokens: 1024,
  });

  const text = result.text;

  // Met à jour l'historique court par salon (on garde le prompt original,
  // sans le gros contexte du salon, pour ne pas saturer l'historique)
  history.push({ role: "user", parts: [{ text: prompt }] });
  history.push({ role: "model", parts: [{ text }] });
  while (history.length > MAX_HISTORY_MESSAGES) history.shift();
  conversationHistory.set(channelId, history);

  return text;
}

/**
 * Découpe et envoie une réponse si elle dépasse la limite Discord (2000 caractères).
 */
async function sendLongReply(message, text) {
  if (text.length <= DISCORD_MAX_LENGTH) {
    await message.reply(text);
    return;
  }

  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, DISCORD_MAX_LENGTH));
    remaining = remaining.slice(DISCORD_MAX_LENGTH);
  }

  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply(chunks[i]);
    } else {
      await message.channel.send(chunks[i]);
    }
  }
}

/**
 * Vérifie que l'auteur du message a bien la permission Discord requise
 * pour exécuter une action de modération. Envoie un message d'erreur et
 * renvoie false si ce n'est pas le cas.
 */
function hasModerationPermission(message, permissionFlag) {
  if (!message.guild || !message.member) return false;
  if (!message.member.permissions.has(permissionFlag)) {
    message.reply("🚫 Tu n'as pas la permission Discord nécessaire pour faire ça.");
    return false;
  }
  return true;
}

/**
 * Extrait une durée (ex: "10m", "2h", "1j", "30s") d'un texte et la
 * convertit en millisecondes. Retourne null si aucune durée trouvée.
 * Le timeout Discord est plafonné à 28 jours.
 */
function parseDuration(text) {
  const match = text.match(
    /(\d+)\s*(s|sec|secondes?|m|min|minutes?|h|heures?|hr|j|jour(?:s)?|d|days?)\b/i
  );
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let ms;
  if (unit.startsWith("s")) ms = amount * 1000;
  else if (unit.startsWith("m")) ms = amount * 60 * 1000;
  else if (unit.startsWith("h")) ms = amount * 60 * 60 * 1000;
  else ms = amount * 24 * 60 * 60 * 1000; // j / jour(s) / d / day(s)

  const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // limite Discord : 28 jours
  return { ms: Math.min(ms, MAX_TIMEOUT_MS), matchedText: match[0] };
}

/**
 * Retire la mention brute (<@id> / <@!id>) et les mots déclencheurs d'un
 * texte pour ne garder que la raison éventuellement fournie par l'utilisateur.
 */
function extractReason(prompt, triggers, extraToStrip = "") {
  let reason = prompt.replace(/<@!?\d+>/g, "");
  if (extraToStrip) reason = reason.replace(extraToStrip, "");
  for (const t of triggers) reason = reason.replace(new RegExp(t, "i"), "");
  reason = reason.trim();
  return reason || "Aucune raison fournie";
}

/**
 * Ban d'un membre mentionné.
 * Ex : "mimir ban @pseudo spam répété"
 */
async function handleBanCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.BanMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("⚠️ Mentionne la personne à bannir, ex : `mimir ban @pseudo raison`.");
    return;
  }
  if (!target.bannable) {
    await message.reply(
      "⚠️ Je ne peux pas bannir ce membre (rôle trop élevé par rapport au mien, ou permissions insuffisantes)."
    );
    return;
  }

  const reason = extractReason(prompt, BAN_TRIGGERS);
  await target.ban({ reason: `${reason} (par ${message.author.tag} via Mimir)` });
  await message.reply(`🔨 **${target.user.tag}** a été banni. Raison : ${reason}`);
}

/**
 * Débannit un utilisateur à partir de son ID (il n'est plus sur le serveur,
 * donc impossible de le mentionner). Ex : "mimir unban 123456789012345678"
 */
async function handleUnbanCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.BanMembers)) return;

  const idMatch = prompt.match(/\d{17,20}/);
  if (!idMatch) {
    await message.reply(
      "⚠️ Donne l'ID Discord de l'utilisateur à débannir, ex : `mimir unban 123456789012345678`."
    );
    return;
  }

  try {
    await message.guild.members.unban(idMatch[0]);
    await message.reply(`✅ L'utilisateur \`${idMatch[0]}\` a été débanni.`);
  } catch (err) {
    await message.reply(
      `⚠️ Impossible de débannir cet utilisateur (pas banni actuellement ou ID invalide) : ${err.message}`
    );
  }
}

/**
 * Expulse (kick) un membre mentionné.
 * Ex : "mimir kick @pseudo raison"
 */
async function handleKickCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.KickMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("⚠️ Mentionne la personne à expulser, ex : `mimir kick @pseudo raison`.");
    return;
  }
  if (!target.kickable) {
    await message.reply(
      "⚠️ Je ne peux pas expulser ce membre (rôle trop élevé par rapport au mien, ou permissions insuffisantes)."
    );
    return;
  }

  const reason = extractReason(prompt, KICK_TRIGGERS);
  await target.kick(`${reason} (par ${message.author.tag} via Mimir)`);
  await message.reply(`👢 **${target.user.tag}** a été expulsé. Raison : ${reason}`);
}

/**
 * Timeout (mute temporaire, natif Discord) d'un membre mentionné.
 * Ex : "mimir timeout @pseudo 10m spam" ou "mimir mute @pseudo 1h raison"
 * Formats de durée acceptés : s (secondes), m (minutes), h (heures), j/d (jours).
 */
async function handleTimeoutCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.ModerateMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply(
      "⚠️ Mentionne la personne à timeout, ex : `mimir timeout @pseudo 10m raison`."
    );
    return;
  }
  if (!target.moderatable) {
    await message.reply(
      "⚠️ Je ne peux pas timeout ce membre (rôle trop élevé par rapport au mien, ou permissions insuffisantes)."
    );
    return;
  }

  const duration = parseDuration(prompt);
  if (!duration) {
    await message.reply(
      "⚠️ Précise une durée, ex : `mimir timeout @pseudo 10m raison` (formats acceptés : s, m, h, j)."
    );
    return;
  }

  const reason = extractReason(prompt, TIMEOUT_TRIGGERS, duration.matchedText);
  await target.timeout(duration.ms, `${reason} (par ${message.author.tag} via Mimir)`);

  const minutes = Math.round(duration.ms / 60000);
  const durationLabel = minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
  await message.reply(
    `🔇 **${target.user.tag}** est en timeout pour ${durationLabel}. Raison : ${reason}`
  );
}

/**
 * Retire un timeout en cours sur un membre mentionné.
 * Ex : "mimir untimeout @pseudo" ou "mimir unmute @pseudo"
 */
async function handleUntimeoutCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.ModerateMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply(
      "⚠️ Mentionne la personne dont il faut retirer le timeout, ex : `mimir untimeout @pseudo`."
    );
    return;
  }

  await target.timeout(null, `Timeout retiré par ${message.author.tag} via Mimir`);
  await message.reply(`🔊 Le timeout de **${target.user.tag}** a été retiré.`);
}


// Formats d'image disponibles (largeur x hauteur) selon des mots-clés
// détectés dans la demande de l'utilisateur.
const IMAGE_SIZE_PRESETS = {
  carre: { width: 1024, height: 1024 },
  portrait: { width: 896, height: 1280 },
  paysage: { width: 1280, height: 896 },
  large: { width: 1344, height: 768 }, // 16:9
  etroit: { width: 768, height: 1344 }, // 9:16
};

/**
 * Détecte un format d'image demandé (portrait, paysage, carré, 16:9, 9:16...)
 * dans le texte. Retourne le format carré par défaut si rien n'est trouvé.
 */
function detectImageSize(text) {
  const lower = text.toLowerCase();
  if (lower.includes("16:9") || lower.includes("16/9")) return IMAGE_SIZE_PRESETS.large;
  if (lower.includes("9:16") || lower.includes("9/16")) return IMAGE_SIZE_PRESETS.etroit;
  if (lower.includes("portrait") || lower.includes("vertical")) return IMAGE_SIZE_PRESETS.portrait;
  if (lower.includes("paysage") || lower.includes("horizontal") || lower.includes("large"))
    return IMAGE_SIZE_PRESETS.paysage;
  return IMAGE_SIZE_PRESETS.carre;
}

/**
 * Demande à Gemini de transformer une description brute en un prompt
 * détaillé et riche en anglais (le modèle d'image Flux répond mieux à des
 * prompts anglais précis : style, éclairage, composition, ambiance). En
 * cas d'échec, retombe simplement sur la description d'origine.
 */
async function enhanceImagePrompt(description) {
  const enhancingPrompt =
    "Tu es un expert en prompts pour générateurs d'images IA (type Flux/Midjourney). " +
    "Réécris la demande suivante en un prompt détaillé et vivant EN ANGLAIS, riche en " +
    "détails visuels concrets (composition, éclairage, style artistique, ambiance, niveau " +
    "de détail/qualité). Garde le sujet et l'intention d'origine, n'invente pas d'éléments " +
    "hors sujet. Réponds UNIQUEMENT avec le prompt final, une seule ligne, sans guillemets, " +
    "sans commentaire, maximum 70 mots.\n\n" +
    `Demande originale : ${description}`;

  try {
    const result = await callAIGenerateContent([
      { role: "user", content: enhancingPrompt }
    ], {
      temperature: 0.9,
      maxTokens: 200
    });

    const enhanced = result.text
      .trim()
      .replace(/^["']+|["']+$/g, "") // guillemets parasites
      .replace(/\s+/g, " "); // aplati d'éventuels retours à la ligne

    return enhanced || description;
  } catch (err) {
    console.warn(
      "⚠️ Amélioration du prompt d'image échouée, utilisation du prompt brut :",
      err.message
    );
    return description;
  }
}

/**
 * Télécharge une image depuis une URL, avec une nouvelle tentative en cas
 * d'échec (Pollinations est gratuit mais parfois instable sous charge).
 */
async function fetchImageWithRetry(url, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Pollinations error ${response.status}`);
      }

      // Pollinations répond parfois 200 avec une page d'erreur/texte (prompt
      // filtré, quota, etc.) au lieu d'une vraie image : on vérifie le
      // content-type pour éviter d'envoyer un fichier cassé à Discord.
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        const bodyPreview = (await response.text()).slice(0, 300);
        throw new Error(
          `Pollinations n'a pas renvoyé une image (content-type: ${contentType || "inconnu"}) : ${bodyPreview}`
        );
      }

      return response;
    } catch (err) {
      lastErr = err;
      console.warn(
        `⚠️ Tentative ${i + 1}/${attempts} de génération d'image échouée : ${err.message}`
      );
    }
  }
  throw lastErr;
}

/**
 * Génère une image via Pollinations.ai (gratuit, sans clé API) et l'envoie
 * dans le salon en pièce jointe. La description brute de l'utilisateur est
 * d'abord enrichie par Gemini pour un meilleur rendu, le format (carré,
 * portrait, paysage, 16:9, 9:16) est détecté dans la demande, et un seed
 * aléatoire évite de retomber sur une image déjà mise en cache.
 */
async function handleImageRequest(message, prompt) {
  // Nettoie le prompt des mots déclencheurs pour ne garder que la description
  let description = prompt;
  for (const trigger of IMAGE_TRIGGERS) {
    description = description.replace(new RegExp(trigger, "i"), "");
  }
  description = description.trim() || prompt;

  const { width, height } = detectImageSize(description);

  await message.channel.sendTyping();
  const enhancedPrompt = await enhanceImagePrompt(description);

  const seed = Math.floor(Math.random() * 1_000_000);
  const encoded = encodeURIComponent(enhancedPrompt);
  const url =
    `https://image.pollinations.ai/prompt/${encoded}` +
    `?width=${width}&height=${height}&nologo=true&model=flux&seed=${seed}`;

  let response;
  try {
    response = await fetchImageWithRetry(url);
  } catch (err) {
    await message.reply(
      `⚠️ La génération d'image a échoué après plusieurs tentatives : ${err.message}`
    );
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  const attachment = new AttachmentBuilder(Buffer.from(arrayBuffer), {
    name: "mimir-image.png",
  });

  await message.reply({
    content: `🎨 Voici pour : *${description}*`,
    files: [attachment],
  });
}

/**
 * Demande à Gemini de structurer la requête de l'utilisateur en données
 * (labels + valeurs), puis génère un CSV et un graphique (via QuickChart,
 * gratuit et sans clé) à partir de ces données.
 */
async function handleCsvChartRequest(message, prompt) {
  const structuringPrompt =
    "Analyse cette demande et extrait ou invente des données tabulaires adaptées. " +
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, au format exact :\n" +
    '{"title": "titre court", "chartType": "bar|line|pie", "labels": ["a","b","c"], "datasetLabel": "nom de la série", "values": [1,2,3]}\n\n' +
    `Demande de l'utilisateur : ${prompt}`;

  const result = await callAIGenerateContent([
    { role: "user", content: structuringPrompt }
  ], {
    temperature: 0.3,
    maxTokens: 1024
  });

  const rawText = result.text;
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    await message.reply(
      "⚠️ Je n'ai pas réussi à structurer des données à partir de ta demande. Essaie d'être plus précis (ex : `mimir csv ventes janvier 100, février 150, mars 200`)."
    );
    return;
  }

  const { title, chartType, labels, datasetLabel, values } = parsed;

  // Construit le CSV
  const csvLines = [`${datasetLabel || "label"},valeur`];
  labels.forEach((label, i) => csvLines.push(`${label},${values[i]}`));
  const csvContent = csvLines.join("\n");
  const csvAttachment = new AttachmentBuilder(Buffer.from(csvContent), {
    name: "donnees.csv",
  });

  // Construit le graphique via QuickChart (gratuit, sans clé)
  const chartConfig = {
    type: chartType && ["bar", "line", "pie"].includes(chartType) ? chartType : "bar",
    data: {
      labels,
      datasets: [{ label: datasetLabel || "Valeurs", data: values }],
    },
    options: { plugins: { title: { display: true, text: title || "Graphique" } } },
  };
  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify(chartConfig)
  )}&width=700&height=450`;

  const chartResponse = await fetch(chartUrl);
  const chartBuffer = Buffer.from(await chartResponse.arrayBuffer());
  const chartAttachment = new AttachmentBuilder(chartBuffer, {
    name: "graphique.png",
  });

  await message.reply({
    content: `📊 **${title || "Résultat"}**`,
    files: [csvAttachment, chartAttachment],
  });
}

/**
 * Traducteur "au pair" : réagir à n'importe quel message avec un emoji
 * drapeau (🇫🇷, 🇬🇧, 🇪🇸...) déclenche une traduction de ce message dans
 * la langue correspondante, postée en réponse.
 */
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  const targetLanguage = FLAG_LANGUAGE_MAP[reaction.emoji.name];
  if (!targetLanguage) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (err) {
    console.warn("⚠️ Impossible de récupérer le message/réaction:", err.message);
    return;
  }

  const originalText = reaction.message.content;
  if (!originalText || originalText.trim().length === 0) return;

  try {
    const translationPrompt =
      `Traduis le texte suivant en ${targetLanguage}. Réponds UNIQUEMENT avec la traduction, sans commentaire ni guillemets :\n\n${originalText}`;

    const result = await callAIGenerateContent([
      { role: "user", content: translationPrompt }
    ], {
      temperature: 0.3,
      maxTokens: 512
    });

    const translation = result.text || "(traduction vide)";

    await reaction.message.reply(
      `🌐 **Traduction (${targetLanguage}) :**\n${translation}`
    );
  } catch (err) {
    console.error("Erreur traduction:", err);
  }
});

// ============================================================
// MODULE VOCAL — écoute, transcription (Groq Whisper), réponse (TTS)
// ============================================================

/**
 * Lance ffmpeg en lui passant un buffer sur stdin et récupère sa sortie
 * sur stdout (aucun fichier temporaire nécessaire). Retourne aussi le
 * texte de stderr, qui contient entre autres la durée du fichier source.
 */
function runFfmpeg(args, inputBuffer) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.env.FFMPEG_PATH, args);
    const outChunks = [];
    let stderrData = "";

    proc.stdout.on("data", (d) => outChunks.push(d));
    proc.stderr.on("data", (d) => (stderrData += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0 && outChunks.length === 0) {
        reject(new Error(`ffmpeg a échoué (code ${code}) : ${stderrData.slice(-500)}`));
        return;
      }
      resolve({ buffer: Buffer.concat(outChunks), stderr: stderrData });
    });

    proc.stdin.on("error", () => {}); // évite un crash si ffmpeg ferme stdin tôt
    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}

/**
 * Convertit un buffer audio (mp3, sortie du TTS) en OGG/Opus, le format
 * requis par Discord pour un message vocal natif. Retourne aussi la durée
 * en secondes (lue dans les logs ffmpeg), nécessaire pour l'attachement.
 */
async function convertToOggOpus(inputBuffer) {
  const { buffer, stderr } = await runFfmpeg(
    [
      "-i", "pipe:0",
      "-c:a", "libopus",
      "-b:a", "32k",
      "-ar", "48000",
      "-ac", "1",
      "-f", "ogg",
      "pipe:1",
    ],
    inputBuffer
  );

  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  let durationSecs = 1;
  if (durationMatch) {
    const [, h, m, s] = durationMatch;
    durationSecs = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
  }

  if (buffer.length === 0) {
    throw new Error("ffmpeg n'a produit aucun audio Opus (vérifie que le build ffmpeg-static inclut libopus).");
  }

  return { oggBuffer: buffer, durationSecs: Math.max(durationSecs, 0.5) };
}

/**
 * Construit une forme d'onde factice pour l'attachement de message vocal
 * Discord (base64 d'octets 0-255). Discord ne vérifie pas la cohérence
 * avec l'audio réel, c'est purement visuel dans le client — on génère une
 * enveloppe qui monte puis redescend, plus crédible qu'une ligne plate.
 */
function buildSyntheticWaveform() {
  const sampleCount = 256;
  const bytes = Buffer.alloc(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const envelope = Math.sin(t * Math.PI); // monte puis redescend
    const noise = Math.random() * 0.3;
    bytes[i] = Math.min(255, Math.max(0, Math.round((envelope * 0.7 + noise) * 255)));
  }
  return bytes.toString("base64");
}

/**
 * Envoie un message vocal Discord natif via l'API en 3 étapes :
 * 1. Demande une URL d'upload
 * 2. Upload le fichier audio
 * 3. Envoie le message avec les métadonnées
 */
async function sendNativeVoiceMessage(channelId, replyToMessageId, oggBuffer, durationSecs, waveformBase64) {
  const filename = "voice-message.ogg";
  const fileSize = oggBuffer.length;

  // Étape 1 : Demander une URL d'upload
  const attachmentResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/attachments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${DISCORD_TOKEN}`,
    },
    body: JSON.stringify({
      files: [{
        filename: filename,
        file_size: fileSize,
        id: "0"
      }]
    }),
  });

  if (!attachmentResponse.ok) {
    const errorText = await attachmentResponse.text();
    throw new Error(`Discord attachment request error: ${attachmentResponse.status} - ${errorText}`);
  }

  const attachmentData = await attachmentResponse.json();
  const uploadUrl = attachmentData.attachments[0].upload_url;
  const uploadedFilename = attachmentData.attachments[0].upload_filename;

  // Étape 2 : Upload le fichier OGG
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "audio/ogg",
    },
    body: oggBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Discord file upload error: ${uploadResponse.status} - ${errorText}`);
  }

  // Étape 3 : Envoyer le message vocal
  const messagePayload = {
    flags: MessageFlags.IsVoiceMessage,
    attachments: [{
      id: "0",
      filename: filename,
      uploaded_filename: uploadedFilename,
      duration_secs: durationSecs,
      waveform: waveformBase64,
    }],
  };

  if (replyToMessageId) {
    messagePayload.message_reference = {
      message_id: replyToMessageId,
      fail_if_not_exists: false
    };
  }

  const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${DISCORD_TOKEN}`,
    },
    body: JSON.stringify(messagePayload),
  });

  if (!messageResponse.ok) {
    const errorText = await messageResponse.text();
    throw new Error(`Discord message send error: ${messageResponse.status} - ${errorText}`);
  }

  return await messageResponse.json();

  return await response.json();
}

/**
 * Génère une réponse IA puis l'envoie comme un VRAI message vocal Discord
 * (la bulle audio native avec forme d'onde et durée, lisible directement
 * dans le client), au lieu d'un simple fichier audio en pièce jointe.
 * Ex : "mimir message vocal explique-moi la mitose"
 */
async function handleVoiceMessageReply(message, prompt) {
  let cleanedPrompt = prompt;
  for (const t of VOICE_MESSAGE_TRIGGERS) {
    cleanedPrompt = cleanedPrompt.replace(new RegExp(t, "i"), "");
  }
  cleanedPrompt = cleanedPrompt.trim() || "Réponds brièvement, comme si tu parlais à voix haute.";

  await message.channel.sendTyping();

  let answerText;
  try {
    answerText = await askGemini(message.channel.id, cleanedPrompt);
  } catch (err) {
    await message.reply(`⚠️ Je n'ai pas réussi à préparer la réponse : ${err.message}`);
    return;
  }

  const spokenText = stripMarkdownForSpeech(answerText).slice(0, 800);

  try {
    const mp3Buffer = await synthesizeSpeechBuffer(spokenText, TTS_VOICE);
    const { oggBuffer, durationSecs } = await convertToOggOpus(mp3Buffer);
    const waveform = buildSyntheticWaveform();

    await sendNativeVoiceMessage(message.channel.id, message.id, oggBuffer, durationSecs, waveform);
  } catch (err) {
    console.error("Erreur génération message vocal natif:", err);
    // Repli : la réponse texte reste utile même si l'audio a échoué
    await sendLongReply(message, answerText);
    await message.channel.send(
      `⚠️ Je n'ai pas réussi à générer le message vocal natif (${err.message}), voici la réponse en texte à la place.`
    );
  }
}

/**
 * Retire le markdown Discord (gras, italique, code, liens, titres...) d'un
 * texte pour que la synthèse vocale ne lise pas les symboles à voix haute.
 */
function stripMarkdownForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, " (extrait de code) ") // blocs de code
    .replace(/`([^`]+)`/g, "$1") // code inline
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // liens [texte](url) → texte
    .replace(/https?:\/\/\S+/g, "un lien") // liens bruts
    .replace(/[*_~#>]/g, "") // gras, italique, barré, titres, citations
    .replace(/\n+/g, ". ") // sauts de ligne → pause
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Si le bot est déjà connecté à un salon vocal sur ce serveur, lit la
 * réponse à voix haute en plus du message texte. Ne fait rien si le bot
 * n'est pas en vocal ou si la synthèse échoue (le texte reste dans tous
 * les cas la réponse principale, la voix est un bonus silencieux en cas
 * d'échec pour ne pas polluer le salon d'erreurs répétées).
 */
async function maybeSpeakReply(guildId, text) {
  const session = activeVoiceSessions.get(guildId);
  if (!session) return;

  const spoken = stripMarkdownForSpeech(text);
  if (!spoken) return;

  try {
    await speakInVoiceChannel(session.connection, spoken);
  } catch (err) {
    console.error("Erreur lecture vocale de la réponse texte:", err);
    if (session.textChannel) {
      await session.textChannel.send(
        `⚠️ J'ai la réponse mais je n'ai pas réussi à la dire à voix haute : ${err.message}`
      );
    }
  }
}

/**
 * Rejoint le salon vocal de l'utilisateur qui a envoyé la commande,
 * annonce (texte + voix) qu'il enregistre/transcrit, puis se met à
 * écouter chaque participant qui parle.
 */
async function joinVoiceAndListen(message) {
  if (!GROQ_API_KEY) {
    await message.reply(
      "⚠️ Il manque `GROQ_API_KEY` dans le `.env` (nécessaire pour la transcription vocale). " +
        "Clé gratuite sur https://console.groq.com"
    );
    return;
  }

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    await message.reply("⚠️ Tu dois d'abord être connecté à un salon vocal.");
    return;
  }

  // Annonce claire AVANT toute écoute : transparence sur l'enregistrement
  await message.channel.send(
    `🎙️ **Mimir rejoint #${voiceChannel.name}** — je transcris cette conversation ` +
      "pour pouvoir répondre à mes commandes vocales (déclenchées en disant **\"mimir\"**). " +
      'Dites **"stop mimir"** ou tapez `mimir quitte le vocal` pour que je parte à tout moment.'
  );

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (err) {
    connection.destroy();
    await message.reply("⚠️ Impossible de rejoindre le vocal (timeout de connexion).");
    return;
  }

  activeVoiceSessions.set(message.guild.id, {
    connection,
    textChannel: message.channel,
  });

  // Annonce vocale (si ça échoue, on le dit clairement dans le salon texte
  // au lieu de le passer sous silence — c'est ce qui rendait le bug invisible)
  try {
    await speakInVoiceChannel(
      connection,
      "Bonjour, j'ai rejoint ce salon et je transcris la conversation."
    );
  } catch (err) {
    console.error("Erreur annonce vocale:", err);
    await message.channel.send(
      `⚠️ J'ai rejoint le vocal mais je n'ai pas réussi à parler (${err.message}). ` +
        "Vérifie les logs du bot pour le détail."
    );
  }

  // Écoute chaque utilisateur qui commence à parler
  connection.receiver.speaking.on("start", (userId) => {
    console.log(`🎙️ Détection : l'utilisateur ${userId} a commencé à parler`);
    handleUserSpeaking(connection, message.guild.id, userId).catch((err) =>
      console.error("Erreur écoute utilisateur:", err)
    );
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    activeVoiceSessions.delete(message.guild.id);
  });
}

/**
 * Fait quitter le bot du salon vocal du serveur donné.
 */
async function leaveVoice(guildId, announceText) {
  const session = activeVoiceSessions.get(guildId);
  if (!session) return;

  session.connection.destroy();
  activeVoiceSessions.delete(guildId);

  if (announceText && session.textChannel) {
    await session.textChannel.send(announceText);
  }
}

/**
 * Capture l'audio d'un utilisateur qui parle, jusqu'à un silence, le
 * décode en PCM, puis le transcrit via Groq Whisper. Si la transcription
 * commence par "mimir", traite ça comme une commande vocale.
 */
async function handleUserSpeaking(connection, guildId, userId) {
  const session = activeVoiceSessions.get(guildId);
  if (!session) return;

  const opusStream = connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
  });
  opusStream.on("error", (err) =>
    console.error(`Erreur flux audio brut (utilisateur ${userId}):`, err)
  );

  const decoder = new prism.opus.Decoder({
    rate: VOICE_SAMPLE_RATE,
    channels: VOICE_CHANNELS,
    frameSize: 960,
  });

  const chunks = [];
  opusStream.pipe(decoder);

  decoder.on("data", (chunk) => chunks.push(chunk));

  await new Promise((resolve) => {
    decoder.on("end", resolve);
    decoder.on("error", (err) => {
      console.error("Erreur décodage Opus:", err);
      resolve();
    });
  });

  const pcmBuffer = Buffer.concat(chunks);
  console.log(
    `🔈 Clip capturé : ${pcmBuffer.length} octets (seuil minimum : ${Math.round(
      MIN_AUDIO_BYTES
    )})`
  );
  if (pcmBuffer.length < MIN_AUDIO_BYTES) {
    console.log("↳ Clip ignoré : trop court (probablement du bruit).");
    return;
  }

  try {
    const wavBuffer = pcmToWav(pcmBuffer, VOICE_SAMPLE_RATE, VOICE_CHANNELS);
    const transcript = await transcribeAudio(wavBuffer);
    if (!transcript || !transcript.trim()) {
      console.log("↳ Transcription vide (Whisper n'a rien entendu de clair).");
      return;
    }

    const lowerTranscript = transcript.trim().toLowerCase();
    console.log(`🎤 Transcription: "${transcript}"`);

    // Commande d'arrêt dite à voix haute
    if (LEAVE_VOICE_TRIGGERS.some((t) => lowerTranscript.includes(t))) {
      await speakInVoiceChannel(connection, "D'accord, à bientôt !");
      await leaveVoice(guildId, "👋 Quelqu'un m'a demandé de partir à l'oral.");
      return;
    }

    if (!lowerTranscript.startsWith(TRIGGER_WORD)) {
      console.log(
        `↳ Ignoré : ne commence pas par "${TRIGGER_WORD}" (donc pas adressé à Mimir).`
      );
      return;
    }

    const spokenPrompt = transcript.trim().slice(TRIGGER_WORD.length).trim();
    if (!spokenPrompt) return;

    if (session.textChannel) {
      await session.textChannel.send(`🎤 *"${transcript.trim()}"*`);
    }

    let answer;
    try {
      answer = await askGroqForVoice(spokenPrompt);
    } catch (err) {
      console.error("Erreur réponse Groq (vocal):", err);
      if (session.textChannel) {
        await session.textChannel.send(
          `⚠️ Je t'ai entendu mais l'appel à l'IA a échoué : ${err.message}`
        );
      }
      return;
    }

    if (session.textChannel) {
      await session.textChannel.send(`🔊 ${answer}`);
    }

    try {
      await speakInVoiceChannel(connection, answer);
    } catch (err) {
      console.error("Erreur lecture TTS (vocal):", err);
      if (session.textChannel) {
        await session.textChannel.send(
          `⚠️ J'ai la réponse mais je n'ai pas réussi à la dire à voix haute : ${err.message}`
        );
      }
    }
  } catch (err) {
    console.error("Erreur transcription/réponse vocale:", err);
    if (session.textChannel) {
      await session.textChannel.send(
        `⚠️ Erreur pendant la transcription/écoute vocale : ${err.message}`
      );
    }
  }
}

/**
 * Version courte/orale de la réponse IA, utilisant le LLM de Groq
 * (Llama 3.3 70B, rapide) au lieu de Gemini : pas de markdown, réponses
 * brèves, adaptées à être lues à voix haute.
 */
async function askGroqForVoice(prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content:
            "Tu es Mimir, un assistant vocal qui répond en français. Réponds en 2-3 phrases " +
            "MAXIMUM, à l'oral, sans markdown, sans listes à puces, sans astérisques.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "Je n'ai pas de réponse.";
}

/**
 * Transcrit un buffer audio via l'API Whisper de Groq (gratuite, sans carte).
 * Accepte wav, ogg, mp3, m4a, webm... (formats supportés par Groq).
 */
async function transcribeAudio(audioBuffer, filename = "audio.wav", contentType = "audio/wav") {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: contentType }), filename);
  form.append("model", "whisper-large-v3-turbo");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq transcription error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.text;
}

/**
 * Convertit du texte en audio (mp3) via StreamElements (gratuit, sans clé)
 * et le joue dans le salon vocal connecté.
 */
/**
 * Synthétise du texte en audio (mp3) via Microsoft Edge TTS (gratuit, sans
 * clé — c'est le moteur utilisé par la lecture à voix haute d'Edge/Windows).
 * Ouvre une connexion WebSocket à chaque appel : un peu moins optimal qu'une
 * connexion persistante, mais beaucoup plus robuste (pas de connexion qui
 * traîne et devient invalide entre deux réponses).
 */
async function synthesizeSpeechBuffer(text, voiceName) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);

  const chunks = [];
  try {
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
  } finally {
    tts.close();
  }

  return Buffer.concat(chunks);
}

/**
 * Convertit du texte en audio et le joue dans le salon vocal connecté.
 */
async function speakInVoiceChannel(connection, text) {
  const truncated = text.slice(0, 500); // limite raisonnable pour la synthèse

  const mp3Buffer = await synthesizeSpeechBuffer(truncated, TTS_VOICE);
  console.log(`🗣️ TTS (Edge) reçu : ${mp3Buffer.length} octets`);

  if (mp3Buffer.length < 500) {
    throw new Error(
      "Réponse TTS vide ou trop courte (vérifie que TTS_VOICE est un nom de voix Edge valide, ex: fr-FR-HenriNeural)."
    );
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(Readable.from(mp3Buffer), {
    inputType: StreamType.Arbitrary,
  });

  player.on("stateChange", (oldState, newState) => {
    console.log(`🔊 AudioPlayer: ${oldState.status} → ${newState.status}`);
  });

  const subscription = connection.subscribe(player);
  if (!subscription) {
    throw new Error(
      "connection.subscribe(player) a échoué (la connexion vocale n'est peut-être plus active)."
    );
  }
  player.play(resource);

  await new Promise((resolve, reject) => {
    let becamePlaying = false;
    player.on(AudioPlayerStatus.Playing, () => {
      becamePlaying = true;
    });
    player.on(AudioPlayerStatus.Idle, () => {
      if (!becamePlaying) {
        reject(
          new Error(
            "Le lecteur est passé direct à Idle sans jamais jouer de son (ffmpeg a probablement échoué à décoder l'audio — vérifie FFMPEG_PATH)."
          )
        );
      } else {
        resolve();
      }
    });
    player.on("error", (err) => {
      // Erreur la plus fréquente ici : ffmpeg introuvable/non exécutable
      // sur l'hébergeur (vérifie process.env.FFMPEG_PATH loggé au démarrage).
      reject(err);
    });
    // Sécurité : si rien ne se passe après 20s, on ne bloque pas indéfiniment
    setTimeout(() => reject(new Error("Timeout lecture audio (20s)")), 20_000);
  });
}

/**
 * Construit un en-tête WAV minimal autour d'un buffer PCM 16-bit.
 */
function pcmToWav(pcmBuffer, sampleRate, channels) {
  const bitDepth = 16;
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

client.login(DISCORD_TOKEN);