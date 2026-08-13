# ADR 0003 — Contrainte d'hébergement du vocal temps réel

## Statut
Accepté — constat honnête d'une limite d'infrastructure, inviolable dans
sa formulation (ne pas prétendre que le code seul peut la résoudre).

## Contexte
Rejoindre un salon vocal Discord (`joinVoiceChannel` de `@discordjs/voice`)
ouvre une connexion **WebSocket + UDP** vers le gateway vocal de Discord :
le WebSocket négocie la session, puis un flux UDP porte l'audio en
continu et sert à la découverte de l'adresse IP/port publics du bot
(étape « IP discovery », un aller-retour UDP obligatoire avant que la
connexion passe à l'état `Ready`). C'est structurellement différent d'un
appel HTTP REST classique (requête/réponse ponctuelle) : il faut un flux
UDP bidirectionnel stable dans la durée.

Certains hébergeurs (dont Fly.io, dans la configuration testée pour ce
projet — machine partagée 256 Mo) routent ce trafic UDP de façon peu
fiable pour ce cas d'usage précis, ce qui fait échouer l'étape de
découverte IP et empêche la connexion d'atteindre
`VoiceConnectionStatus.Ready` avant expiration du délai d'attente.
Symptôme observé : le bot apparaît brièvement dans le salon vocal puis
en repart, avec un timeout côté code.

**Expérience du 13 août 2026 : changement de région testé, sans effet.**
Hypothèse initiale (issue de retours d'autres utilisateurs de
`@discordjs/voice` sur des plateformes similaires) : le problème serait
lié au routage vers une région Discord particulière plutôt qu'à un
blocage structurel. Testé en clonant la machine de production de `cdg`
(Paris) vers `fra` (Francfort) via `flyctl machine clone` puis
suppression de l'ancienne machine. **Résultat : échec identique après
migration** (`Impossible de rejoindre le vocal (timeout après 60s).
État: destroyed.`), sur le même serveur Discord, sans changement de
comportement. Ceci élimine l'hypothèse d'un problème de routage
spécifique à la région `cdg` et renforce la lecture d'une contrainte
structurelle de la plateforme (probablement liée à la virtualisation
Firecracker utilisée par Fly.io pour ses sockets UDP), pas d'une
particularité corrigible par le choix de région.

**Expérience du 13 août 2026 : test sur Render, échec identique.**
Deuxième hypothèse testée : le problème serait spécifique à
l'architecture Fly.io (microVM Firecracker) et un hébergeur PaaS plus
conventionnel (conteneurs Docker sur infrastructure cloud standard,
pas de virtualisation maison) s'en sortirait mieux. Déployé le code
identique sur Render (plan gratuit, région Frankfurt, via
`render.yaml`), machine Fly.io arrêtée pendant le test pour éviter les
doublons de réponse. **Résultat : même timeout, même comportement.**
Ceci élimine à son tour l'hypothèse "c'est une particularité de
Firecracker/Fly.io" : le problème se reproduit sur deux plateformes
d'architecture différente (microVM chez Fly.io, conteneurs chez
Render), ce qui pointe vers quelque chose de plus général — soit une
caractéristique commune aux hébergeurs PaaS orientés HTTP (filtrage ou
absence d'optimisation pour du trafic UDP client soutenu, indépendant
de la techno de virtualisation exacte), soit une contrainte liée au
NAT/pare-feu de sortie partagé entre plusieurs locataires sur ces deux
plateformes. Un VPS classique (IP dédiée, pas de NAT partagé
multi-tenant, contrôle total de la stack réseau) reste la seule option
non testée à ce stade susceptible de lever la contrainte.

