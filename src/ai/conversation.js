// ============================================================
// Mémoire de conversation courte par salon + appel principal à l'IA.
// La mémoire est en RAM uniquement (Map), donc perdue à chaque redémarrage
// du process — c'est un choix assumé, voir docs/adr/0006-rotation-multi-provider.md.
// ============================================================

const { callAIGenerateContent } = require("./providers");
const { MAX_HISTORY_MESSAGES } = require("../config");

const conversationHistory = new Map();

/**
 * Envoie le prompt à l'IA et retourne le texte généré. Garde un petit
 * historique par salon. Si extraContext est fourni (contexte d'un salon
 * mentionné, d'un document, ou de tout le serveur), il est injecté dans
 * le prompt final mais PAS dans l'historique persistant, pour ne pas le
 * saturer avec du contenu volumineux à chaque nouvel échange.
 */
async function askGemini(channelId, prompt, extraContext = null) {
  const history = conversationHistory.get(channelId) || [];

  let finalPrompt = prompt;
  if (extraContext) {
    finalPrompt =
      `Voici un extrait de contexte (${extraContext.label}) :\n\n---\n${extraContext.text}\n---\n\n` +
      `Question de l'utilisateur : ${prompt}`;
  }

  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.parts?.[0]?.text || "" })),
    { role: "user", content: finalPrompt },
  ];

  const result = await callAIGenerateContent(messages, {
    systemInstruction:
      "Tu es Mimir, un assistant IA sur un serveur Discord. " +
      "Réponds de façon claire, concise et utile. " +
      "Utilise le markdown Discord (gras, listes, blocs de code) quand c'est pertinent.",
    temperature: 0.8,
    maxTokens: 1024,
  });

  const text = result.text;

  history.push({ role: "user", parts: [{ text: prompt }] });
  history.push({ role: "model", parts: [{ text }] });
  while (history.length > MAX_HISTORY_MESSAGES) history.shift();
  conversationHistory.set(channelId, history);

  return text;
}

module.exports = { askGemini, conversationHistory };
