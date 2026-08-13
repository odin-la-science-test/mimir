// ============================================================
// Modération : ban, unban, kick, timeout, untimeout. Le bot vérifie la
// permission Discord de l'AUTEUR du message (pas seulement la sienne)
// avant d'agir.
// ============================================================

const { PermissionsBitField } = require("discord.js");
const { BAN_TRIGGERS, KICK_TRIGGERS, TIMEOUT_TRIGGERS } = require("../triggers");

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
  const match = text.match(/(\d+)\s*(s|sec|secondes?|m|min|minutes?|h|heures?|hr|j|jour(?:s)?|d|days?)\b/i);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let ms;
  if (unit.startsWith("s")) ms = amount * 1000;
  else if (unit.startsWith("m")) ms = amount * 60 * 1000;
  else if (unit.startsWith("h")) ms = amount * 60 * 60 * 1000;
  else ms = amount * 24 * 60 * 60 * 1000;

  const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
  return { ms: Math.min(ms, MAX_TIMEOUT_MS), matchedText: match[0] };
}

/**
 * Retire la mention brute (<@id> / <@!id>) et les mots déclencheurs d'un
 * texte pour ne garder que la raison éventuellement fournie.
 */
function extractReason(prompt, triggers, extraToStrip = "") {
  let reason = prompt.replace(/<@!?\d+>/g, "");
  if (extraToStrip) reason = reason.replace(extraToStrip, "");
  for (const t of triggers) reason = reason.replace(new RegExp(t, "i"), "");
  reason = reason.trim();
  return reason || "Aucune raison fournie";
}

async function handleBanCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.BanMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("⚠️ Mentionne la personne à bannir, ex : `mimir ban @pseudo raison`.");
    return;
  }
  if (!target.bannable) {
    await message.reply("⚠️ Je ne peux pas bannir ce membre (rôle trop élevé par rapport au mien, ou permissions insuffisantes).");
    return;
  }

  const reason = extractReason(prompt, BAN_TRIGGERS);
  await target.ban({ reason: `${reason} (par ${message.author.tag} via Mimir)` });
  await message.reply(`🔨 **${target.user.tag}** a été banni. Raison : ${reason}`);
}

async function handleUnbanCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.BanMembers)) return;

  const idMatch = prompt.match(/\d{17,20}/);
  if (!idMatch) {
    await message.reply("⚠️ Donne l'ID Discord de l'utilisateur à débannir, ex : `mimir unban 123456789012345678`.");
    return;
  }

  try {
    await message.guild.members.unban(idMatch[0]);
    await message.reply(`✅ L'utilisateur \`${idMatch[0]}\` a été débanni.`);
  } catch (err) {
    await message.reply(`⚠️ Impossible de débannir cet utilisateur (pas banni actuellement ou ID invalide) : ${err.message}`);
  }
}

async function handleKickCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.KickMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("⚠️ Mentionne la personne à expulser, ex : `mimir kick @pseudo raison`.");
    return;
  }
  if (!target.kickable) {
    await message.reply("⚠️ Je ne peux pas expulser ce membre (rôle trop élevé par rapport au mien, ou permissions insuffisantes).");
    return;
  }

  const reason = extractReason(prompt, KICK_TRIGGERS);
  await target.kick(`${reason} (par ${message.author.tag} via Mimir)`);
  await message.reply(`👢 **${target.user.tag}** a été expulsé. Raison : ${reason}`);
}

async function handleTimeoutCommand(message, prompt) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.ModerateMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("⚠️ Mentionne la personne à timeout, ex : `mimir timeout @pseudo 10m raison`.");
    return;
  }
  if (!target.moderatable) {
    await message.reply("⚠️ Je ne peux pas timeout ce membre (rôle trop élevé par rapport au mien, ou permissions insuffisantes).");
    return;
  }

  const duration = parseDuration(prompt);
  if (!duration) {
    await message.reply("⚠️ Précise une durée, ex : `mimir timeout @pseudo 10m raison` (formats acceptés : s, m, h, j).");
    return;
  }

  const reason = extractReason(prompt, TIMEOUT_TRIGGERS, duration.matchedText);
  await target.timeout(duration.ms, `${reason} (par ${message.author.tag} via Mimir)`);

  const minutes = Math.round(duration.ms / 60000);
  const durationLabel = minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
  await message.reply(`🔇 **${target.user.tag}** est en timeout pour ${durationLabel}. Raison : ${reason}`);
}

async function handleUntimeoutCommand(message) {
  if (!hasModerationPermission(message, PermissionsBitField.Flags.ModerateMembers)) return;

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("⚠️ Mentionne la personne dont il faut retirer le timeout, ex : `mimir untimeout @pseudo`.");
    return;
  }

  await target.timeout(null, `Timeout retiré par ${message.author.tag} via Mimir`);
  await message.reply(`🔊 Le timeout de **${target.user.tag}** a été retiré.`);
}

module.exports = {
  handleBanCommand,
  handleUnbanCommand,
  handleKickCommand,
  handleTimeoutCommand,
  handleUntimeoutCommand,
};
