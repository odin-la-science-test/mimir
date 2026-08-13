// ============================================================
// Génération de PDF : l'IA structure le contenu demandé (titre +
// sections), puis pdfkit le met en page. Voir
// docs/adr/0008-generation-de-pdf.md.
// ============================================================

const PDFDocument = require("pdfkit");
const { AttachmentBuilder } = require("discord.js");
const { PDF_TRIGGERS } = require("../triggers");
const { callAIGenerateContent } = require("../ai/providers");

/**
 * Rend un document {title, sections: [{heading, body}]} en PDF, en
 * streamant les pages dans un buffer (pdfkit est un flux Node natif,
 * pas de fichier temporaire nécessaire).
 */
function renderPdfBuffer({ title, sections }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, info: { Title: title } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown(1.5);

    for (const section of sections) {
      if (section.heading) {
        doc.fontSize(14).font("Helvetica-Bold").text(section.heading);
        doc.moveDown(0.3);
      }
      doc.fontSize(11).font("Helvetica").text(section.body || "", { align: "left", lineGap: 4 });
      doc.moveDown(1);
    }

    doc.end();
  });
}

/**
 * Demande à l'IA de structurer le sujet en titre + sections, avec repli
 * sur un document à section unique si la sortie n'est pas du JSON valide
 * (mieux vaut un PDF simple qu'un échec total).
 */
async function structureContentForPdf(topic) {
  const structuringPrompt =
    "Structure le sujet suivant en document pour un PDF. Réponds UNIQUEMENT avec un objet JSON " +
    "valide, sans texte autour, sans balises markdown, au format exact :\n" +
    '{"title": "titre court", "sections": [{"heading": "titre de section", "body": "texte de la section, plusieurs phrases"}]}\n' +
    "Prévois 2 à 5 sections pertinentes. Le texte de chaque section doit être rédigé en prose claire, " +
    "sans markdown (pas d'astérisques, pas de dièses).\n\n" +
    `Sujet demandé : ${topic}`;

  const result = await callAIGenerateContent([{ role: "user", content: structuringPrompt }], {
    temperature: 0.5,
    maxTokens: 1500,
  });

  const cleaned = result.text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.title && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return parsed;
    }
  } catch {
    // repli ci-dessous
  }

  return { title: topic.slice(0, 80) || "Document", sections: [{ heading: null, body: result.text }] };
}

/**
 * Gère "mimir génère un pdf sur ...", "mimir crée un pdf ...", etc.
 */
async function handlePdfGenerationRequest(message, prompt) {
  let topic = prompt;
  for (const trigger of PDF_TRIGGERS) {
    topic = topic.replace(new RegExp(trigger, "i"), "");
  }
  topic = topic.trim() || "Document généré par Mimir";

  await message.channel.sendTyping();

  let structured;
  try {
    structured = await structureContentForPdf(topic);
  } catch (err) {
    await message.reply(`⚠️ Je n'ai pas réussi à préparer le contenu du PDF : ${err.message}`);
    return;
  }

  let pdfBuffer;
  try {
    pdfBuffer = await renderPdfBuffer(structured);
  } catch (err) {
    await message.reply(`⚠️ Le contenu a été généré mais la mise en page PDF a échoué : ${err.message}`);
    return;
  }

  const attachment = new AttachmentBuilder(pdfBuffer, { name: "mimir-document.pdf" });
  await message.reply({ content: `📄 **${structured.title}**`, files: [attachment] });
}

module.exports = { handlePdfGenerationRequest, renderPdfBuffer, structureContentForPdf };
