# ADR 0002 — Serveur HTTP de health-check

## Statut
Accepté — inviolable.

## Contexte
`fly.toml` déclare `[http_service] internal_port = 8080` et `render.yaml`
déclare `type: web`. Les deux plateformes en déduisent qu'un serveur HTTP
doit répondre sur ce port pour prouver que le processus est vivant ; sans
ça, elles considèrent le déploiement en échec (Render) ou envoient des
sondes de santé qui échouent en boucle (Fly.io), ce qui peut déclencher
des redémarrages de la machine. Or **`index.js` n'a jamais ouvert de
serveur HTTP** — c'était un bot Discord pur, connecté uniquement au
Gateway WebSocket de Discord, sans jamais `listen()` sur un port.

Un ancien changelog du projet notait déjà le symptôme sans en tirer la
conséquence : *« Fly.io peut afficher un warning 'not listening on
0.0.0.0:8080' mais c'est normal pour un bot Discord »* — cette lecture
était incorrecte : ce n'est pas normal si `render.yaml`/`fly.toml`
attendent explicitement un service HTTP. Un redémarrage de la machine
tue instantanément toute session vocale active (`activeVoiceSessions`)
et vide la mémoire de conversation (`conversationHistory`, en RAM) —
exactement les symptômes rapportés comme « bugs vocaux erratiques ».

## Décision
Démarrer un serveur HTTP minimal (`src/server/healthServer.js`, module
`http` natif de Node, aucune dépendance ajoutée) qui écoute sur
`process.env.PORT || 8080` et répond `200 {"status":"ok"}` une fois le
client Discord prêt (`client.isReady()`), `503` sinon.

## Justification
- **Alternative rejetée : ignorer le port et retirer `type: web` /
  `[http_service]`.** Changerait le type de service sur Render
  (`worker` au lieu de `web`) et la configuration réseau Fly — plus
  risqué à valider sans accès aux tableaux de bord de déploiement du
  projet, alors qu'ouvrir un port supplémentaire est strictement additif
  et sans effet de bord sur le fonctionnement Discord du bot.
  Voir docs/adr/0003 : ce même choix garde la porte ouverte à un futur
  hébergement sur une plateforme qui exige un port HTTP.
- **Alternative rejetée : un framework HTTP (Express).** Une route
  statique ne justifie pas une dépendance supplémentaire ; le module
  `http` intégré suffit entièrement.
- Exposer `client.isReady()` dans la réponse permet aussi un diagnostic
  manuel rapide (`curl` sur le endpoint) sans dépendre des logs.

## Démonstration
```js
// src/server/healthServer.js
server.listen(port, "0.0.0.0", () => { ... });
```
`0.0.0.0` (pas `localhost`) est nécessaire : les health-checkers de
Fly.io/Render sondent depuis l'extérieur du conteneur, un bind sur
`localhost` seul ne serait pas atteignable. Test manuel après
démarrage local : `curl http://localhost:8080/` doit renvoyer
`{"status":"ok","bot":"Mimir#XXXX", ...}` une fois `client.once("ready")`
déclenché.

## Conséquences
- Un port doit rester libre sur l'hôte (déjà le cas, personne d'autre
  n'écoute sur 8080 dans ces déploiements).
- Le endpoint est public sans authentification — c'est acceptable, il
  n'expose que l'état de santé, aucune donnée sensible.

## 🔒 Clause inviolable
Ce serveur HTTP doit rester présent tant que `fly.toml` contient
`[http_service]` ou que `render.yaml` déclare `type: web`. Le supprimer
sans changer ces fichiers de configuration réintroduirait exactement le
bug d'origine (redémarrages silencieux qui ressemblent à des « bugs
vocaux »).
