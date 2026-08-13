# ADR 0015 — Pont vers un agent de codage local (Claude Code) déclenché depuis Discord

## Statut
Accepté — inviolable sur la restriction d'accès (clause de sécurité,
voir plus bas).

## Contexte
Demande explicite : pouvoir déclencher, depuis Discord, une tâche de
codage réelle (lecture/écriture de fichiers) sur la machine locale de
l'opérateur, en utilisant Claude Code plutôt que les modèles déjà
intégrés à Mimir (Gemini/Groq/Mistral, choix confirmé de ne pas ajouter
l'API Anthropic comme provider supplémentaire).

Deux contraintes structurent toute la conception :
1. **Le bot tourne dans le cloud (Fly.io) ; il n'a aucun moyen physique
   d'atteindre la machine locale de l'opérateur** (pas d'IP publique,
   pas de port ouvert, potentiellement derrière un NAT résidentiel).
2. **Une commande qui écrit du code sur une machine réelle, déclenchée
   par un message Discord, est un vecteur d'exécution de code à
   distance si elle n'est pas verrouillée strictement.** Un serveur
   Discord a par nature plusieurs membres ; sans restriction, n'importe
   lequel pourrait faire écrire n'importe quoi sur la machine de
   l'opérateur en tapant un simple message.

## Décision

### Architecture : agent local qui se connecte VERS le bot
`local-agent/agent.js` tourne sur la machine de l'opérateur et ouvre
une connexion WebSocket **sortante** vers le bot (`wss://.../agent-bridge`,
`src/agent/bridge.js`). C'est l'inverse d'un serveur qui écouterait des
connexions entrantes : une connexion sortante ne nécessite aucune
configuration réseau côté opérateur (pas de port-forwarding, pas d'IP
fixe), exactement comme n'importe quel client (navigateur, appli
Discord) se connecte à un serveur sans que ce dernier n'ait besoin de
« rentrer » chez le client.

### Authentification du pont
La connexion WebSocket doit s'authentifier avec `LOCAL_AGENT_TOKEN`
(secret généré une fois, partagé entre Fly.io et `local-agent/.env`)
dans les 5 premières secondes, comparé en temps constant
(`crypto.timingSafeEqual`) pour ne pas laisser un timing attack deviner
le secret octet par octet. Sans ce token, une connexion WebSocket
quelconque ne peut ni recevoir de tâches ni se faire passer pour
l'agent local.

### Autorisation de la commande Discord
`src/agent/remoteCoding.js` vérifie `message.author.id === OWNER_DISCORD_ID`
**avant toute autre chose**, y compris avant de parser la commande.
Toute personne autre que ce seul ID Discord reçoit un refus explicite
(`🚫 Cette commande est réservée à l'opérateur du bot.`), y compris des
administrateurs du serveur Discord — l'autorisation ne dépend
d'aucun rôle/permission Discord, seulement de cet ID exact.

