# ADR 0008 — Génération de PDF

## Statut
Accepté.

## Contexte
Fonctionnalité demandée : que Mimir puisse produire un document PDF à
partir d'une demande en langage naturel (« mimir génère un pdf sur
l'histoire de Rome »), sur le même principe que la génération CSV/graphique
déjà existante (`src/media/chartGeneration.js`) : demander à l'IA de
structurer le contenu, puis le mettre en forme avec un outil dédié.

## Décision
`src/documents/pdfGenerator.js` en deux étapes :
1. `structureContentForPdf()` demande à l'IA de renvoyer un JSON
   `{title, sections: [{heading, body}]}` (2 à 5 sections, prose sans
   markdown puisque le rendu final n'est pas du Markdown mais du texte
   mis en page directement).
2. `renderPdfBuffer()` met en page ce contenu avec **pdfkit**
   (bibliothèque de génération PDF pure Node, sans dépendance système
   externe), en streamant directement dans un `Buffer` — aucun fichier
   temporaire sur disque.

Si le JSON renvoyé par l'IA est invalide, repli sur un document à
section unique contenant le texte brut de la réponse plutôt qu'un échec
total (même philosophie que `handleCsvChartRequest`, déjà éprouvée dans
ce projet pour la génération CSV).

## Justification
- **`pdfkit` plutôt que `puppeteer`/Chromium headless.** Générer un PDF
  via un navigateur headless (rendu HTML → PDF) donnerait une mise en
  page plus riche, mais ajouterait ~300 Mo de dépendance (binaire
  Chromium) pour une machine de déploiement à 256 Mo de RAM
  (`fly.toml`) — disproportionné pour des documents texte structurés
  simples. `pdfkit` est une dépendance pure JS de quelques Mo.
- **Réutilisation du pattern « IA structure en JSON, code met en
  forme »** déjà utilisé pour CSV/graphiques (`chartGeneration.js`) :
  cohérence de conception plutôt qu'une nouvelle approche ad hoc pour
  chaque fonctionnalité de génération de fichier.
- **Repli sur texte brut si le JSON est invalide**, pas d'échec sec :
  un PDF à une seule section reste un résultat utile pour l'utilisateur,
  la panne d'un parsing JSON ne doit pas se traduire par une absence
  totale de réponse.

## Démonstration
`renderPdfBuffer` collecte les événements `data`/`end` du flux `pdfkit`
dans un tableau de chunks puis les concatène (`Buffer.concat`) — schéma
identique à celui déjà utilisé pour la synthèse TTS
(`src/voice/tts.js`, `synthesizeOnce`), donc cohérent avec un pattern
déjà validé dans ce projet pour transformer un flux Node en buffer
exploitable par `AttachmentBuilder` de discord.js. `structureContentForPdf`
utilisant `JSON.parse` dans un `try/catch` explicite avec repli documenté
garantit qu'aucune sortie IA malformée ne peut faire remonter une
exception non gérée jusqu'au routeur.

## Conséquences
- La mise en page reste simple (titre + sections de texte, pas de
  tableaux, images ou mise en forme riche) — suffisant pour le cas
  d'usage (notes, résumés, rapports texte), pas pour des documents
  visuellement complexes.
- Le contenu du PDF dépend entièrement de la qualité de la réponse IA :
  comme pour la génération d'images ou de graphiques déjà présentes dans
  ce projet, une demande vague produit un contenu générique.

## 🔒 Clause inviolable
Ne jamais introduire de dépendance à un navigateur headless
(Puppeteer/Playwright) pour cette fonctionnalité sans revoir explicitement
le budget mémoire de la machine de déploiement (`fly.toml [[vm]] memory`) —
un tel changement ferait exploser l'empreinte mémoire du process sur une
machine actuellement dimensionnée à 256 Mo.
