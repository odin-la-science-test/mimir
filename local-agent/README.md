# Agent de codage local

Permet de déclencher Claude Code à distance depuis Discord (`mimir code
"<chemin>" <tâche>`), exécuté **sur ta machine**, pas dans le cloud —
voir [ADR 0015](../docs/adr/0015-pont-agent-codage-local.md) pour
l'architecture complète et ses limites de sécurité.

## ⚠️ Avant de commencer — lis ça

- **Réservé au propriétaire du bot.** Une seule personne (toi,
  identifié par ton ID Discord) peut déclencher une tâche. Personne
  d'autre sur le serveur ne le peut, même les administrateurs Discord.
- **Aucune restriction de dossier.** Tu peux pointer vers n'importe quel
  projet sur ta machine — l'agent n'a pas de liste blanche de chemins
  autorisés. Une instruction ambiguë ou une erreur de manipulation peut
  affecter n'importe quel dossier accessible à ton compte Windows.
- **`--permission-mode acceptEdits`** : Claude Code peut lire et
  modifier des fichiers sans te demander confirmation à chaque étape
  (personne n'est là pour répondre), mais ne peut PAS exécuter de
  commandes shell arbitraires sans y être explicitement autorisé.
- **Lancement manuel uniquement.** Cet agent ne tourne QUE quand tu
  l'as lancé toi-même. Ferme-le (Ctrl+C) quand tu n'en as plus besoin.

## Installation (une seule fois)

1. Assure-toi d'avoir Claude Code installé et connecté :
   ```powershell
   claude login
   ```
2. Copie le fichier d'exemple et remplis les valeurs :
   ```powershell
   cp local-agent/env.example local-agent/.env
   ```
3. Dans `local-agent/.env` :
   - `BOT_WS_URL` : déjà pré-rempli avec `wss://mimir-bot.fly.dev/agent-bridge`
   - `LOCAL_AGENT_TOKEN` : colle la même valeur que le secret
     `LOCAL_AGENT_TOKEN` configuré sur Fly.io (généré une fois, voir
     README.md racine du projet)

## Utilisation

```powershell
.\local-agent\connect-discord.ps1
```

Laisse la fenêtre ouverte. Depuis Discord (avec ton compte, celui
configuré comme `OWNER_DISCORD_ID`) :

```
mimir code "C:\projets\mon-app" ajoute un bouton de connexion sur la page d'accueil
```

Le bot répond immédiatement pour confirmer que la tâche est envoyée,
puis à nouveau quand elle est terminée (ça peut prendre plusieurs
minutes selon la complexité).

Ctrl+C dans le terminal pour arrêter l'agent — le bot te préviendra
alors qu'aucun agent n'est connecté si tu retentes `mimir code` entre
temps.

## Dépannage

- **"Aucun agent de codage local n'est connecté"** → l'agent n'est pas
  lancé, ou la connexion a coupé (l'agent retente automatiquement
  toutes les 5 secondes, regarde le terminal).
- **"Le dossier n'existe pas sur cette machine"** → le chemin donné
  dans la commande Discord doit exister sur LA MACHINE OÙ TOURNE
  L'AGENT (la tienne), pas sur le serveur Fly.io.
- **"Impossible de lancer Claude Code"** → vérifie que `claude` est
  dans ton PATH (`claude --version` doit fonctionner dans un terminal
  normal) et que tu es connecté (`claude login`).
