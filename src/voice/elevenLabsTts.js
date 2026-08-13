// ============================================================
// Synthèse vocale via l'API REST ElevenLabs — provider TTS de plus haute
// priorité si configuré. Voir docs/adr/0012-choix-final-tts-elevenlabs.md
// pour le cheminement complet (Edge bloqué sur Fly.io → Google Cloud
// écarté pour la carte bancaire requise → Piper écarté pour son coût en
// RAM → ElevenLabs retenu).
// ============================================================

const { ELEVENLABS_API_KEY, ELEVENLABS_MODEL_ID } = require("../config");

/**
 * Synthétise du texte en MP3 via ElevenLabs. Contrairement à Google Cloud
 * TTS (JSON + audio en base64), cette API renvoie directement les octets
 * audio bruts dans le corps de la réponse.
 */
async function synthesizeWithElevenLabs(text, voiceId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL_ID,
      output_format: "mp3_44100_128",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error("ElevenLabs n'a renvoyé aucun audio.");
  }
  return buffer;
}

module.exports = { synthesizeWithElevenLabs };
