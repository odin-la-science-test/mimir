// ============================================================
// Synthèse vocale via l'API REST officielle Google Cloud Text-to-Speech.
// Provider PRIMAIRE (pas un simple secours) quand GOOGLE_TTS_API_KEY est
// configurée — voir docs/adr/0011-tts-google-cloud-si-edge-bloque.md pour
// pourquoi Microsoft Edge TTS (src/voice/tts.js) ne suffit plus seul.
// ============================================================

const { GOOGLE_TTS_API_KEY } = require("../config");

function languageCodeFromVoiceName(voiceName) {
  const match = /^([a-z]{2}-[A-Z]{2})/.exec(voiceName);
  return match ? match[1] : "fr-FR";
}

/**
 * Synthétise du texte en MP3 via l'API REST Google Cloud (authentification
 * par simple clé API en query string — pas d'OAuth/compte de service
 * nécessaire pour ce endpoint).
 */
async function synthesizeWithGoogleCloud(text, voiceName) {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: languageCodeFromVoiceName(voiceName), name: voiceName },
        audioConfig: { audioEncoding: "MP3" },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Cloud TTS error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (!data.audioContent) {
    throw new Error("Google Cloud TTS n'a renvoyé aucun audio (champ audioContent manquant).");
  }

  return Buffer.from(data.audioContent, "base64");
}

module.exports = { synthesizeWithGoogleCloud };
