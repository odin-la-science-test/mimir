// ============================================================
// Lecture de documents en pièce jointe (PDF, DOCX, TXT/MD/CSV/JSON).
// Le texte extrait sert de contexte à l'IA, comme un salon mentionné.
// Voir docs/adr/0007-lecture-de-documents.md pour la justification des
// limites de taille et le choix des bibliothèques.
// ============================================================

const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { DOCUMENT_MAX_DOWNLOAD_BYTES, DOCUMENT_MAX_EXTRACTED_CHARS } = require("../config");
const { askGemini } = require("../ai/conversation");
const { sendLongReply } = require("../discord/reply");

// Extension → format de parsing. Le type MIME Discord n'est pas toujours
// fiable (certains clients envoient "application/octet-stream" pour tout),
// l'extension du nom de fichier est donc la source de vérité principale.
const PDF_EXTENSIONS = new Set(["pdf"]);
const DOCX_EXTENSIONS = new Set(["docx"]);
const PLAIN_TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "log", "yml", "yaml"]);

function getExtension(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
}

function isSupportedDocument(attachment) {
  const ext = getExtension(attachment.name);
  return PDF_EXTENSIONS.has(ext) || DOCX_EXTENSIONS.has(ext) || PLAIN_TEXT_EXTENSIONS.has(ext);
}

/**
 * Trouve la première pièce jointe du message dont l'extension est un
 * format de document supporté (PDF, DOCX, texte).
 */
function findSupportedDocumentAttachment(message) {
  return message.attachments.find((a) => isSupportedDocument(a)) || null;
}

/**
 * Télécharge une pièce jointe et en extrait le texte. Refuse tout fichier
 * dépassant DOCUMENT_MAX_DOWNLOAD_BYTES AVANT de le télécharger (la taille
 * est connue via l'API Discord sans avoir à récupérer le contenu), pour
 * ne jamais charger un fichier arbitrairement gros en mémoire.
 */
async function extractDocumentText(attachment) {
  if (attachment.size > DOCUMENT_MAX_DOWNLOAD_BYTES) {
    throw new Error(
      `Fichier trop volumineux (${(attachment.size / 1024 / 1024).toFixed(1)} Mo, ` +
        `limite : ${DOCUMENT_MAX_DOWNLOAD_BYTES / 1024 / 1024} Mo).`
    );
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Téléchargement du document échoué (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const ext = getExtension(attachment.name);
  let text;

  if (PDF_EXTENSIONS.has(ext)) {
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } else if (DOCX_EXTENSIONS.has(ext)) {
    const parsed = await mammoth.extractRawText({ buffer });
    text = parsed.value;
  } else {
    text = buffer.toString("utf-8");
  }

  text = (text || "").trim();
  if (!text) {
    throw new Error("Aucun texte extrait (document vide, scanné en image, ou protégé).");
  }

  const truncated = text.length > DOCUMENT_MAX_EXTRACTED_CHARS;
  return {
    text: truncated ? text.slice(0, DOCUMENT_MAX_EXTRACTED_CHARS) : text,
    truncated,
  };
}

/**
 * Gère une demande "mimir [question] " avec un document PDF/DOCX/texte en
 * pièce jointe : extrait le texte, l'injecte comme contexte, répond à la
 * question (ou résume si aucune question précise n'est posée).
 */
async function handleDocumentAttachment(message, prompt, attachment) {
  await message.channel.sendTyping();

  let extracted;
  try {
    extracted = await extractDocumentText(attachment);
  } catch (err) {
    await message.reply(`⚠️ Je n'ai pas réussi à lire "${attachment.name}" : ${err.message}`);
    return;
  }

  const question = prompt.trim() || `Résume le contenu de ce document ("${attachment.name}").`;
  const extraContext = { label: `document joint "${attachment.name}"`, text: extracted.text };

  const reply = await askGemini(message.channel.id, question, extraContext);
  const suffix = extracted.truncated
    ? `\n\n*(document tronqué aux ${DOCUMENT_MAX_EXTRACTED_CHARS} premiers caractères pour rester dans les limites du prompt)*`
    : "";

  await sendLongReply(message, reply + suffix);
}

module.exports = {
  findSupportedDocumentAttachment,
  extractDocumentText,
  handleDocumentAttachment,
  isSupportedDocument,
};
