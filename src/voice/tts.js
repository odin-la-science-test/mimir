// ============================================================
// Synthèse vocale (TTS) via Microsoft Edge TTS — gratuit, sans clé API.
// Voir docs/adr/0005-politique-timeout-tts.md pour la justification du
// timeout et du retry (un revert précédent les avait supprimés, ce qui
// pouvait bloquer indéfiniment une réponse vocale).
// ============================================================

const crypto = require("crypto");
// msedge-tts s'appuie sur l'API Web Crypto (SubtleCrypto / getRandomValues),
// absente par défaut de certains runtimes Node. `crypto.webcrypto` est le
// polyfill correct (le module Node "crypto" seul n'expose pas la même
// forme d'API — assigner l'objet require("crypto") entier, comme le
// faisait un patch précédent, laisse `.subtle`/`.getRandomValues` absents).
if (typeof global.crypto === "undefined") {
  global.crypto = crypto.webcrypto;
}

const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const { Readable } = require("stream");
const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} = require("@discordjs/voice");
const {
  TTS_VOICE,
  GOOGLE_TTS_VOICE,
  hasGoogleTts,
  ELEVENLABS_VOICE_ID,
  hasElevenLabs,
} = require("../config");
const { synthesizeWithGoogleCloud } = require("./googleTts");
const { synthesizeWithElevenLabs } = require("./elevenLabsTts");

const SYNTHESIS_TIMEOUT_MS = 20_000;
const PLAYBACK_TIMEOUT_MS = 20_000;
const MAX_SYNTHESIS_ATTEMPTS = 2;

/**
 * Retire le markdown Discord (gras, italique, code, liens, titres...) d'un
 * texte pour que la synthèse vocale ne lise pas les symboles à voix haute.
 */
function stripMarkdownForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, " (extrait de code) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "un lien")
    .replace(/[*_~#>]/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Une seule tentative de synthèse, bornée dans le temps. Rejette si aucune
 * donnée n'arrive avant SYNTHESIS_TIMEOUT_MS (le websocket msedge-tts peut
 * rester ouvert sans jamais émettre en cas de souci réseau côté hébergeur).
 */
function synthesizeOnce(text, voiceName) {
  return new Promise((resolve, reject) => {
    const tts = new MsEdgeTTS();
    let settled = false;
    const chunks = [];

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      tts.close();
      reject(new Error(`Timeout de synthèse TTS (${SYNTHESIS_TIMEOUT_MS / 1000}s)`));
    }, SYNTHESIS_TIMEOUT_MS);

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tts.close();
      if (err && chunks.length === 0) {
        reject(err);
      } else {
        // Un flux qui s'est arrêté après avoir produit des données reste
        // exploitable (mieux vaut un audio légèrement tronqué qu'un échec
        // total) : on résout avec ce qu'on a.
        resolve(Buffer.concat(chunks));
      }
    };

    tts
      .setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      .then(() => {
        const { audioStream } = tts.toStream(text);
        audioStream.on("data", (chunk) => chunks.push(chunk));
        audioStream.on("end", () => finish(null));
        audioStream.on("error", (err) => finish(err));
      })
      .catch((err) => finish(err));
  });
}

/**
 * Synthétise du texte en audio (mp3) via Microsoft Edge TTS, avec un
 * retry unique si la première tentative échoue ou ne produit rien
 * d'exploitable — l'API msedge-tts est gratuite mais son WebSocket sous-
 * jacent est parfois instable, voire bloqué par Microsoft depuis certains
 * hébergeurs (voir docs/adr/0011-tts-google-cloud-si-edge-bloque.md).
 */
async function synthesizeWithEdgeTts(text, voiceName) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_SYNTHESIS_ATTEMPTS; attempt++) {
    try {
      const buffer = await synthesizeOnce(text, voiceName);
      if (buffer.length >= 500) return buffer;
      lastErr = new Error(
        `Réponse TTS vide ou trop courte (${buffer.length} octets) — vérifie que TTS_VOICE ` +
          "est un nom de voix Edge valide, ex: fr-FR-HenriNeural."
      );
    } catch (err) {
      lastErr = err;
    }
    if (attempt < MAX_SYNTHESIS_ATTEMPTS) {
      console.warn(`⚠️ Tentative ${attempt}/${MAX_SYNTHESIS_ATTEMPTS} de synthèse TTS échouée : ${lastErr.message}`);
    }
  }
  throw lastErr;
}

/**
 * Point d'entrée unique de synthèse vocale. Le provider est choisi UNE
 * FOIS par configuration présente, jamais par essai-échec successif
 * (voir ADR 0011/0012) :
 *   1. ElevenLabs, si ELEVENLABS_API_KEY est configurée (priorité la
 *      plus haute — c'est le choix retenu au terme de la comparaison
 *      documentée dans l'ADR 0012).
 *   2. Google Cloud TTS, si GOOGLE_TTS_API_KEY est configurée (gardé en
 *      option pour qui accepte d'y associer une carte bancaire).
 *   3. Microsoft Edge TTS (gratuit, sans clé), sinon — fonctionne pour
 *      qui n'est pas hébergé sur une IP bloquée par Microsoft (ADR 0011).
 */
async function synthesizeSpeechBuffer(text, voiceName = TTS_VOICE) {
  if (hasElevenLabs) {
    return synthesizeWithElevenLabs(text, ELEVENLABS_VOICE_ID);
  }
  if (hasGoogleTts) {
    return synthesizeWithGoogleCloud(text, GOOGLE_TTS_VOICE);
  }
  return synthesizeWithEdgeTts(text, voiceName);
}

/**
 * Synthétise du texte et le joue dans le salon vocal connecté.
 */
async function speakInVoiceChannel(connection, text) {
  const truncated = text.slice(0, 500); // limite raisonnable pour la synthèse

  const mp3Buffer = await synthesizeSpeechBuffer(truncated, TTS_VOICE);
  console.log(`🗣️ TTS (Edge) reçu : ${mp3Buffer.length} octets`);

  const player = createAudioPlayer();
  const audioStream = Readable.from(mp3Buffer);
  const resource = createAudioResource(audioStream, { inputType: StreamType.Arbitrary });

  player.on("stateChange", (oldState, newState) => {
    console.log(`🔊 AudioPlayer: ${oldState.status} → ${newState.status}`);
  });

  const subscription = connection.subscribe(player);
  if (!subscription) {
    throw new Error("connection.subscribe(player) a échoué (la connexion vocale n'est peut-être plus active).");
  }
  player.play(resource);

  await new Promise((resolve, reject) => {
    let becamePlaying = false;
    const timer = setTimeout(() => reject(new Error(`Timeout lecture audio (${PLAYBACK_TIMEOUT_MS / 1000}s)`)), PLAYBACK_TIMEOUT_MS);

    player.on(AudioPlayerStatus.Playing, () => {
      becamePlaying = true;
    });
    player.on(AudioPlayerStatus.Idle, () => {
      clearTimeout(timer);
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
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = { synthesizeSpeechBuffer, speakInVoiceChannel, stripMarkdownForSpeech };
