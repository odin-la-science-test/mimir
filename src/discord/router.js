// ============================================================
// Routeur de messages : reconnaît le mot déclencheur "mimir", puis
// dispatche vers le bon handler en testant des listes de mots-clés dans
// un ORDRE PRÉCIS (les commandes "un-*" doivent être testées avant leur
// contrepartie positive, ex: "unban" avant "ban", car elles la
// contiennent comme sous-chaîne).
// ============================================================

const { TRIGGER_WORD } = require("../config");
const {
  isJoinVoiceTrigger,
  LEAVE_VOICE_TRIGGERS,
  VOICE_MESSAGE_TRIGGERS,
  PDF_TRIGGERS,
  CHANNEL_READ_TRIGGERS,
  IMAGE_TRIGGERS,
  CSV_TRIGGERS,
  GLOBAL_SEARCH_TRIGGERS,
  UNBAN_TRIGGERS,
  BAN_TRIGGERS,
  KICK_TRIGGERS,
  UNTIMEOUT_TRIGGERS,
  TIMEOUT_TRIGGERS,
  includesAny,
} = require("../triggers");

const { joinVoiceAndListen, leaveVoice, maybeSpeakReply } = require("../voice/session");
const { handleVoiceMessage, handleVoiceMessageReply } = require("../voice/nativeMessage");
const { handlePdfGenerationRequest } = require("../documents/pdfGenerator");
const { findSupportedDocumentAttachment, handleDocumentAttachment } = require("../documents/reader");
const {
  getMentionedChannelContext,
  getGlobalServerContext,
  handleChannelReadRequest,
} = require("../channels/contextReader");
const {
  handleBanCommand,
  handleUnbanCommand,
  handleKickCommand,
  handleTimeoutCommand,
  handleUntimeoutCommand,
} = require("../moderation/commands");
const { handleImageRequest } = require("../media/imageGeneration");
const { handleCsvChartRequest } = require("../media/chartGeneration");
const { askGemini } = require("../ai/conversation");
const { sendLongReply } = require("./reply");
const { isCodeCommand, handleRemoteCodingRequest } = require("../agent/remoteCoding");

function registerMessageRouter(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Message vocal Discord natif reçu (la bulle audio) : traité sans
    // avoir besoin du mot "mimir", c'est un geste explicite de l'utilisateur.
    const voiceAttachment = message.attachments.find((a) => a.duration !== undefined && a.duration !== null);
    if (voiceAttachment) {
      await handleVoiceMessage(message, voiceAttachment);
      return;
    }

    const content = message.content.trim();
    const lower = content.toLowerCase();
    if (!lower.startsWith(TRIGGER_WORD)) return;

    let prompt = content.slice(TRIGGER_WORD.length).trim();
    if (!prompt) {
      prompt = "Salue l'utilisateur brièvement et demande ce qu'il veut savoir.";
    }

    await message.channel.sendTyping();

    try {
      const lowerPrompt = prompt.toLowerCase();

      if (isCodeCommand(lowerPrompt)) {
        await handleRemoteCodingRequest(message, prompt);
        return;
      }
      if (isJoinVoiceTrigger(lowerPrompt)) {
        await joinVoiceAndListen(message);
        return;
      }
      if (includesAny(lowerPrompt, LEAVE_VOICE_TRIGGERS)) {
        await leaveVoice(message.guild.id, "👋 D'accord, je quitte le vocal.");
        return;
      }
      if (includesAny(lowerPrompt, VOICE_MESSAGE_TRIGGERS)) {
        await handleVoiceMessageReply(message, prompt);
        return;
      }
      if (includesAny(lowerPrompt, PDF_TRIGGERS)) {
        await handlePdfGenerationRequest(message, prompt);
        return;
      }
      if (includesAny(lowerPrompt, UNBAN_TRIGGERS)) {
        await handleUnbanCommand(message, prompt);
        return;
      }
      if (includesAny(lowerPrompt, BAN_TRIGGERS)) {
        await handleBanCommand(message, prompt);
        return;
      }
      if (includesAny(lowerPrompt, KICK_TRIGGERS)) {
        await handleKickCommand(message, prompt);
        return;
      }
      if (includesAny(lowerPrompt, UNTIMEOUT_TRIGGERS)) {
        await handleUntimeoutCommand(message);
        return;
      }
      if (includesAny(lowerPrompt, TIMEOUT_TRIGGERS)) {
        await handleTimeoutCommand(message, prompt);
        return;
      }
      if (includesAny(lowerPrompt, IMAGE_TRIGGERS)) {
        await handleImageRequest(message, prompt);
        return;
      }
      if (includesAny(lowerPrompt, CSV_TRIGGERS)) {
        await handleCsvChartRequest(message, prompt);
        return;
      }

      // Document en pièce jointe (PDF/DOCX/texte) : prioritaire sur la
      // lecture de salon, l'intention porte presque toujours sur le
      // document quand un fichier est joint à la demande.
      const documentAttachment = findSupportedDocumentAttachment(message);
      if (documentAttachment) {
        await handleDocumentAttachment(message, prompt, documentAttachment);
        return;
      }

      if (includesAny(lowerPrompt, CHANNEL_READ_TRIGGERS)) {
        await handleChannelReadRequest(message, prompt);
        return;
      }

      // Question générale : contexte d'un salon mentionné (#salon, vraie
      // mention ou nom tapé en clair), contexte global si "tout le
      // serveur" est demandé, sinon aucun contexte additionnel.
      let context = await getMentionedChannelContext(message);
      if (!context && includesAny(lowerPrompt, GLOBAL_SEARCH_TRIGGERS)) {
        context = await getGlobalServerContext(message.guild);
      }

      const reply = await askGemini(message.channel.id, prompt, context);
      await sendLongReply(message, reply);
      await maybeSpeakReply(message.guild.id, reply);
    } catch (err) {
      console.error("Erreur Mimir:", err);
      await message.reply("⚠️ Désolé, je n'ai pas réussi à traiter ta demande (voir logs du bot).");
    }
  });
}

module.exports = { registerMessageRouter };
