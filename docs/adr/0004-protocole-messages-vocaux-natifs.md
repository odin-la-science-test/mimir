# ADR 0004 — Protocole des messages vocaux natifs Discord

## Statut
Accepté — inviolable pour la forme exacte des requêtes (validée empiriquement).

## Contexte
Discord propose deux façons totalement différentes d'envoyer de l'audio :
1. **Voix temps réel** (ADR 0003) : connexion WebSocket + UDP à un salon
   vocal, contrainte par le réseau de l'hébergeur.
2. **Message vocal natif** : la bulle audio avec forme d'onde qu'on peut
   envoyer dans un salon texte, comme le fait l'appli mobile Discord. Ce
   n'est qu'un envoi de fichier via l'API REST HTTP — pas de gateway
   vocal, pas d'UDP, indépendant de la contrainte de l'ADR 0003.

Il n'existe pas de méthode officielle documentée dans `discord.js` pour
construire ce type de message (l'énumération `MessageFlags` de la
librairie ne contient pas de valeur pour ça au moment de l'écriture) :
il faut construire la requête REST à la main, en 3 étapes, contre
`discord.com/api/v10` directement.

## Décision
`sendNativeVoiceMessage()` (`src/voice/nativeMessage.js`) implémente les
3 étapes suivantes :

1. `POST /channels/{id}/attachments` avec
   `{"files":[{"filename":"voice-message.ogg","file_size":N,"id":"2"}]}`
   → retourne une `upload_url` pré-signée et un `upload_filename`.
2. `PUT <upload_url>` avec le fichier OGG/Opus brut en corps, header
   `Content-Type: audio/ogg`, **sans header `Authorization`**.
3. `POST /channels/{id}/messages` avec `flags: 8192` (bit
   `IS_VOICE_MESSAGE`, en valeur numérique car absent de l'énumération
   discord.js) et un unique attachment `{"id":"0", "uploaded_filename":
   ..., "duration_secs": ..., "waveform": ...}`.

L'audio source (MP3 issu du TTS) est reconverti en OGG/Opus mono 48kHz
via `ffmpeg` (`convertToOggOpus`), format que Discord exige strictement
pour ce type de message.

## Justification
- **Le header `Authorization` est volontairement absent à l'étape 2.**
  `upload_url` est une URL pré-signée (le jeton d'autorisation est déjà
  encodé dans ses paramètres de requête) : lui ajouter un header
  `Authorization: Bot ...` supplémentaire produit une erreur de
  signature côté service de stockage sous-jacent. Ce point contredit
  certaines descriptions génériques trouvées en ligne du protocole (qui
  suggèrent d'inclure le header), mais a été **validé empiriquement en
  production** — retirer le header a résolu une erreur `400 Cannot send
  an empty message` précédemment bloquante.
- **`id: "2"` à l'étape 1 vs `id: "0"` à l'étape 3** ne sont pas des
  fautes de frappe : ce sont deux identifiants dans deux contextes
  différents (un identifiant de fichier dans la requête d'upload, un
  identifiant d'attachment dans le message final) qui n'ont pas besoin
  de correspondre — Discord relie les deux via `uploaded_filename`, pas
  via cet `id`.
- **`waveform` est synthétique** (`buildSyntheticWaveform`, une
  enveloppe sinusoïdale avec un peu de bruit) plutôt que calculée à
  partir de l'amplitude réelle de l'audio : Discord ne vérifie pas la
  cohérence entre les deux (purement visuel côté client), et calculer
  une vraie enveloppe demanderait de décoder l'Opus — complexité inutile
  pour un rendu que l'utilisateur ne peut de toute façon pas distinguer
  d'un vrai calcul.

## Démonstration
Ce protocole a été exercé en production le 12-13 août 2026 : avant le
retrait du header `Authorization` sur l'étape 2 et la correction de
`id: "2"`, l'étape 3 échouait systématiquement avec
`400 - {"message":"Cannot send an empty message","code":50006}` ; après
correction, le message vocal natif (bulle audio avec forme d'onde) est
bien reçu côté client Discord. La fonction `convertToOggOpus` vérifie
explicitement `buffer.length === 0` après l'appel ffmpeg et échoue tôt
avec un message explicite si le build `ffmpeg-static` ne supporte pas
`libopus`, plutôt que de laisser Discord renvoyer une erreur opaque plus
tard dans le pipeline.

## Conséquences
- Ce protocole n'est pas documenté officiellement par Discord : une
  évolution non annoncée de l'API pourrait le casser sans dépréciation
  formelle. Chaque échec de `sendNativeVoiceMessage` est donc
  intentionnellement verbeux (statut HTTP + corps de réponse complet
  dans le message d'erreur) pour diagnostiquer rapidement un changement
  d'API.
- Un message vocal natif ne peut contenir NI texte, NI embed, NI autre
  attachment (limitation Discord, pas une limitation de ce code) : en
  cas d'échec de génération, le code se replie sur une réponse texte
  classique plutôt que d'échouer silencieusement.

## 🔒 Clause inviolable
Ne jamais réintroduire de header `Authorization` sur le `PUT` de
l'étape 2 sans re-tester en production — cette erreur précise a déjà
cassé la fonctionnalité une fois. Toute modification de ce protocole
doit être validée par un envoi réel réussi avant merge, pas seulement
par une relecture du code (l'API n'étant pas documentée officiellement,
aucune certitude théorique ne remplace le test empirique).
