// ============================================================
// Traducteur "au pair" : réagir à un message avec un emoji drapeau
// déclenche une traduction dans la langue correspondante.
// ============================================================

const { FLAG_LANGUAGE_MAP } = require("../triggers");
const { callAIGenerateContent } = require("../ai/providers");

function registerTranslationHandler(client) {
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
      const translationPrompt = `Traduis le texte suivant en ${targetLanguage}. Réponds UNIQUEMENT avec la traduction, sans commentaire ni guillemets :\n\n${originalText}`;

      const result = await callAIGenerateContent([{ role: "user", content: translationPrompt }], {
        temperature: 0.3,
        maxTokens: 512,
      });

      await reaction.message.reply(`🌐 **Traduction (${targetLanguage}) :**\n${result.text || "(traduction vide)"}`);
    } catch (err) {
      console.error("Erreur traduction:", err);
    }
  });
}

module.exports = { registerTranslationHandler };