### Exécution via Claude Code, pas un appel API séparé
L'agent local lance `claude -p "<instruction>" --output-format json
--permission-mode acceptEdits` (voir `local-agent/agent.js`), **sans**
`--bare` : ce flag ignore la session `claude login` existante et exige
une clé API Anthropic séparée, ce que l'opérateur a explicitement
écarté. Sans `--bare`, la commande réutilise automatiquement les
identifiants OAuth déjà présents sur la machine (`claude login`) — pas
de nouvelle clé, pas de nouveau coût, la tâche est facturée sur
l'abonnement Claude Code déjà existant de l'opérateur.

`--permission-mode acceptEdits` (et non `bypassPermissions`) est un
choix délibéré : ce mode autorise la lecture et l'édition de fichiers
ainsi que quelques commandes système basiques (`mkdir`, `touch`, `mv`,
`cp`) sans confirmation bloquante (indispensable ici : personne n'est
devant l'écran pour répondre à un prompt de permission), mais **pas**
l'exécution de commandes shell arbitraires. `bypassPermissions` est
documenté officiellement comme réservé aux « VMs/containers isolées » —
inadapté à une machine de bureau réelle avec les fichiers personnels de
l'opérateur.

### Pas de restriction de chemin (choix assumé de l'opérateur)
Contrairement à une conception plus prudente par défaut (limiter à un
seul projet pré-configuré), l'opérateur a explicitement choisi de
pouvoir cibler n'importe quel dossier via un chemin donné dans la
commande Discord elle-même (`mimir code "<chemin>" <tâche>`). Aucune
liste blanche de chemins autorisés n'est implémentée. C'est un choix de
flexibilité assumé, pas un oubli — documenté ici pour qu'il reste
visible et ne soit pas silencieusement resserré ou élargi sans relire
cette décision.

## Justification
- **Pourquoi un agent local plutôt qu'exécuter Claude Code sur Fly.io
  directement ?** Le but est de modifier des fichiers sur la machine de
  l'opérateur (n'importe quel projet local), pas sur la machine
  cloud du bot — ces deux environnements de fichiers sont
  physiquement différents. Il n'y a pas d'alternative : le code doit
  s'exécuter là où sont les fichiers à modifier.
- **Pourquoi WebSocket plutôt que, par exemple, un polling HTTP
  périodique ?** Une tâche de codage peut prendre plusieurs minutes ;
  une connexion persistante permet de pousser la tâche instantanément
  dès sa réception côté Discord, et de recevoir le résultat dès qu'il
  est prêt, sans délai d'attente lié à un intervalle de polling.
- **Pourquoi vérifier l'ID Discord de l'auteur plutôt qu'un rôle
  Discord (ex: "Administrateur") ?** Un rôle peut être attribué à
  plusieurs personnes, actuellement ou plus tard, sans qu'on y pense
  spécifiquement pour CETTE fonctionnalité précise. Un ID Discord fixe,
  choisi une fois et non modifiable sans redéploiement, élimine ce
  risque de dérive silencieuse des permissions.
- **Pourquoi limiter le pont à un seul agent connecté à la fois** (une
  nouvelle connexion authentifiée remplace l'ancienne) ? Ce projet n'a
  qu'un seul opérateur avec une seule machine ; complexifier pour
  gérer plusieurs agents simultanés n'apporterait aucun bénéfice réel.

## Démonstration
`crypto.timingSafeEqual` exige des buffers de longueur égale — le code
vérifie explicitement `provided.length === expected.length` avant
l'appel, car `timingSafeEqual` lève une exception sur des longueurs
différentes plutôt que de retourner `false` (piège classique qui
casserait l'authentification avec une erreur non gérée au lieu d'un
rejet propre). `handleRemoteCodingRequest` vérifie l'ID AVANT même de
tenter de parser le format de la commande — un non-autorisé ne peut
donc rien apprendre sur le format attendu à partir des messages
d'erreur (aucune fuite d'information sur la syntaxe interne).

## Conséquences
- Cette fonctionnalité est **inactive par défaut** (`hasRemoteCoding`
  dans `src/config.js` exige à la fois `OWNER_DISCORD_ID` et
  `LOCAL_AGENT_TOKEN`) — un déploiement de ce bot sans ces deux
  variables n'expose aucune surface d'attaque liée à cette
  fonctionnalité, le pont WebSocket n'est même pas démarré.
- Si le compte Discord de l'opérateur était compromis, cette
  fonctionnalité deviendrait un vecteur d'exécution de code sur sa
  machine locale — risque accepté explicitement en échange de la
  flexibilité de pouvoir cibler n'importe quel projet.
- L'agent local doit être relancé manuellement après chaque coupure
  prolongée (choix de l'opérateur : lancement à la demande, pas de
  service permanent en arrière-plan).

## 🔒 Clause inviolable
1. La vérification `message.author.id === OWNER_DISCORD_ID` doit
   rester la toute première chose exécutée dans
   `handleRemoteCodingRequest`, avant tout parsing ou toute réponse
   informative — ne jamais la déplacer après une validation de format
   qui donnerait des indices à un utilisateur non autorisé.
2. Ne jamais remplacer `--permission-mode acceptEdits` par
   `bypassPermissions` dans `local-agent/agent.js` sans une demande
   explicite et éclairée de l'opérateur sur les risques (exécution
   shell arbitraire sans confirmation).
3. Ne jamais logger ou renvoyer `LOCAL_AGENT_TOKEN` en clair dans un
   message Discord, une réponse d'erreur, ou une sortie de log — seule
   la comparaison en temps constant doit le manipuler.