**Expérience du 13 août 2026 : test UDP brut, indépendant de Discord —
preuve décisive.** Pour écarter toute hypothèse liée spécifiquement au
protocole ou à la librairie `@discordjs/voice`, un test isolé a été fait
directement depuis la machine Fly.io de production (`flyctl ssh
console`) : envoi d'une requête STUN standard (protocole UDP générique
de découverte d'adresse réseau, utilisé par WebRTC entre autres — sans
rapport avec Discord) vers `stun.l.google.com:19302`, un service public
connu pour répondre de façon fiable. **Résultat : aucune réponse reçue
après 5 secondes**, alors que l'envoi lui-même n'a levé aucune erreur
(le paquet part, mais rien ne revient — ou le paquet ne part jamais
réellement malgré l'absence d'erreur au niveau du socket). Ce test ne
dépend d'aucune spécificité du protocole voix de Discord : il établit
que **l'UDP sortant vers des hôtes arbitraires d'Internet ne fonctionne
pas de façon fiable sur cette machine Fly.io** (`shared-cpu-1x`, IPv4
partagée, pas d'adresse dédiée). C'est la preuve la plus directe
obtenue à ce jour, et elle explique aussi *pourquoi* Render présente le
même symptôme (§ expérience précédente) : les plateformes PaaS
orientées HTTP/TCP, dont l'infrastructure est share-tenant et souvent
peu ou pas testée pour du trafic UDP client soutenu vers des
destinations arbitraires, ne sont probablement simplement pas conçues
pour ce cas d'usage — indépendamment du fournisseur précis.

## Décision
1. Ne pas prétendre résoudre ce problème uniquement par du code applicatif.
2. Porter le délai d'attente de connexion à 60 secondes
   (`VOICE_CONNECT_TIMEOUT_MS` dans `src/voice/session.js`) — un délai
   trop court peut faire échouer une connexion qui aurait fini par
   aboutir sur un réseau lent, sans que ce soit un vrai blocage UDP.
3. Nettoyer systématiquement la connexion (`connection.destroy()`) sur
   tout chemin d'échec, pour ne jamais laisser de session vocale
   fantôme dans `activeVoiceSessions`.
4. En cas d'échec, informer clairement l'utilisateur avec la cause
   probable et rediriger vers les messages vocaux natifs (ADR 0004),
   qui eux n'ont besoin que de HTTP REST et ne souffrent pas de cette
   contrainte.
5. Documenter la contrainte ici plutôt que dans un fichier markdown
   isolé et non maintenu, pour qu'elle reste visible et à jour à côté du
   code qu'elle explique.

## Justification
- **Alternative rejetée : promettre un « fix » réseau côté code**
  (forcer IPv4, changer le timeout indéfiniment, ajouter des retries
  agressifs). Aucune de ces options ne change la nature du problème :
  si les paquets UDP de découverte IP n'arrivent pas à destination ou
  reviennent altérés à cause du routage réseau de l'hébergeur, aucune
  logique applicative ne peut compenser un problème de couche réseau.
  Prétendre le contraire romprait la confiance sur un point que le code
  ne peut objectivement pas garantir.
- **Alternative retenue en pratique : les messages vocaux natifs**
  (ADR 0004) couvrent l'essentiel du besoin « interaction vocale » sans
  dépendre d'UDP, et fonctionnent indépendamment de cette contrainte.
- Si le vocal temps réel doit absolument fonctionner de façon fiable, la
  vraie solution est un changement d'hébergeur vers une plateforme avec
  un accès réseau moins contraint (VPS classique : DigitalOcean,
  Hetzner, OVH, ou Oracle Cloud Free Tier) — un choix d'infrastructure,
  pas de code, donc hors du périmètre que ce dépôt peut garantir seul.

## Démonstration
`entersState(connection, VoiceConnectionStatus.Ready, 60_000)` dans
`src/voice/session.js` : si la négociation UDP n'aboutit jamais, cette
promesse rejette après 60s avec l'état réel de la connexion
(`connection.state.status`) loggé pour diagnostic — le comportement en
échec est déterministe et observable, ce n'est pas un blocage silencieux.
Le message d'erreur renvoyé à l'utilisateur nomme explicitement la cause
probable et l'alternative disponible (messages vocaux natifs), au lieu
d'un message générique inexploitable.

## Conséquences
- Le vocal temps réel peut rester indisponible ou intermittent tant que
  le bot tourne sur un hébergeur qui route mal l'UDP. C'est un compromis
  d'infrastructure assumé, pas un bug à « corriger » indéfiniment côté code.
- Les utilisateurs ont un chemin de repli fonctionnel (messages vocaux
  natifs) qui ne dépend pas de cette contrainte.

## 🔒 Clause inviolable
Ne jamais présenter un ajustement de timeout ou de retry comme une
« correction » du problème d'hébergement dans la documentation
utilisateur ou les messages d'erreur du bot — toujours nommer la cause
racine (réseau UDP de l'hébergeur) pour que la personne qui exploite le
bot sache où agir réellement si elle veut une fiabilité garantie.
