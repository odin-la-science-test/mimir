// ============================================================
// CSV + graphiques : l'IA structure les données demandées en JSON,
// génère un CSV téléchargeable et un graphique via QuickChart.io.
// ============================================================

const { AttachmentBuilder } = require("discord.js");
const { callAIGenerateContent } = require("../ai/providers");

async function handleCsvChartRequest(message, prompt) {
  const structuringPrompt =
    "Analyse cette demande et extrait ou invente des données tabulaires adaptées. " +
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, au format exact :\n" +
    '{"title": "titre court", "chartType": "bar|line|pie", "labels": ["a","b","c"], "datasetLabel": "nom de la série", "values": [1,2,3]}\n\n' +
    `Demande de l'utilisateur : ${prompt}`;

  const result = await callAIGenerateContent([{ role: "user", content: structuringPrompt }], {
    temperature: 0.3,
    maxTokens: 1024,
  });

  const cleaned = result.text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    await message.reply(
      "⚠️ Je n'ai pas réussi à structurer des données à partir de ta demande. Essaie d'être plus précis (ex : `mimir csv ventes janvier 100, février 150, mars 200`)."
    );
    return;
  }

  const { title, chartType, labels, datasetLabel, values } = parsed;

  const csvLines = [`${datasetLabel || "label"},valeur`];
  labels.forEach((label, i) => csvLines.push(`${label},${values[i]}`));
  const csvContent = csvLines.join("\n");
  const csvAttachment = new AttachmentBuilder(Buffer.from(csvContent), { name: "donnees.csv" });

  const chartConfig = {
    type: chartType && ["bar", "line", "pie"].includes(chartType) ? chartType : "bar",
    data: { labels, datasets: [{ label: datasetLabel || "Valeurs", data: values }] },
    options: { plugins: { title: { display: true, text: title || "Graphique" } } },
  };
  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=700&height=450`;

  const chartResponse = await fetch(chartUrl);
  const chartBuffer = Buffer.from(await chartResponse.arrayBuffer());
  const chartAttachment = new AttachmentBuilder(chartBuffer, { name: "graphique.png" });

  await message.reply({ content: `📊 **${title || "Résultat"}**`, files: [csvAttachment, chartAttachment] });
}

module.exports = { handleCsvChartRequest };
