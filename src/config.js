// ============================================================
// Configuration centralisée : lecture et validation des variables
// d'environnement, constantes partagées par tous les modules.
// Voir docs/adr/0001-architecture-modulaire.md pour la justification
// du découpage en modules.
// ============================================================

require("dotenv").config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const GEMINI_API_KEYS = process.env.GEMINI_API_KEY
  ? process.env.GEMINI_API_KEY.split(",").map((k) => k.trim()).filter(Boolean)
  : [];

const MISTRAL_API_KEYS = process.env.MISTRAL_API_KEY
  ? process.env.MISTRAL_API_KEY.split(",").map((k) => k.trim()).filter(Boolean)
  : [];

const GROQ_API_KEY = process.env.GROQ_API_KEY || null;

// TTS de secours via l'API REST officielle Google Cloud (clé API simple,
// pas le SDK @google-cloud/text-to-speech qui exige un compte de service
// et traîne des dépendances gRPC lourdes pour un simple appel REST/JSON).
// Voir docs/adr/0011-tts-google-cloud-si-edge-bloque.md : Microsoft Edge TTS
// est bloqué au niveau serveur depuis les IP mutualisées de certains
// hébergeurs (confirmé pour Fly.io), donc ce provider sert de PRIMAIRE
// (pas juste de secours) dès qu'une clé est configurée.
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY || null;
// fr-FR-Standard-A : le seul niveau de voix garanti disponible pour toutes
// les langues supportées depuis le lancement de l'API (contrairement aux
// voix Neural2/Wavenet, ajoutées progressivement langue par langue, dont
// on ne peut pas garantir la disponibilité sans clé API pour vérifier).
// Liste complète et voix de meilleure qualité :
// https://cloud.google.com/text-to-speech/docs/list-voices-and-types
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE || "fr-FR-Standard-A";

// ElevenLabs : provider TTS de plus haute priorité si configuré (voir
// docs/adr/0012-choix-final-tts-elevenlabs.md). Choisi après Google Cloud
// (carte bancaire requise, écartée) et Piper auto-hébergé (fork maintenu
// devenu dépendant de Python/onnxruntime, dépasserait la RAM de la
// machine Fly.io actuelle sans upgrade payant).
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || null;
// Voix par défaut documentée dans les exemples officiels ElevenLabs — à
// remplacer par un ID de la bibliothèque de voix de ton propre compte
// (dashboard ElevenLabs > Voices) si celui-ci n'est pas disponible dessus.
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2"; // gère le français

// Modèles IA. GROQ_MODEL_VOICE est volontairement différent de GROQ_MODEL :
// openai/gpt-oss-120b est utilisé pour les réponses vocales car son temps de
// réponse est plus prévisible sous charge que llama-3.3-70b sur l'API Groq,
// ce qui compte davantage à l'oral (latence perçue) qu'à l'écrit.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_MODEL_VOICE = "openai/gpt-oss-120b";
const MISTRAL_MODEL = "mistral-small-latest";

// Voix Microsoft Edge TTS. Format attendu : xx-XX-NomNeural. Un nom qui ne
// respecte pas ce format (ex. reliquat d'un ancien moteur TTS) fait planter
// la synthèse silencieusement plus tard : on le détecte ici.
const DEFAULT_TTS_VOICE = "fr-FR-HenriNeural";
const TTS_VOICE_PATTERN = /^[a-z]{2}-[A-Z]{2}-\w+Neural$/;
let ttsVoice = process.env.TTS_VOICE || DEFAULT_TTS_VOICE;
if (!TTS_VOICE_PATTERN.test(ttsVoice)) {
  console.warn(
    `⚠️ TTS_VOICE="${ttsVoice}" n'est pas un nom de voix Edge TTS valide (format attendu : ` +
      `xx-XX-NomNeural, ex: fr-FR-HenriNeural). Utilisation de la voix par défaut à la place.`
  );
  ttsVoice = DEFAULT_TTS_VOICE;
}
const TTS_VOICE = ttsVoice;

const TRIGGER_WORD = "mimir";
const DISCORD_MAX_LENGTH = 2000;

const MAX_HISTORY_MESSAGES = 10;
const CHANNEL_CONTEXT_MESSAGE_COUNT = 50;
const GLOBAL_SEARCH_MESSAGES_PER_CHANNEL = 15;
const GLOBAL_SEARCH_MAX_CHANNELS = 15;

// Audio brut fourni par Discord (voix temps réel)
const VOICE_SAMPLE_RATE = 48000;
const VOICE_CHANNELS = 2;
const MIN_AUDIO_BYTES = VOICE_SAMPLE_RATE * VOICE_CHANNELS * 2 * 0.3; // ignore les clips < 0.3s (bruit)

// Lecture de documents (PDF/DOCX/TXT en pièce jointe) — voir
// docs/adr/0007-lecture-de-documents.md pour la justification de ces limites.
const DOCUMENT_MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024; // 15 Mo avant extraction
const DOCUMENT_MAX_EXTRACTED_CHARS = 20000; // texte injecté dans le prompt IA

// Agent de codage local (Claude Code piloté à distance depuis Discord) —
// voir docs/adr/0015-pont-agent-codage-local.md. Ces deux valeurs sont
// des contrôles de sécurité, pas de simples préférences : OWNER_DISCORD_ID
// restreint qui peut déclencher une écriture de code sur la machine de
// l'opérateur, LOCAL_AGENT_TOKEN authentifie le pont WebSocket pour
// qu'un tiers ne puisse pas s'y faire passer pour l'agent local.
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID || null;
const LOCAL_AGENT_TOKEN = process.env.LOCAL_AGENT_TOKEN || null;
const hasRemoteCoding = !!(OWNER_DISCORD_ID && LOCAL_AGENT_TOKEN);

const hasGemini = GEMINI_API_KEYS.length > 0;
const hasGroq = !!GROQ_API_KEY;
const hasMistral = MISTRAL_API_KEYS.length > 0;
const hasGoogleTts = !!GOOGLE_TTS_API_KEY;
const hasElevenLabs = !!ELEVENLABS_API_KEY;

function assertRequiredConfig() {
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
}

module.exports = {
  DISCORD_TOKEN,
  GEMINI_API_KEYS,
  MISTRAL_API_KEYS,
  GROQ_API_KEY,
  GOOGLE_TTS_API_KEY,
  GOOGLE_TTS_VOICE,
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL_ID,
  GEMINI_MODEL,
  GROQ_MODEL,
  GROQ_MODEL_VOICE,
  MISTRAL_MODEL,
  TTS_VOICE,
  DEFAULT_TTS_VOICE,
  TRIGGER_WORD,
  DISCORD_MAX_LENGTH,
  MAX_HISTORY_MESSAGES,
  CHANNEL_CONTEXT_MESSAGE_COUNT,
  GLOBAL_SEARCH_MESSAGES_PER_CHANNEL,
  GLOBAL_SEARCH_MAX_CHANNELS,
  VOICE_SAMPLE_RATE,
  VOICE_CHANNELS,
  MIN_AUDIO_BYTES,
  DOCUMENT_MAX_DOWNLOAD_BYTES,
  DOCUMENT_MAX_EXTRACTED_CHARS,
  OWNER_DISCORD_ID,
  LOCAL_AGENT_TOKEN,
  hasRemoteCoding,
  hasGemini,
  hasGroq,
  hasMistral,
  hasGoogleTts,
  hasElevenLabs,
  assertRequiredConfig,
};
