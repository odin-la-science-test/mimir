# ADR 0009 — Lecture intelligente des salons Discord

## Statut
Accepté.

## Contexte
Le bot doit pouvoir répondre en s'appuyant sur le contenu récent d'un
salon Discord, à trois granularités différentes : un salon précis, le
salon courant, ou tout le serveur. Une version antérieure ne gérait que
deux cas : une vraie mention Discord de salon (`#salon`, celle qui
devient bleue/cliquable après sélection dans l'auto-complétion du
client) et la phrase « tout le serveur ». Un problème non résolu : si
l'utilisateur tape `#nom-du-salon` en texte brut **sans** le sélectionner
dans l'auto-complétion (ce qui arrive facilement — sur mobile, en copiant-
collant, ou simplement en tapant vite), `message.mentions.channels` reste
vide et le bot ignore silencieusement l'intention de l'utilisateur, sans
aucune indication de ce qui s'est mal passé.

## Décision
`src/channels/contextReader.js` résout un salon désigné dans cet ordre :
1. Vraie mention Discord (`message.mentions.channels.first()`), comme
   avant.
2. **Filet de secours** : si aucune mention réelle, extraction d'un motif
   `#nom-de-salon` par regex dans le texte brut, puis résolution par nom
   exact (insensible à la casse) parmi les salons texte visibles du
   serveur (`resolveChannelByName`).
3. Le salon courant, si la phrase contient « ce salon »/« ici »/etc. ou
   par défaut si aucun salon n'a pu être identifié autrement.
4. Tout le serveur (échantillon de `GLOBAL_SEARCH_MAX_CHANNELS` salons ×
   `GLOBAL_SEARCH_MESSAGES_PER_CHANNEL` messages), sur les déclencheurs
   « tout le serveur »/« tous les salons »/etc.

De nouvelles phrases explicites (« lis le salon », « résume ce salon »,
« que dit le salon », « quels salons existent ») sont ajoutées comme
point d'entrée dédié (`handleChannelReadRequest`), en complément — pas en
remplacement — du mécanisme implicite (mention de salon dans une
question normale).

## Justification
- **Alternative rejetée : exiger une vraie mention dans tous les cas.**
  C'était le comportement précédent — fonctionnel mais fragile à l'usage
  réel, où taper `#salon` sans sélection d'auto-complétion est une
  erreur utilisateur courante et bénigne qui ne devrait pas se traduire
  par un silence total.
- **La résolution par nom est un filet de secours, pas le mécanisme
  principal** : elle ne s'active que si aucune vraie mention n'est
  trouvée, pour ne jamais entrer en conflit avec le cas normal (mention
  réelle = intention non ambiguë, toujours prioritaire).
- **Salons ignorés silencieusement en cas de permission manquante**
  (`getGlobalServerContext`, `catch { continue; }`) : cohérent avec
  l'idée que le bot répond du mieux qu'il peut avec ce qu'il PEUT voir,
  plutôt que d'échouer entièrement parce qu'un seul salon sur quinze
  lui est inaccessible.

## Démonstration
```js
function extractTypedChannelName(text) {
  const match = text.match(/#([\p{L}\p{N}_-]+)/u);
  return match ? match[1] : null;
}
```
Le flag Unicode (`/u`) et les classes `\p{L}\p{N}` couvrent les noms de
salon accentués ou non-latins, pas seulement `[a-z0-9-]` — un salon nommé
`#général` ou `#日本語` est résolu correctement, pas seulement les noms
ASCII. `resolveChannelByName` compare en minuscules des deux côtés
(`c.name.toLowerCase() === cleaned`), donc insensible à la casse comme
le reste des déclencheurs du bot.

## Conséquences
- Un nom de salon ambigu (deux salons au nom identique dans des
  catégories différentes — rare mais possible) résout sur le premier
  trouvé dans le cache, sans désambiguïsation. Acceptable : Discord
  déconseille déjà les noms de salon dupliqués sur un même serveur pour
  d'autres raisons d'UX.
- Le coût d'un appel `messages.fetch` supplémentaire par tentative de
  résolution est négligeable comparé au coût de l'appel IA qui suit.

## 🔒 Clause inviolable
La résolution par nom de salon (étape 2) ne doit jamais devenir
prioritaire sur une vraie mention Discord (étape 1) : une vraie mention
est un signal non ambigu de l'intention utilisateur (sélectionnée
explicitement dans l'UI Discord) et doit toujours primer sur une
inférence textuelle.
