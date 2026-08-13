// ============================================================
// Génération d'images via Pollinations.ai (gratuit, sans clé API).
// ============================================================

const { AttachmentBuilder } = require("discord.js");
const { IMAGE_TRIGGERS } = require("../triggers");
const { callAIGenerateContent } = require("../ai/providers");

const IMAGE_SIZE_PRESETS = {
  carre: { width: 1024, height: 1024 },
  portrait: { width: 896, height: 1280 },
  paysage: { width: 1280, height: 896 },
  large: { width: 1344, height: 768 }, // 16:9
  etroit: { width: 768, height: 1344 }, // 9:16
};

function detectImageSize(text) {
  const lower = text.toLowerCase();
  if (lower.includes("16:9") || lower.includes("16/9")) return IMAGE_SIZE_PRESETS.large;
  if (lower.includes("9:16") || lower.includes("9/16")) return IMAGE_SIZE_PRESETS.etroit;
  if (lower.includes("portrait") || lower.includes("vertical")) return IMAGE_SIZE_PRESETS.portrait;
  if (lower.includes("paysage") || lower.includes("horizontal") || lower.includes("large")) return IMAGE_SIZE_PRESETS.paysage;
  return IMAGE_SIZE_PRESETS.carre;
}

/**
 * Réécrit la description brute en un prompt anglais détaillé (le modèle
 * d'image Flux répond mieux à des prompts anglais précis). Repli sur la
 * description d'origine en cas d'échec.
 */
async function enhanceImagePrompt(description) {
  const enhancingPrompt =
    "Tu es un expert en prompts pour générateurs d'images IA (type Flux/Midjourney). " +
    "Réécris la demande suivante en un prompt détaillé et vivant EN ANGLAIS, riche en " +
    "détails visuels concrets (composition, éclairage, style artistique, ambiance, niveau " +
    "de détail/qualité). Garde le sujet et l'intention d'origine, n'invente pas d'éléments " +
    "hors sujet. Réponds UNIQUEMENT avec le prompt final, une seule ligne, sans guillemets, " +
    "sans commentaire, maximum 70 mots.\n\n" +
    `Demande originale : ${description}`;

  try {
    const result = await callAIGenerateContent([{ role: "user", content: enhancingPrompt }], {
      temperature: 0.9,
      maxTokens: 200,
    });
    const enhanced = result.text.trim().replace(/^["']+|["']+$/g, "").replace(/\s+/g, " ");
    return enhanced || description;
  } catch (err) {
    console.warn("⚠️ Amélioration du prompt d'image échouée, utilisation du prompt brut :", err.message);
    return description;
  }
}

/**
 * Télécharge une image, avec une nouvelle tentative en cas d'échec
 * (Pollinations est gratuit mais parfois instable sous charge).
 */
async function fetchImageWithRetry(url, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Pollinations error ${response.status}`);

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        const bodyPreview = (await response.text()).slice(0, 300);
        throw new Error(`Pollinations n'a pas renvoyé une image (content-type: ${contentType || "inconnu"}) : ${bodyPreview}`);
      }
      return response;
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️ Tentative ${i + 1}/${attempts} de génération d'image échouée : ${err.message}`);
    }
  }
  throw lastErr;
}

async function handleImageRequest(message, prompt) {
  let description = prompt;
  for (const trigger of IMAGE_TRIGGERS) {
    description = description.replace(new RegExp(trigger, "i"), "");
  }
  description = description.trim() || prompt;

  const { width, height } = detectImageSize(description);

  await message.channel.sendTyping();
  const enhancedPrompt = await enhanceImagePrompt(description);

  const seed = Math.floor(Math.random() * 1_000_000);
  const encoded = encodeURIComponent(enhancedPrompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&model=flux&seed=${seed}`;

  let response;
  try {
    response = await fetchImageWithRetry(url);
  } catch (err) {
    await message.reply(`⚠️ La génération d'image a échoué après plusieurs tentatives : ${err.message}`);
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  const attachment = new AttachmentBuilder(Buffer.from(arrayBuffer), { name: "mimir-image.png" });

  await message.reply({ content: `🎨 Voici pour : *${description}*`, files: [attachment] });
}

module.exports = { handleImageRequest, detectImageSize, enhanceImagePrompt, fetchImageWithRetry };
