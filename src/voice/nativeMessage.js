// ============================================================
// Messages vocaux Discord NATIFS (la bulle audio avec forme d'onde),
// distincts de la voix temps réel : upload REST en 3 étapes, aucune
// connexion UDP requise. Voir
// docs/adr/0004-protocole-messages-vocaux-natifs.md.
// ============================================================

const { spawn } = require("child_process");
const { DISCORD_TOKEN, GROQ_API_KEY, TTS_VOICE } = require("../config");
const { VOICE_MESSAGE_TRIGGERS } = require("../triggers");
const { synthesizeSpeechBuffer, stripMarkdownForSpeech } = require("./tts");
const { askGemini } = require("../ai/conversation");
const { callAIGenerateContent } = require("../ai/providers");
const { sendLongReply } = require("../discord/reply");
const { maybeSpeakReply } = require("./session");

const FFMPEG_TIMEOUT_MS = 15_000;

/**
 * Lance ffmpeg en lui passant un buffer sur stdin et récupère sa sortie
 * sur stdout (aucun fichier temporaire nécessaire).
 */
function runFfmpeg(args, inputBuffer) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.env.FFMPEG_PATH, args);
    const outChunks = [];
    let stderrData = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      reject(new Error(`ffmpeg n'a pas terminé en ${FFMPEG_TIMEOUT_MS / 1000}s (processus tué)`));
    }, FFMPEG_TIMEOUT_MS);

    proc.stdout.on("data", (d) => outChunks.push(d));
    proc.stderr.on("data", (d) => (stderrData += d.toString()));
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
 * requis par Discord pour un message vocal natif.
 */
async function convertToOggOpus(inputBuffer) {
  const { buffer, stderr } = await runFfmpeg(
    ["-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1"],
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
 * Construit une forme d'onde factice pour l'attachement (Discord ne
 * vérifie pas la cohérence avec l'audio réel, c'est purement visuel).
 */
function buildSyntheticWaveform() {
  const sampleCount = 256;
  const bytes = Buffer.alloc(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const envelope = Math.sin(t * Math.PI);
    const noise = Math.random() * 0.3;
    bytes[i] = Math.min(255, Math.max(0, Math.round((envelope * 0.7 + noise) * 255)));
  }
  return bytes.toString("base64");
}

/**
 * Envoie un message vocal Discord natif via l'API REST en 3 étapes :
 * URL d'upload → upload du fichier → message avec flags: 8192
 * (IS_VOICE_MESSAGE — pas de constante dans discord.js pour cette valeur,
 * d'où le nombre en dur documenté).
 *
 * ⚠️ Le PUT d'upload n'envoie PAS de header Authorization : l'upload_url
 * est une URL pré-signée, et lui ajouter un header d'auth Discord provoque
 * une erreur de signature. Confirmé empiriquement en production — voir
 * docs/adr/0004-protocole-messages-vocaux-natifs.md.
 */
async function sendNativeVoiceMessage(channelId, replyToMessageId, oggBuffer, durationSecs, waveformBase64) {
  const filename = "voice-message.ogg";

  const attachmentResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${DISCORD_TOKEN}` },
    body: JSON.stringify({ files: [{ filename, file_size: oggBuffer.length, id: "2" }] }),
  });
  if (!attachmentResponse.ok) {
    throw new Error(`Discord attachment request error: ${attachmentResponse.status} - ${await attachmentResponse.text()}`);
  }
  const attachmentData = await attachmentResponse.json();
  const uploadUrl = attachmentData.attachments[0].upload_url;
  const uploadedFilename = attachmentData.attachments[0].upload_filename;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/ogg" },
    body: oggBuffer,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Discord file upload error: ${uploadResponse.status} - ${await uploadResponse.text()}`);
  }

  const messagePayload = {
    flags: 8192, // IS_VOICE_MESSAGE
    attachments: [
      { id: "0", filename, uploaded_filename: uploadedFilename, duration_secs: durationSecs, waveform: waveformBase64 },
    ],
  };
  if (replyToMessageId) {
    messagePayload.message_reference = { message_id: replyToMessageId, fail_if_not_exists: false };
  }

  const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${DISCORD_TOKEN}` },
    body: JSON.stringify(messagePayload),
  });
  if (!messageResponse.ok) {
    throw new Error(`Discord message send error: ${messageResponse.status} - ${await messageResponse.text()}`);
  }

  return messageResponse.json();
}

/**
 * Gère un message vocal Discord reçu dans le chat (la bulle audio d'un
 * utilisateur) : transcrit avec Groq Whisper, répond en texte (et en
 * vocal si le bot est déjà connecté à un salon vocal).
 */
async function handleVoiceMessage(message, voiceAttachment) {
  console.log(`🎤 Message vocal reçu de ${message.author.tag}: ${voiceAttachment.url}`);

  if (!GROQ_API_KEY) {
    await message.reply(
      "⚠️ Je ne peux pas transcrire les messages vocaux sans `GROQ_API_KEY`. " +
        "Ajoute une clé gratuite depuis https://console.groq.com"
    );
    return;
  }

  await message.channel.sendTyping();

  try {
    const response = await fetch(voiceAttachment.url);
    if (!response.ok) throw new Error(`Téléchargement échoué: ${response.status}`);

    const audioBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });

    const formData = new FormData();
    formData.append("file", audioBlob, "voice.ogg");
    formData.append("model", "whisper-large-v3");
    formData.append("language", "fr");
    formData.append("response_format", "json");

    const transcriptionResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData,
    });
    if (!transcriptionResponse.ok) {
      throw new Error(`Groq Whisper error ${transcriptionResponse.status}: ${await transcriptionResponse.text()}`);
    }

    const transcription = await transcriptionResponse.json();
    const transcribedText = transcription.text?.trim();
    if (!transcribedText) {
      await message.reply("⚠️ Je n'ai pas réussi à comprendre ton message vocal (transcription vide).");
      return;
    }

    console.log(`📝 Transcription: "${transcribedText}"`);
    await message.channel.sendTyping();

    const answerText = await callAIGenerateContent([{ role: "user", content: transcribedText }]);
    await sendLongReply(message, answerText.text);
    await maybeSpeakReply(message.guild.id, answerText.text);
  } catch (err) {
    console.error("Erreur traitement message vocal:", err);
    await message.reply(`⚠️ Je n'ai pas réussi à traiter ton message vocal : ${err.message}`);
  }
}

/**
 * Génère une réponse IA puis l'envoie comme un vrai message vocal Discord
 * natif. Ex : "mimir message vocal explique-moi la mitose".
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
    await sendLongReply(message, answerText);
    await message.channel.send(
      `⚠️ Je n'ai pas réussi à générer le message vocal natif (${err.message}), voici la réponse en texte à la place.`
    );
  }
}

module.exports = {
  sendNativeVoiceMessage,
  handleVoiceMessage,
  handleVoiceMessageReply,
  convertToOggOpus,
  buildSyntheticWaveform,
};
