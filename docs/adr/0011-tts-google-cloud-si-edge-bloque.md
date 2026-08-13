# ADR 0011 — Google Cloud TTS comme provider primaire si configuré

## Statut
Accepté — inviolable sur le principe de sélection (voir clause).

## Contexte
`src/voice/tts.js` (ADR 0005) synthétise via Microsoft Edge TTS, gratuit
et sans clé — mais reverse-engineered à partir du service interne "Lire à
voix haute" d'Edge, pas une API publique documentée. Diagnostic effectué
le 13 août 2026, en réponse à un échec systématique de génération de
message vocal natif en production (Fly.io), avec l'erreur :

```
Stream closed before the synthesis completed (no turn.end received).
The audio is likely truncated.
```

Cette erreur est levée par `msedge-tts` lui-même (`MsEdgeTTS.js`,
gestionnaire `_ws.onclose`) quand le WebSocket est fermé par le serveur
Microsoft **avant** d'avoir reçu le message `turn.end` — c'est-à-dire que
Microsoft a coupé la connexion en cours de synthèse, pas un problème
réseau générique (perte de paquets, latence). Preuve déterminante : le
même appel (`synthesizeSpeechBuffer("Bonjour, ceci est un test.", ...)`)
a **échoué systématiquement** depuis la machine Fly.io de production
(observé le 12 et le 13 août 2026, sur plusieurs tentatives et malgré le
retry de l'ADR 0005) mais a **réussi instantanément** (17 280 octets)
exécuté depuis un environnement de développement différent, avec le code
strictement identique. La variable qui change est l'adresse IP de sortie
— ce qui pointe vers un filtrage côté Microsoft des IP partagées
d'hébergeurs cloud (Fly.io mutualise ses IP de sortie entre plusieurs
clients ; un usage intensif de ce contournement non officiel par
d'autres locataires de la même plage a pu la faire bannir).

Aucun ajustement de timeout ou de retry ne peut contourner un blocage
décidé côté serveur Microsoft — ADR 0005 reste valide pour absorber une
instabilité réseau ponctuelle, mais ne peut rien face à un rejet
systématique.

## Décision
`src/voice/tts.js::synthesizeSpeechBuffer()` choisit son provider selon
la configuration, **pas** en tentant Edge TTS puis en repliant sur Google
au premier échec :

```js
if (hasGoogleTts) return synthesizeWithGoogleCloud(text, GOOGLE_TTS_VOICE);
return synthesizeWithEdgeTts(text, voiceName);
```

Si `GOOGLE_TTS_API_KEY` est configurée, Google Cloud TTS (API REST
officielle, `src/voice/googleTts.js`) devient le provider **exclusif** —
Edge TTS n'est même pas tenté. Si la clé est absente, le comportement
existant (Edge TTS, ADR 0005) reste inchangé — aucune régression pour un
déploiement qui ne subit pas ce blocage (ex. exécution locale, ou futur
hébergeur avec IP dédiée).

L'appel Google Cloud TTS utilise l'API REST directement (authentification
par clé API en paramètre d'URL), **pas** le SDK npm
`@google-cloud/text-to-speech` (SDK gRPC pensé pour l'authentification
par compte de service, dont les dépendances transitives — environ 68
paquets, `google-gax`, `protobufjs`, etc. — sont disproportionnées pour
un unique appel `POST /v1/text:synthesize` en JSON). Ce SDK avait été
retiré du projet comme code mort (ADR 0001) avant que ce diagnostic
n'ait lieu ; l'appel REST direct, cohérent avec le style déjà utilisé
pour Gemini/Groq/Mistral (`fetch` brut), fournit la même fonctionnalité
sans réintroduire cette dépendance lourde.

## Justification
- **Alternative rejetée : Edge TTS d'abord, Google Cloud en repli
  automatique sur échec.** Étant donné que l'échec est **systématique**
  sur Fly.io (pas intermittent), cette approche garantirait 100% du
  temps ~40s de latence perdue (2 tentatives Edge × 20s de timeout,
  ADR 0005) avant d'atteindre le vrai provider fonctionnel — dégradation
  d'expérience inutile et prévisible.
- **Alternative rejetée : abandonner Edge TTS entièrement.** Reste la
  voie gratuite par défaut, fonctionnelle pour quiconque héberge ce bot
  ailleurs qu'sur une plage d'IP filtrée par Microsoft (développement
  local, VPS avec IP dédiée). Le retirer pénaliserait ces déploiements
  sans bénéfice.
- **REST direct plutôt que le SDK officiel** : le SDK résout un problème
  (auth OAuth complexe multi-service) que ce projet n'a pas — une clé
  API suffit pour ce seul endpoint, comme documenté par Google pour les
  cas d'usage simples.
- **`fr-FR-Standard-A` comme valeur par défaut de `GOOGLE_TTS_VOICE`** :
  seul niveau de voix garanti disponible pour toutes les langues
  supportées depuis le lancement de l'API (contrairement aux voix
  Neural2/Wavenet, ajoutées progressivement et donc pas garanties sans
  vérification via une clé API valide, indisponible au moment d'écrire
  ce code). Documenté comme point de départ, pas comme optimum — voir
  `env.example` pour le lien vers le catalogue complet.

## Démonstration
Test reproductible cité en contexte : même fonction, mêmes arguments,
deux environnements réseau différents, résultat opposé
(succès local / échec Fly.io) — élimine le contenu du texte, la
configuration de la voix, et le code applicatif comme causes possibles,
ne laissant que le réseau de sortie comme variable explicative. Les
logs de production du 12 août montrent la même erreur `no turn.end
received`, avant toute modification de ce projet — donc pas une
régression introduite par une correction antérieure, un blocage
préexistant simplement non diagnostiqué jusqu'ici.

## Conséquences
- Google Cloud TTS n'est pas gratuit au-delà d'un quota mensuel
  (généreux, mais pas illimité) — un déploiement à fort volume vocal
  devra surveiller sa consommation, contrairement à Edge TTS qui n'a
  aucun quota (mais aucune garantie de disponibilité, cf. ce même ADR).
- Deux catalogues de voix incompatibles coexistent (`TTS_VOICE` pour
  Edge, format `xx-XX-NomNeural` ; `GOOGLE_TTS_VOICE` pour Google Cloud,
  format `xx-XX-Standard/Wavenet/Neural2-X`) — changer de provider
  implique de reconfigurer la voix, pas juste la clé.

## 🔒 Clause inviolable
Le choix de provider DOIT rester déterminé une fois par configuration
(`hasGoogleTts` vérifié en tête de fonction), jamais par un essai-échec
à chaque appel. Un blocage serveur systématique ne se comporte pas comme
une panne réseau transitoire : le confondre avec ADR 0005 (qui suppose
un échec parfois récupérable par retry) réintroduirait la latence perdue
que cette décision élimine précisément.
