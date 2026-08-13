const { DISCORD_MAX_LENGTH } = require("../config");

/**
 * Découpe et envoie une réponse si elle dépasse la limite Discord (2000
 * caractères), sur des frontières de mot quand c'est possible pour éviter
 * de couper un mot ou un bloc de code en plein milieu.
 */
async function sendLongReply(message, text) {
  if (text.length <= DISCORD_MAX_LENGTH) {
    await message.reply(text);
    return;
  }

  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n", DISCORD_MAX_LENGTH);
    if (cut < DISCORD_MAX_LENGTH * 0.5) cut = DISCORD_MAX_LENGTH; // pas de bonne coupure trouvée
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply(chunks[i]);
    } else {
      await message.channel.send(chunks[i]);
    }
  }
}

module.exports = { sendLongReply };
