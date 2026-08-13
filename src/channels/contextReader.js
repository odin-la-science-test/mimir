// ============================================================
// Lecture intelligente des salons Discord : un salon mentionné
// (`#salon`, mention réelle OU nom tapé en clair), le salon courant, ou
// tout le serveur. Voir docs/adr/0009-lecture-intelligente-des-salons.md.
// ============================================================

const {
  CHANNEL_CONTEXT_MESSAGE_COUNT,
  GLOBAL_SEARCH_MESSAGES_PER_CHANNEL,
  GLOBAL_SEARCH_MAX_CHANNELS,
} = require("../config");
const { askGemini } = require("../ai/conversation");
const { sendLongReply } = require("../discord/reply");

const CURRENT_CHANNEL_TRIGGERS = ["ce salon", "ce canal", "ici", "ce channel"];
const LIST_CHANNELS_TRIGGERS = ["quels salons", "liste les salons", "liste des salons"];

function isTextReadable(channel) {
  return channel && channel.isTextBased && channel.isTextBased() && !channel.isVoiceBased?.();
}

/**
 * Récupère et formate les N derniers messages d'un salon en
 * "[auteur] message", du plus ancien au plus récent.
 */
async function fetchChannelMessagesAsText(channel, limit) {
  const fetched = await channel.messages.fetch({ limit });
  const ordered = Array.from(fetched.values()).reverse();
  return ordered
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => `[${m.author.username}] ${m.content}`)
    .join("\n");
}

/**
 * Trouve un salon texte du serveur par nom (insensible à la casse,
 * avec ou sans le "#" initial). Utilisé pour le cas où l'utilisateur a
 * tapé "#nom-du-salon" en texte brut sans passer par l'autocomplétion
 * Discord — ce texte n'est alors PAS une vraie mention exploitable via
 * message.mentions.channels, d'où ce filet de sécurité par nom.
 */
function resolveChannelByName(guild, rawName) {
  if (!guild || !rawName) return null;
  const cleaned = rawName.replace(/^#/, "").toLowerCase();
  return (
    guild.channels.cache.find((c) => isTextReadable(c) && c.name.toLowerCase() === cleaned) || null
  );
}

function extractTypedChannelName(text) {
  // \p{L}\p{N} couvre aussi les noms de salon accentués/unicode.
  const match = text.match(/#([\p{L}\p{N}_-]+)/u);
  return match ? match[1] : null;
}

/**
 * Contexte d'un salon explicitement désigné : vraie mention Discord en
 * priorité, sinon nom tapé en texte brut ("#salon" non résolu par le
 * client). Retourne null si aucun salon n'est identifiable ou lisible.
 */
async function getMentionedChannelContext(message) {
  let targetChannel = message.mentions.channels.first();

  if (!targetChannel || !targetChannel.isTextBased()) {
    const typedName = extractTypedChannelName(message.content);
    targetChannel = typedName ? resolveChannelByName(message.guild, typedName) : null;
  }

  if (!targetChannel) return null;

  try {
    const formatted = await fetchChannelMessagesAsText(targetChannel, CHANNEL_CONTEXT_MESSAGE_COUNT);
    if (!formatted) return null;
    return { label: `salon #${targetChannel.name}`, text: formatted };
  } catch (err) {
    console.warn(`⚠️ Impossible de lire l'historique de #${targetChannel.name} (permissions manquantes ?):`, err.message);
    return null;
  }
}

/**
 * Contexte du salon dans lequel la commande a été tapée ("mimir résume
 * ce salon").
 */
async function getCurrentChannelContext(message) {
  try {
    const formatted = await fetchChannelMessagesAsText(message.channel, CHANNEL_CONTEXT_MESSAGE_COUNT);
    if (!formatted) return null;
    return { label: `ce salon (#${message.channel.name})`, text: formatted };
  } catch (err) {
    console.warn("⚠️ Impossible de lire l'historique du salon courant:", err.message);
    return null;
  }
}

/**
 * Parcourt tous les salons texte accessibles au bot pour une question du
 * type "résume-moi ce qui s'est passé sur tout le serveur". Limité en
 * nombre de salons et de messages pour ne pas saturer le prompt envoyé
 * à l'IA ni prendre trop de temps.
 */
async function getGlobalServerContext(guild) {
  if (!guild) return null;

  const textChannels = guild.channels.cache.filter(isTextReadable).first(GLOBAL_SEARCH_MAX_CHANNELS);
  const sections = [];

  for (const channel of textChannels) {
    try {
      const formatted = await fetchChannelMessagesAsText(channel, GLOBAL_SEARCH_MESSAGES_PER_CHANNEL);
      if (formatted) sections.push(`### Salon #${channel.name}\n${formatted}`);
    } catch {
      continue; // pas de permission sur ce salon : on l'ignore silencieusement
    }
  }

  if (sections.length === 0) return null;
  return { label: "plusieurs salons du serveur", text: sections.join("\n\n") };
}

/**
 * Répond à une demande explicite de lecture de salon ("mimir lis le
 * salon #annonces", "mimir résume ce salon", "mimir quels salons
 * existent"). Complète le mécanisme implicite (mention #salon dans une
 * question normale, déjà géré par getMentionedChannelContext) par des
 * phrases naturelles dédiées.
 */
async function handleChannelReadRequest(message, prompt) {
  const lowerPrompt = prompt.toLowerCase();

  if (LIST_CHANNELS_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
    const names = message.guild.channels.cache
      .filter(isTextReadable)
      .map((c) => `#${c.name}`)
      .join(", ");
    await message.reply(names ? `📋 Salons texte visibles : ${names}` : "⚠️ Je ne vois aucun salon texte accessible.");
    return;
  }

  await message.channel.sendTyping();

  let context = await getMentionedChannelContext(message);
  if (!context && CURRENT_CHANNEL_TRIGGERS.some((t) => lowerPrompt.includes(t))) {
    context = await getCurrentChannelContext(message);
  }
  if (!context) {
    context = await getCurrentChannelContext(message); // repli raisonnable par défaut
  }

  if (!context) {
    await message.reply(
      "⚠️ Je n'ai pas réussi à lire de contenu ici (salon vide, ou je n'ai pas la permission " +
        "de voir son historique)."
    );
    return;
  }

  const question = prompt.trim() || "Résume ce qui s'est dit récemment.";
  const reply = await askGemini(message.channel.id, question, context);
  await sendLongReply(message, reply);
}

module.exports = {
  getMentionedChannelContext,
  getCurrentChannelContext,
  getGlobalServerContext,
  handleChannelReadRequest,
  resolveChannelByName,
};
