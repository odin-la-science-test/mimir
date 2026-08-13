# ADR 0014 — Limitation du cache interne de discord.js

## Statut
Accepté.

## Contexte
Le 13 août 2026, en session vocale temps réel active depuis plusieurs
minutes, le process a été tué par l'OOM killer Linux :
```
Out of memory: Killed process 645 (node) total-vm:32862272kB,
anon-rss:152040kB, ...
Process appears to have been OOM killed!
```
La machine de production (`fly.toml`, `shared-cpu-1x`) dispose de
**256 Mo de RAM**. Par défaut, `discord.js` met en cache indéfiniment
(sans limite de taille ni d'âge) tout ce que le client voit passer sur
le Gateway : chaque message, chaque réaction, chaque présence, chaque
thread. Sur une session longue avec plusieurs salons actifs, ce cache
non borné grossit en continu et devient une source de fuite mémoire de
facto, même si aucun "vrai" bug de code n'est en cause.

## Décision
Configurer le `Client` (`index.js`) avec :
1. `makeCache: Options.cacheWithLimits({...})` — plafonne ou désactive
   les caches que ce bot n'exploite jamais depuis son propre cache long
   terme :
   - `MessageManager: 50` (au lieu d'illimité)
   - `PresenceManager`, `GuildStickerManager`,
     `GuildScheduledEventManager`, `ThreadManager`,
     `ThreadMemberManager`, `StageInstanceManager`,
     `AutoModerationRuleManager` : `0` (fonctionnalités non utilisées
     par ce bot)
2. `sweepers.messages` : purge les messages en cache de plus de 15
   minutes, toutes les 5 minutes — borne la croissance dans le temps
   même sous forte activité continue.

## Justification
- **Aucune fonctionnalité de ce bot ne dépend du cache long terme des
  messages.** `src/channels/contextReader.js` (lecture de salon,
  contexte "tout le serveur") appelle systématiquement
  `channel.messages.fetch({ limit })`, qui interroge l'API REST Discord
  à la demande — un cache de 50 messages ou de 0 ne change strictement
  rien à ce qui est lu, seulement à ce qui traîne en mémoire entre deux
  utilisations. Réduire cette limite est donc un pur gain, sans
  compromis fonctionnel.
- **Caches désactivés à 0** : présences, stickers, événements
  planifiés, threads, stage channels, règles d'auto-modération — aucun
  handler de ce projet ne lit jamais ces caches (`grep` sur `src/`
  confirme l'absence de toute référence à `client.presences`,
  `guild.stickers`, `guild.scheduledEvents`, etc.).
- **Alternative rejetée : augmenter la taille de la machine Fly.io.**
  Solution plus sûre à 100% mais payante (`shared-cpu-2x`, voir
  discussion sur Piper TTS, ADR 0012) — cette limitation de cache est
  gratuite et attaque une vraie cause de croissance mémoire non bornée,
  donc à essayer en premier. Si l'OOM se reproduit malgré ce changement,
  l'upgrade de machine reste l'option de repli logique (le pipeline
  audio temps réel — décodage Opus, buffers PCM par utterance,
  transcodage ffmpeg — a un coût mémoire incompressible qu'aucun réglage
  de cache ne peut réduire).

## Démonstration
`anon-rss:152040kB` dans le log OOM (~152 Mo) sur une machine à 256 Mo :
la marge disponible pour les pics du pipeline audio (décodage Opus,
buffers PCM, appels HTTP simultanés vers Groq/ElevenLabs) était déjà
consommée en bonne partie par l'accumulation de cache avant même qu'un
pic d'usage vocal ne survienne. Réduire ce plancher redonne de la marge
sans toucher au pipeline audio lui-même.

## Conséquences
- `channel.messages.cache` ne contiendra plus qu'un historique très
  court par salon — sans incidence, cf. justification ci-dessus.
- Si un futur besoin nécessite un vrai cache de messages (ex: modération
  automatique relisant l'historique en mémoire), il faudra augmenter
  `MessageManager` explicitement plutôt que de découvrir la limite par
  un bug silencieux.

## 🔒 Clause inviolable
Ne jamais revenir à un `Client` sans `makeCache`/`sweepers` explicites
sur cette machine tant qu'elle reste à 256 Mo de RAM — un cache par
défaut illimité a une cause directement vérifiée dans un incident de
production (OOM kill), pas une hypothèse.
