# ADR 0005 — Timeout et retry de la synthèse vocale (TTS)

## Statut
Accepté — inviolable sur le principe (toujours borner dans le temps),
ajustable sur les valeurs numériques exactes.

## Contexte
`msedge-tts` ouvre un WebSocket vers le service de synthèse vocale de
Microsoft Edge (gratuit, sans clé) et streame l'audio en retour. Ce
WebSocket peut, sous certains hébergeurs ou conditions réseau, rester
ouvert sans jamais émettre de données ni se fermer proprement — sans
protection, `for await (const chunk of audioStream)` attend alors
indéfiniment, bloquant toute la réponse vocale (temps réel ou message
natif) sans qu'aucune erreur ne remonte jamais à l'utilisateur.

Une version antérieure du code avait ajouté un mécanisme de retry avec
timeout pour ce problème précis, documenté comme correctif à
« stream closing prematurely ». Un commit de retour en arrière ultérieur
l'a supprimé en argumentant qu'une version plus simple « fonctionnait
mieux », réintroduisant le risque de blocage sans aucun commentaire
expliquant l'arbitrage. C'est le genre de régression qu'un ADR est censé
empêcher : un choix défait sans que sa justification d'origine soit
réévaluée ni documentée.

## Décision
`synthesizeSpeechBuffer()` (`src/voice/tts.js`) applique deux règles :
1. Chaque tentative de synthèse est bornée par `SYNTHESIS_TIMEOUT_MS`
   (20s) : si aucune donnée n'arrive avant, la tentative est abandonnée
   proprement (`tts.close()` puis rejet), jamais un blocage silencieux.
2. Si une tentative échoue ou produit moins de 500 octets (seuil
   empirique en dessous duquel l'audio n'est pas exploitable), une
   deuxième tentative est faite (`MAX_SYNTHESIS_ATTEMPTS = 2`) avant
   d'abandonner définitivement avec une erreur explicite.

Une nuance délibérée par rapport au mécanisme précédent (celui qui avait
été retiré) : si le flux se termine après avoir produit des données
partielles non vides, ces données sont conservées et utilisées plutôt
que rejetées — un audio légèrement tronqué reste utile, un rejet total
ne l'est jamais.

## Justification
- **Alternative rejetée : aucun timeout** (l'état d'avant ce correctif).
  Un `for await` sans limite de temps sur un flux réseau externe est un
  point de blocage non observable : rien ne le distingue, du point de
  vue de l'utilisateur, d'un bot qui a planté.
- **Alternative rejetée : un mécanisme de retry élaboré** (backoff
  exponentiel, plusieurs tentatives, acceptation de tout buffer partiel
  quelle que soit sa taille) — c'est probablement ce qui rendait la
  version précédente assez complexe pour justifier, aux yeux de son
  auteur, un retour en arrière complet plutôt qu'un ajustement ciblé.
  Cette version-ci se limite volontairement à un timeout simple et un
  seul retry, pour rester assez lisible qu'on ne soit plus tenté de tout
  retirer d'un coup la prochaine fois qu'elle semblera « trop complexe ».
- Le timeout de synthèse (20s) est distinct du timeout de lecture audio
  dans le salon vocal (`PLAYBACK_TIMEOUT_MS`, également 20s, dans la
  même fonction `speakInVoiceChannel`) : ce sont deux phases différentes
  du pipeline (générer l'audio, puis le jouer) qui peuvent chacune
  bloquer indépendamment et doivent donc être protégées indépendamment.

## Démonstration
`synthesizeOnce()` utilise un `Promise` avec `setTimeout` explicite
(pas de dépendance à un timeout implicite d'une librairie tierce) :
```js
const timer = setTimeout(() => {
  if (settled) return;
  settled = true;
  tts.close();
  reject(new Error(`Timeout de synthèse TTS (${SYNTHESIS_TIMEOUT_MS / 1000}s)`));
}, SYNTHESIS_TIMEOUT_MS);
```
Le flag `settled` empêche toute résolution/rejet en double si le timer
et l'événement `end` se déclenchent presque simultanément — sans cette
garde, `finish()` pourrait être appelée deux fois et fermer une
connexion déjà fermée, ou tenter de résoudre une promesse déjà réglée
(erreur silencieuse typique des mécanismes de timeout mal gardés).

## Conséquences
- Une réponse vocale peut échouer après ~40s dans le pire cas (2
  tentatives × 20s) au lieu de rester bloquée indéfiniment — un échec
  rapide et visible est préférable à un blocage invisible.
- Le code est légèrement plus long que la version « simple » du
  dernier revert, choix assumé : la robustesse a un coût en lignes de
  code, documenté ici pour qu'il ne soit pas retiré sans discussion.

## 🔒 Clause inviolable
`synthesizeSpeechBuffer` (et toute future fonction réseau/streaming
similaire ajoutée à ce projet) DOIT rester bornée dans le temps. Un
futur refactor peut changer les valeurs de timeout ou la stratégie de
retry, mais ne doit jamais revenir à une attente non bornée sur un flux
réseau externe — c'est précisément la régression que cet ADR documente
et referme.
