# ADR 0013 — Cause réelle de l'échec du vocal temps réel : protocole DAVE manquant

## Statut
Accepté — inviolable (ne jamais revenir à une version de
`@discordjs/voice` antérieure au support DAVE sans re-vérifier ce point
précis).

## Contexte
[ADR 0003](0003-contrainte-hebergement-vocal-temps-reel.md) documentait
une investigation en plusieurs étapes (changement de région, changement
d'hébergeur vers Render, test UDP brut) qui concluait — à tort — à une
limite réseau structurelle des hébergeurs PaaS. Cette investigation
s'est arrêtée trop tôt sur une hypothèse plausible mais fausse. La
correction est venue d'une instrumentation plus poussée du code
(interception directe du code de fermeture WebSocket numérique envoyé
par Discord, non exposé par le canal de debug standard de
`@discordjs/voice` — voir le commit qui ajoute ce hook dans
`src/voice/session.js`), qui a révélé le vrai signal.

**Séquence observée dans les logs de production** : le WebSocket vocal
se connecte avec succès, l'`Identify` est envoyé, Discord répond par un
`Hello` (heartbeat_interval reçu) — puis la connexion est fermée par
Discord avec le **code 4017**, avant l'envoi du payload `Ready` (qui
contiendrait les informations UDP). `@discordjs/voice` interprète ce
type de fermeture comme un signal de retenter la connexion (transition
vers l'état `signalling` puis nouvelle tentative), ce qui, combiné à
l'échec systématique, produit le symptôme observé : un timeout après
60 secondes, sans jamais atteindre `VoiceConnectionStatus.Ready`.

**Signification du code 4017** : depuis le **2 mars 2026**, Discord
impose le protocole **DAVE** (chiffrement de bout en bout audio/vidéo)
sur tous les appels vocaux non-Stage de la plateforme. Un client vocal
qui ne négocie pas ce protocole est rejeté avec le close code 4017
(« E2EE/DAVE requis »). La version installée de `@discordjs/voice`
(`0.18.0`) est antérieure à l'ajout du support DAVE dans cette
librairie — elle ne l'implémente donc pas, et Discord la rejette
systématiquement, sur **tout** hébergeur, dans **toutes** les régions,
avec le protocole réseau sous-jacent (UDP) qui n'a jamais eu l'occasion
d'entrer en jeu.

Ceci explique rétroactivement toutes les observations de l'ADR 0003 :
- Échec identique sur Fly.io ET Render → cohérent, la cause n'a jamais
  été liée à l'hébergeur.
- Échec identique après changement de région → cohérent, même raison.
- UDP sortant fonctionnel (test STUN/DNS) → cohérent, la négociation
  échoue avant même d'atteindre la phase UDP.
- Messages vocaux natifs fonctionnels pendant tout ce temps → cohérent,
  ils n'utilisent jamais le protocole DAVE (REST pur, pas de connexion
  au gateway vocal).

## Décision
Mettre à jour `@discordjs/voice` de `^0.18.0` vers `^0.19.2`
(`package.json`), qui inclut `@snazzah/davey` (implémentation DAVE,
liaison native Rust/NAPI-RS avec binaires précompilés — aucune
compilation requise dans le `Dockerfile` existant) comme dépendance
directe. Aucun changement de code applicatif n'est nécessaire au-delà
de la mise à jour de version : `@discordjs/voice` négocie DAVE en
interne, de façon transparente pour `src/voice/session.js`.

## Justification
- **Pourquoi ne pas avoir trouvé ça plus tôt ?** Le symptôme (timeout,
  état `signalling`) est identique à celui d'un vrai problème réseau,
  et le message d'erreur générique de `entersState()` ne distingue pas
  « le serveur distant a activement fermé la connexion pour une raison
  protocolaire précise » de « rien ne répond ». Le code de fermeture
  exact, seule donnée qui aurait permis un diagnostic immédiat, n'est
  pas remonté par le canal `debug` standard de la librairie — il a
  fallu l'intercepter directement sur l'objet interne `Networking`
  (voir `src/voice/session.js`, hook sur `networking.once("close", ...)`).
- **Pourquoi garder l'ADR 0003 au lieu de le supprimer ?** Il documente
  un cheminement de diagnostic réel, avec des tests reproductibles
  (région, plateforme, UDP brut) qui restent des techniques valables
  pour de FUTURS problèmes vocaux d'une autre nature — seule la
  conclusion finale était fausse, pas la méthode.

## Démonstration
Log de production, code de fermeture capturé le 13 août 2026 :
```
[voice state] connecting → signalling (networking: {"code":6})
[voice networking close] code Discord = 4017
```
Recherche du code 4017 dans la documentation/communication officielle
Discord : confirmé comme « E2EE/DAVE requis », en vigueur depuis
l'annonce d'enforcement du 2 mars 2026. `npm view @discordjs/voice
dependencies` sur la version `0.19.2` confirme `@snazzah/davey: ^0.1.9`
comme dépendance directe (absente des dépendances de la version
`0.18.0` installée jusque-là) — la cause protocolaire et le fix sont
tous deux vérifiables indépendamment de ce dépôt.

## Conséquences
- Toute régression future de `@discordjs/voice` vers une version
  antérieure au support DAVE (rétrogradation accidentelle via une
  contrainte de version mal formulée, par exemple) réintroduirait
  exactement ce symptôme. Le champ `"@discordjs/voice": "^0.19.2"` dans
  `package.json` doit être vérifié en priorité si le vocal temps réel
  recommence à échouer avec un timeout après une mise à jour.
- Les techniques de diagnostic UDP développées pendant l'investigation
  initiale (test STUN, capture de logs `debug: true` +
  `stateChange`) restent dans `src/voice/session.js` : elles ne coûtent
  rien à l'exécution normale et resserviront si un vrai problème réseau
  survient un jour.

## 🔒 Clause inviolable
Ne jamais downgrader `@discordjs/voice` en dessous d'une version
incluant `@snazzah/davey` comme dépendance sans vérifier explicitement,
au moment du changement, que Discord n'a pas encore rendu DAVE
obligatoire (l'enforcement du 2 mars 2026 était déjà en vigueur au
moment d'écrire cet ADR — cette clause suppose qu'il ne sera pas
retiré, ce qui est l'attente normale d'une politique de sécurité déjà
généralisée).
