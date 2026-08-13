# ADR 0001 — Découpage du monolithe en modules

## Statut
Accepté — inviolable pour la structure de haut niveau (`src/<domaine>/`).

## Contexte
Le bot tenait entièrement dans `index.js` (2002 lignes) : rotation IA,
modération, génération d'images/CSV, traduction, vocal temps réel, TTS,
messages vocaux natifs — tout au même niveau, routé par une longue chaîne
`if/else`. L'ajout demandé de deux fonctionnalités substantielles
(lecture de documents, génération de PDF) aurait porté ce fichier à
~2600-2800 lignes, rendant les diffs et la relecture de plus en plus
pénibles, et augmentant le risque qu'une modification dans un domaine
(ex. TTS) casse silencieusement un autre domaine sans lien logique
(ex. modération) simplement parce qu'ils partagent le même fichier.

## Décision
Découper en modules par domaine fonctionnel sous `src/` :

```
src/
  config.js              configuration & validation d'environnement
  triggers.js             mots déclencheurs + logique de correspondance
  ai/providers.js         rotation Gemini/Groq/Mistral
  ai/conversation.js      mémoire courte + appel IA principal
  voice/tts.js             synthèse vocale (Edge TTS)
  voice/stt.js             transcription (Groq Whisper) + réponse orale
  voice/session.js         vocal temps réel (join/listen/leave)
  voice/nativeMessage.js   messages vocaux Discord natifs
  documents/reader.js      lecture PDF/DOCX/texte
  documents/pdfGenerator.js génération de PDF
  channels/contextReader.js lecture de salons (mention/nom/serveur entier)
  moderation/commands.js   ban/kick/timeout
  media/imageGeneration.js génération d'images
  media/chartGeneration.js  CSV + graphiques
  discord/router.js        dispatch des messages entrants
  discord/translation.js   traduction par réaction emoji
  discord/reply.js         découpage des réponses > 2000 caractères
  server/healthServer.js   health-check HTTP
```

`index.js` ne fait plus qu'amorcer : charger la config, créer le client
Discord, brancher le routeur et le serveur de santé, se connecter.

## Justification
- **Alternative rejetée : garder un seul fichier.** Chaque nouvelle
  fonctionnalité (documents, PDF) aurait continué d'allonger un fichier
  déjà difficile à parcourir, sans bénéfice — ce n'est pas une
  abstraction gratuite, c'est une réaction directe à la taille réelle et
  croissante du fichier.
- **Alternative rejetée : découpage par type technique** (`handlers/`,
  `utils/`, `services/`). Le découpage par **domaine métier**
  (`voice/`, `documents/`, `moderation/`) regroupe ce qui change
  ensemble : une modification du protocole de message vocal natif ne
  touche que `voice/nativeMessage.js`, jamais `moderation/`.
- Chaque module a une seule responsabilité et une frontière claire avec
  ses dépendances explicites (`require`), ce qui rend testable et
  remplaçable chaque brique indépendamment (ex. remplacer Edge TTS par
  un autre moteur ne toucherait que `voice/tts.js`).

## Démonstration
`src/voice/nativeMessage.js` (messages vocaux natifs, protocole REST) ne
dépend d'aucune primitive de `src/voice/session.js` (vocal temps réel,
UDP) sauf `maybeSpeakReply` pour le cas où le bot est déjà en vocal — la
dépendance est unidirectionnelle et explicite en tête de fichier, sans
cycle. `node -e "require('./index.js')"` (avec un `.env` valide) charge
l'arbre de modules sans erreur de résolution circulaire, preuve que le
graphe de dépendances est un DAG.

## Conséquences
- Plus de fichiers à naviguer pour comprendre le système dans son
  ensemble (compensé par ce dossier `docs/adr/` et le README).
- Chaque module doit exporter une interface explicite (`module.exports`)
  plutôt que de compter sur des variables globales partagées — c'est
  voulu, ça rend les dépendances visibles.

## 🔒 Clause inviolable
Un domaine fonctionnel (vocal, documents, modération, salons, médias) ne
doit **jamais** être re-fusionné dans `index.js` ou dans un autre domaine
« pour aller vite ». Si un besoin de partage de code apparaît entre deux
domaines, créer une dépendance explicite entre modules (comme
`nativeMessage.js → session.js`) plutôt que de dupliquer ou de fusionner.
