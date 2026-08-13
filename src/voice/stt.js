// ============================================================
// Transcription audio (Speech-to-Text) via l'API Whisper de Groq —
// gratuite, sans carte bancaire. Accepte wav, ogg, mp3, m4a, webm...
// ============================================================

const { GROQ_API_KEY, GROQ_MODEL_VOICE } = require("../config");

async function transcribeAudio(audioBuffer, filename = "audio.wav", contentType = "audio/wav") {
  const audioBlob = new Blob([audioBuffer], { type: contentType });

  const form = new FormData();
  form.append("file", audioBlob, filename);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "fr");
  // Indice de vocabulaire : Whisper transcrit parfois "Mimir" en "Amir"
  // (perte du son "M" initial) sans ce contexte — un prompt qui contient
  // le mot déclencheur améliore nettement sa reconnaissance.
  form.append("prompt", "Conversation avec l'assistant vocal Mimir.");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq transcription error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.text;
}

/**
 * Version courte/orale de la réponse IA, via Groq (rapide) plutôt que la
 * rotation multi-provider complète : pas de markdown, réponses brèves,
 * adaptées à être lues à voix haute. Voir docs/config.js pour la
 * justification du modèle GROQ_MODEL_VOICE (distinct du modèle texte).
 */
async function askGroqForVoice(prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL_VOICE,
      messages: [
        {
          role: "system",
          content:
            "Tu es Mimir, un assistant vocal qui répond en français. Réponds en 2-3 phrases " +
            "MAXIMUM, à l'oral, sans markdown, sans listes à puces, sans astérisques.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "Je n'ai pas de réponse.";
}

module.exports = { transcribeAudio, askGroqForVoice };
