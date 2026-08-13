// ============================================================
// Session vocale temps réel : rejoindre/quitter un salon vocal, écouter
// les participants, transcrire et répondre.
//
// ⚠️ Contrainte d'hébergement documentée dans
// docs/adr/0003-contrainte-hebergement-vocal-temps-reel.md : les
// connexions vocales Discord nécessitent un flux UDP soutenu que
// certaines plateformes (Fly.io notamment) routent mal. Ce module fait
// tout ce qui est possible côté code (timeout généreux, nettoyage
// systématique de la connexion), mais ne peut pas contourner une
// limitation réseau de l'hébergeur.
// ============================================================

const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  EndBehaviorType,
} = require("@discordjs/voice");
const prism = require("prism-media");

const { GROQ_API_KEY, VOICE_SAMPLE_RATE, VOICE_CHANNELS, MIN_AUDIO_BYTES, TRIGGER_WORD } = require("../config");
const { LEAVE_VOICE_TRIGGERS } = require("../triggers");
const { speakInVoiceChannel, stripMarkdownForSpeech } = require("./tts");
const { transcribeAudio, askGroqForVoice } = require("./stt");

const VOICE_CONNECT_TIMEOUT_MS = 60_000;

// Connexions vocales actives par serveur (guildId -> { connection, textChannel })
const activeVoiceSessions = new Map();

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

/**
 * Si le bot est déjà connecté à un salon vocal sur ce serveur, lit la
 * réponse à voix haute en plus du message texte. La voix est un bonus :
 * si elle échoue, le texte reste la réponse principale (déjà envoyée).
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
  opusStream.on("error", (err) => console.error(`Erreur flux audio brut (utilisateur ${userId}):`, err));

  const decoder = new prism.opus.Decoder({ rate: VOICE_SAMPLE_RATE, channels: VOICE_CHANNELS, frameSize: 960 });
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
  if (pcmBuffer.length < MIN_AUDIO_BYTES) {
    console.log(`↳ Clip ignoré : trop court (${pcmBuffer.length} octets, probablement du bruit).`);
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

    if (LEAVE_VOICE_TRIGGERS.some((t) => lowerTranscript.includes(t))) {
      await speakInVoiceChannel(connection, "D'accord, à bientôt !");
      await leaveVoice(guildId, "👋 Quelqu'un m'a demandé de partir à l'oral.");
      return;
    }

    if (!lowerTranscript.startsWith(TRIGGER_WORD)) {
      console.log(`↳ Ignoré : ne commence pas par "${TRIGGER_WORD}" (donc pas adressé à Mimir).`);
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
        await session.textChannel.send(`⚠️ Je t'ai entendu mais l'appel à l'IA a échoué : ${err.message}`);
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
      await session.textChannel.send(`⚠️ Erreur pendant la transcription/écoute vocale : ${err.message}`);
    }
  }
}

/**
 * Rejoint le salon vocal de l'utilisateur qui a envoyé la commande,
 * annonce (texte + voix) qu'il enregistre/transcrit, puis se met à
 * écouter chaque participant.
 *
 * La connexion est systématiquement détruite si une étape échoue AVANT
 * d'être enregistrée dans activeVoiceSessions — sans quoi une erreur en
 * cours de route laisserait une connexion vocale fantôme (fuite).
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

  await message.channel.send(
    `🎙️ **Mimir rejoint #${voiceChannel.name}** — je transcris cette conversation ` +
      'pour pouvoir répondre à mes commandes vocales (déclenchées en disant **"mimir"**). ' +
      'Dites **"stop mimir"** ou tapez `mimir quitte le vocal` pour que je parte à tout moment.'
  );

  console.log(`🔌 Tentative de connexion au vocal #${voiceChannel.name} (${voiceChannel.id})`);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  // Diagnostic minimal : voir docs/adr/0013 — le code de fermeture WS
  // exact (4006, 4014, 4017...) n'est pas exposé par le canal "debug"
  // standard, donc on l'intercepte directement sur l'objet networking.
  // ⚠️ Ne JAMAIS JSON.stringify l'objet `state` du networking (contient
  // des sockets/timers avec des références circulaires — une tentative
  // précédente a fait planter tout le process avec une exception non
  // interceptée en dehors de ce try/catch, tuant la connexion vocale ET
  // le bot entier).
  let trackedNetworking = null;
  connection.on("stateChange", (oldState, newState) => {
    if (newState.networking && newState.networking !== trackedNetworking) {
      trackedNetworking = newState.networking;
      trackedNetworking.once("close", (code) =>
        console.log(`[voice networking close] code Discord = ${code}`)
      );
    }
    console.log(`[voice state] ${oldState.status} → ${newState.status}`);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, VOICE_CONNECT_TIMEOUT_MS);
    console.log("✅ Connexion vocale établie !");
  } catch (err) {
    console.error("❌ Timeout de connexion vocale:", err, "État actuel:", connection.state.status);
    connection.destroy();
    await message.reply(
      `⚠️ Impossible de rejoindre le vocal (timeout après ${VOICE_CONNECT_TIMEOUT_MS / 1000}s). ` +
        `État: ${connection.state.status}. Vérifie les logs du bot pour le code de fermeture exact ` +
        "(voir `docs/adr/0013-cause-reelle-echec-vocal-dave.md` pour un diagnostic connu : le code " +
        "4017 signifie que le protocole DAVE requis par Discord n'est pas supporté par la version " +
        "installée de `@discordjs/voice`). Les messages vocaux natifs (`mimir message vocal ...`) " +
        "restent utilisables entre-temps."
    );
    return;
  }

  activeVoiceSessions.set(message.guild.id, { connection, textChannel: message.channel });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    activeVoiceSessions.delete(message.guild.id);
  });

  connection.receiver.speaking.on("start", (userId) => {
    handleUserSpeaking(connection, message.guild.id, userId).catch((err) =>
      console.error("Erreur écoute utilisateur:", err)
    );
  });

  try {
    await speakInVoiceChannel(connection, "Bonjour, j'ai rejoint ce salon et je transcris la conversation.");
  } catch (err) {
    console.error("Erreur annonce vocale:", err);
    await message.channel.send(
      `⚠️ J'ai rejoint le vocal mais je n'ai pas réussi à parler (${err.message}). ` +
        "La transcription et les réponses texte continuent de fonctionner."
    );
  }
}

module.exports = {
  activeVoiceSessions,
  joinVoiceAndListen,
  leaveVoice,
  handleUserSpeaking,
  maybeSpeakReply,
};
