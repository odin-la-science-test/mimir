// ============================================================
// ROTATION INTELLIGENTE MULTI-PROVIDERS — Gemini (n clés) → Groq → Mistral (n clés)
// Voir docs/adr/0006-rotation-multi-provider.md pour la justification.
// ============================================================

const {
  GEMINI_API_KEYS,
  MISTRAL_API_KEYS,
  GROQ_API_KEY,
  GEMINI_MODEL,
  GROQ_MODEL,
  MISTRAL_MODEL,
} = require("../config");

let currentProvider = "gemini"; // "gemini" | "groq" | "mistral"
let currentGeminiIndex = 0;
let currentMistralIndex = 0;

function getCurrentProviderConfig() {
  switch (currentProvider) {
    case "gemini":
      if (GEMINI_API_KEYS.length === 0) return null;
      return {
        provider: "gemini",
        apiKey: GEMINI_API_KEYS[currentGeminiIndex],
        model: GEMINI_MODEL,
        index: currentGeminiIndex,
        total: GEMINI_API_KEYS.length,
      };
    case "groq":
      if (!GROQ_API_KEY) return null;
      return { provider: "groq", apiKey: GROQ_API_KEY, model: GROQ_MODEL, index: 0, total: 1 };
    case "mistral":
      if (MISTRAL_API_KEYS.length === 0) return null;
      return {
        provider: "mistral",
        apiKey: MISTRAL_API_KEYS[currentMistralIndex],
        model: MISTRAL_MODEL,
        index: currentMistralIndex,
        total: MISTRAL_API_KEYS.length,
      };
    default:
      return null;
  }
}

/**
 * Passe au provider suivant en cas de quota dépassé.
 * Ordre : Gemini (rotation de clés) → Groq → Mistral (rotation de clés) → Gemini...
 * Retourne false si aucun fallback n'est disponible (boucle complète épuisée).
 */
function switchToNextProvider() {
  let attempts = 0;
  const maxAttempts = 10; // évite les boucles infinies si aucune clé n'est configurée

  while (attempts < maxAttempts) {
    attempts++;

    if (currentProvider === "gemini") {
      if (GEMINI_API_KEYS.length > 1 && currentGeminiIndex < GEMINI_API_KEYS.length - 1) {
        currentGeminiIndex++;
        console.log(`🔄 Gemini : passage à la clé ${currentGeminiIndex + 1}/${GEMINI_API_KEYS.length}`);
        return true;
      }
      if (GROQ_API_KEY) {
        currentProvider = "groq";
        console.log("🔄 Basculement : Gemini → Groq");
        return true;
      }
      if (MISTRAL_API_KEYS.length > 0) {
        currentProvider = "mistral";
        currentMistralIndex = 0;
        console.log("🔄 Basculement : Gemini → Mistral");
        return true;
      }
      return false;
    }

    if (currentProvider === "groq") {
      if (MISTRAL_API_KEYS.length > 0) {
        currentProvider = "mistral";
        currentMistralIndex = 0;
        console.log("🔄 Basculement : Groq → Mistral");
        return true;
      }
      if (GEMINI_API_KEYS.length > 0) {
        currentProvider = "gemini";
        currentGeminiIndex = 0;
        console.log("🔄 Basculement : Groq → Gemini (nouveau cycle)");
        return true;
      }
      return false;
    }

    if (currentProvider === "mistral") {
      if (MISTRAL_API_KEYS.length > 1 && currentMistralIndex < MISTRAL_API_KEYS.length - 1) {
        currentMistralIndex++;
        console.log(`🔄 Mistral : passage à la clé ${currentMistralIndex + 1}/${MISTRAL_API_KEYS.length}`);
        return true;
      }
      if (GEMINI_API_KEYS.length > 0) {
        currentProvider = "gemini";
        currentGeminiIndex = 0;
        console.log("🔄 Basculement : Mistral → Gemini (nouveau cycle)");
        return true;
      }
      if (GROQ_API_KEY) {
        currentProvider = "groq";
        console.log("🔄 Basculement : Mistral → Groq");
        return true;
      }
      return false;
    }

    // Provider inconnu : réinitialise sur le premier disponible
    if (GEMINI_API_KEYS.length > 0) {
      currentProvider = "gemini";
      currentGeminiIndex = 0;
    } else if (GROQ_API_KEY) {
      currentProvider = "groq";
    } else if (MISTRAL_API_KEYS.length > 0) {
      currentProvider = "mistral";
      currentMistralIndex = 0;
    } else {
      return false;
    }
  }

  console.error("⚠️ Rotation bloquée après trop de tentatives");
  return false;
}

