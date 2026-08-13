# ADR 0007 — Lecture de documents (PDF/DOCX/texte)

## Statut
Accepté — inviolable sur les limites de taille (sécurité).

## Contexte
Fonctionnalité demandée : que Mimir puisse lire un document joint à un
message (PDF, DOCX, TXT/MD/CSV/JSON...) et répondre à des questions à
son sujet, sur le même principe que la lecture d'un salon (ADR 0009) —
le contenu extrait sert de contexte injecté dans le prompt envoyé à
l'IA. Deux risques structurels à traiter dès la conception : (1) un
fichier arbitrairement gros pourrait épuiser la mémoire du process avant
même d'être parsé ; (2) un texte extrait arbitrairement long pourrait
dépasser les limites de contexte des providers IA ou gonfler
excessivement les coûts/latence.

## Décision
`src/documents/reader.js` :
- Détecte le format par **extension de fichier** (`.pdf`, `.docx`,
  `.txt`/`.md`/`.csv`/`.json`/`.log`/`.yml`/`.yaml`), pas par type MIME
  Discord (souvent générique `application/octet-stream`, donc peu fiable).
- Rejette tout fichier dépassant `DOCUMENT_MAX_DOWNLOAD_BYTES` (15 Mo)
  **avant** de le télécharger — la taille (`attachment.size`) est fournie
  par l'API Discord sans avoir à récupérer le contenu.
- Extrait le texte via `pdf-parse` (PDF), `mammoth` (DOCX, uniquement le
  texte brut — pas le rendu HTML/styles), ou lecture UTF-8 directe
  (formats texte).
- Tronque le texte extrait à `DOCUMENT_MAX_EXTRACTED_CHARS` (20 000
  caractères) avant de l'injecter dans le prompt, en informant
  l'utilisateur si une troncature a eu lieu.
- Un document joint est prioritaire sur la lecture de salon dans le
  routeur (`src/discord/router.js`) : si un fichier supporté est présent,
  l'intention porte presque toujours sur ce fichier.

## Justification
- **Alternative rejetée : détection par type MIME.** Testé indirectement
  via l'expérience du projet avec les pièces jointes vocales (le type
  MIME Discord pour les uploads n'est pas toujours fiable selon le
  client d'origine) — l'extension du nom de fichier est plus prévisible.
- **Alternative rejetée : pas de limite de taille.** Un PDF de plusieurs
  centaines de Mo chargé entièrement en `Buffer` avant parsing pourrait
  faire dépasser la limite mémoire du process (256 Mo sur la
  configuration Fly.io actuelle, voir `fly.toml`), plantant le bot pour
  TOUT le monde, pas seulement l'utilisateur qui a envoyé le fichier —
  c'est un vecteur de déni de service trivial à éviter dès la conception.
- **`mammoth.extractRawText` plutôt que `convertToHtml`.** Seul le texte
  sert de contexte IA ; convertir en HTML ajouterait du bruit de balisage
  dans le prompt sans bénéfice, pour un coût de traitement plus élevé.
- **Troncature silencieuse mais signalée**, plutôt qu'un rejet total des
  documents trop longs : mieux vaut répondre sur les 20 000 premiers
  caractères d'un rapport que refuser toute réponse.

## Démonstration
```js
if (attachment.size > DOCUMENT_MAX_DOWNLOAD_BYTES) {
  throw new Error(`Fichier trop volumineux (${...} Mo, limite : ${...} Mo).`);
}
```
Cette vérification précède l'appel `fetch(attachment.url)` : un fichier
de 500 Mo est rejeté en microsecondes (lecture d'une propriété déjà
fournie par Discord), sans jamais toucher le réseau ni la mémoire au-delà
de la taille de l'objet `attachment` lui-même. `extractDocumentText`
retourne `{ text, truncated }` — `handleDocumentAttachment` vérifie ce
flag et ajoute une note explicite en fin de réponse si la troncature a
eu lieu, donc l'utilisateur n'est jamais laissé à croire qu'il a une
analyse complète d'un document en réalité coupé.

## Conséquences
- Un PDF scanné (image, sans couche de texte OCR) produit un texte vide
  → erreur explicite (« document vide, scanné en image, ou protégé »),
  pas un plantage silencieux. L'OCR est explicitement hors périmètre
  (coût de calcul et de dépendances disproportionné pour ce projet).
- Les formats binaires non listés (XLSX, PPTX, images) ne sont pas
  supportés et sont simplement ignorés par le routeur (aucun handler ne
  les reconnaît) plutôt que de produire une erreur — cohérent avec le
  reste du routeur, qui ignore silencieusement tout ce qu'aucun
  déclencheur ne reconnaît.

## 🔒 Clause inviolable
`DOCUMENT_MAX_DOWNLOAD_BYTES` doit toujours être vérifié **avant** tout
appel réseau de téléchargement, jamais après. Un futur ajout de format
(XLSX, PPTX...) doit respecter ce même ordre — vérifier la taille
déclarée par Discord avant de télécharger quoi que ce soit — pour ne pas
réintroduire le vecteur de déni de service que cette limite ferme.