function toOpenAIMessages(messages, config) {
  const mapped = messages.map((msg) => ({
    role: msg.role === "system" ? "system" : msg.role === "model" ? "assistant" : "user",
    content: msg.content || msg.parts?.[0]?.text || "",
  }));
  if (config.systemInstruction && !mapped.find((m) => m.role === "system")) {
    mapped.unshift({ role: "system", content: config.systemInstruction });
  }
  return mapped;
}

async function callGeminiAPI(messages, providerConfig, config) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${providerConfig.model}:generateContent?key=${providerConfig.apiKey}`;

  const body = {
    contents: messages.map((msg) => ({
      role: msg.role === "system" ? "user" : msg.role,
      parts: [{ text: msg.content || msg.parts?.[0]?.text || "" }],
    })),
    generationConfig: {
      temperature: config.temperature || 0.8,
      maxOutputTokens: config.maxTokens || 1024,
    },
  };
  if (config.systemInstruction) {
    body.systemInstruction = { parts: [{ text: config.systemInstruction }] };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "(réponse vide)";
  return { text, provider: "gemini" };
}

/**
 * Groq et Mistral exposent tous les deux une API compatible OpenAI
 * (/chat/completions). Un seul appelant paramétré par URL/provider évite
 * la duplication qu'auraient deux fonctions quasi identiques.
 */
async function callOpenAICompatibleAPI(providerName, url, messages, providerConfig, config) {
  const body = {
    model: providerConfig.model,
    messages: toOpenAIMessages(messages, config),
    temperature: config.temperature || 0.8,
    max_tokens: config.maxTokens || 1024,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${providerName} API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "(réponse vide)";
  return { text, provider: providerName };
}

const callGroqAPI = (messages, providerConfig, config) =>
  callOpenAICompatibleAPI("groq", "https://api.groq.com/openai/v1/chat/completions", messages, providerConfig, config);

const callMistralAPI = (messages, providerConfig, config) =>
  callOpenAICompatibleAPI("mistral", "https://api.mistral.ai/v1/chat/completions", messages, providerConfig, config);

/**
 * Appelle l'API IA actuelle (Gemini, Groq ou Mistral) avec rotation
 * automatique en cas de quota dépassé (429).
 */
async function callAIGenerateContent(messages, config = {}) {
  const maxRetries = GEMINI_API_KEYS.length + (GROQ_API_KEY ? 1 : 0) + MISTRAL_API_KEYS.length;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const providerConfig = getCurrentProviderConfig();

    if (!providerConfig) {
      throw new Error(
        "❌ Aucun provider IA disponible ! Configure au moins une clé API dans .env " +
          "(GEMINI_API_KEY, GROQ_API_KEY ou MISTRAL_API_KEY)"
      );
    }

    try {
      console.log(`🤖 Tentative ${attempt + 1}/${maxRetries} : ${providerConfig.provider} (${providerConfig.model})`);
      if (providerConfig.provider === "gemini") return await callGeminiAPI(messages, providerConfig, config);
      if (providerConfig.provider === "groq") return await callGroqAPI(messages, providerConfig, config);
      if (providerConfig.provider === "mistral") return await callMistralAPI(messages, providerConfig, config);
    } catch (error) {
      if (error.message.includes("429") || error.message.includes("quota") || error.message.includes("rate limit")) {
        console.warn(`⚠️ Quota dépassé pour ${providerConfig.provider}`);
        if (switchToNextProvider()) {
          console.log("🔄 Passage au provider suivant...");
          continue;
        }
        throw new Error(
          "❌ Tous les quotas IA sont épuisés ! " +
            `Gemini: ${GEMINI_API_KEYS.length} clé(s), ` +
            `Groq: ${GROQ_API_KEY ? "1 clé" : "non configuré"}, ` +
            `Mistral: ${MISTRAL_API_KEYS.length} clé(s). ` +
            "Attends la réinitialisation quotidienne ou ajoute plus de clés API."
        );
      }
      throw error;
    }
  }

  throw new Error("❌ Échec après toutes les tentatives de rotation");
}

module.exports = {
  getCurrentProviderConfig,
  switchToNextProvider,
  callAIGenerateContent,
  callGeminiAPI,
  callGroqAPI,
  callMistralAPI,
};
