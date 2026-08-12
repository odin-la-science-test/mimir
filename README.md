# 🔮 Mimir — Bot Discord IA (Gemini, gratuit)

Bot Discord qui répond via l'API Gemini de Google dès qu'un message
commence par **"mimir"**.

Exemple :
```
mimir explique-moi la différence entre une PCR et une qPCR
```

## 1. Créer le bot Discord

1. Va sur https://discord.com/developers/applications → **New Application**
2. Onglet **Bot** → **Reset Token** → copie le token (tu le mets dans `.env`)
3. Active **MESSAGE CONTENT INTENT** (obligatoire, en bas de l'onglet Bot)
4. Onglet **OAuth2 > URL Generator** :
   - Scopes : `bot`
   - Permissions : `Send Messages`, `Read Message History`, `View Channels`,
     `Ban Members`, `Kick Members`, `Moderate Members` (pour la modération,
     voir plus bas)
5. Ouvre l'URL générée pour inviter le bot sur ton serveur

## 2. Obtenir une clé Gemini gratuite

1. Va sur https://aistudio.google.com/apikey
2. Connecte-toi avec un compte Google → **Create API key**
3. Aucune carte bancaire requise pour le tier gratuit

## 3. Installer et lancer le bot

```bash
cd mimir-bot
npm install
cp .env.example .env
```

Ouvre `.env` et colle ton `DISCORD_TOKEN` et ton `GEMINI_API_KEY`.

```bash
npm start
```

Si tout est bon, tu verras dans le terminal :
```
✅ Mimir est en ligne : Mimir#1234
🔮 Déclencheur : messages commençant par "mimir"
```

## Lire tout le serveur (nouveau)

En plus de mentionner un salon précis avec `#nom-du-salon`, tu peux demander
un aperçu de **tout le serveur** en incluant une des phrases suivantes dans
ta demande :
- "tout le serveur"
- "tous les salons"
- "tous les canaux"

Exemple :
```
mimir fais-moi un résumé de ce qui s'est passé sur tout le serveur aujourd'hui
```

Le bot lit alors un échantillon récent (15 messages) de chaque salon texte
auquel il a accès (max 15 salons, pour ne pas saturer le prompt envoyé à
Gemini ni prendre trop de temps).

## Génération d'images (amélioré)

Utilise un mot comme "dessine", "génère une image de", "image :" dans ta
demande :
```
mimir dessine un dragon dans un style dark fantasy
mimir image : un labo de biologie futuriste
mimir dessine un paysage de montagne en 16:9
```
Généré via **Pollinations.ai** (gratuit, sans clé API), avec quelques
améliorations :
- **Prompt enrichi automatiquement** : ta description brute est d'abord
  réécrite par Gemini en un prompt détaillé (style, éclairage, ambiance)
  pour un bien meilleur rendu — inutile de tout détailler toi-même.
- **Format détecté automatiquement** : ajoute "portrait", "paysage",
  "16:9" ou "9:16" dans ta demande pour changer les proportions (carré
  par défaut).
- **Seed aléatoire** à chaque génération, pour ne pas retomber sur une
  image mise en cache par Pollinations pour un prompt similaire.
- **Nouvelle tentative automatique** en cas d'échec temporaire du service.

## CSV + graphiques (nouveau)

Utilise "csv", "graphique", "diagramme" ou "tableau de données" dans ta
demande :
```
mimir csv des ventes : janvier 100, février 150, mars 200, avec un graphique en barres
mimir graphique en camembert de la répartition budget marketing 40%, dev 35%, ops 25%
```
Le bot demande à Gemini de structurer les données, génère un fichier `.csv`
téléchargeable et un graphique (image) via **QuickChart.io** (gratuit,
sans clé). Fonctionne mieux si tu donnes des valeurs précises dans ta
demande — sinon Gemini invente des données plausibles.

## Réponses vocales (nouveau)

Une fois que Mimir a rejoint un salon vocal (`mimir rejoins le vocal`),
**toutes** ses réponses — pas seulement celles données à l'oral au micro —
sont aussi lues à voix haute automatiquement. Si tu tapes une question
classique dans le texte pendant que Mimir est en vocal, il répond dans
le salon texte **et** la lit à voix haute (le markdown — gras, liens,
blocs de code — est nettoyé avant la lecture pour ne pas lire les
symboles). Si la synthèse échoue, la réponse texte reste affichée
normalement et une erreur est signalée dans le salon.

## Modération : ban, kick, timeout (nouveau)

Mimir peut agir comme modérateur si **toi** tu as la permission Discord
correspondante (le bot vérifie ton rôle, pas juste le sien). Il te faut
juste mentionner la personne (`@pseudo`, en vrai mention cliquable).

```
mimir ban @pseudo comportement toxique
mimir unban 123456789012345678
mimir kick @pseudo spam
mimir timeout @pseudo 10m propos déplacés
mimir mute @pseudo 1h
mimir untimeout @pseudo
mimir unmute @pseudo
```

- **ban** / **unban** : bannissement permanent. `unban` prend l'**ID**
  Discord de la personne (elle n'est plus sur le serveur donc impossible
  de la mentionner) — clic droit sur un profil > "Copier l'ID utilisateur"
  (active le mode développeur dans Discord si l'option n'apparaît pas :
  Paramètres > Avancés > Mode développeur).
- **kick** : expulsion, la personne peut revenir avec une nouvelle invitation.
- **timeout** / **mute** : rend la personne muette (texte + vocal) pendant
  une durée donnée. Formats acceptés : `s` (secondes), `m` (minutes),
  `h` (heures), `j` ou `d` (jours). Max 28 jours (limite Discord).
- **untimeout** / **unmute** : retire un timeout en cours.

⚠️ Permissions requises côté Discord (à activer lors de l'invitation du
bot, section OAuth2 du README) : **Ban Members**, **Kick Members**,
**Moderate Members** (aussi appelée "Timeout Members"). Le bot ne peut
pas agir sur un membre dont le rôle est égal ou supérieur au sien —
place le rôle de Mimir assez haut dans la hiérarchie des rôles du serveur.

## Traducteur (nouveau)

Réagis à **n'importe quel message** avec un emoji drapeau
(🇫🇷 🇬🇧 🇺🇸 🇪🇸 🇩🇪 🇮🇹 🇵🇹 🇯🇵 🇰🇷 🇨🇳 🇷🇺 🇳🇱 🇸🇦 🇮🇳 🇹🇷 🇵🇱)
et Mimir répond avec la traduction dans la langue correspondante.

## Lire un autre salon (nouveau)

Si tu mentionnes un salon avec la vraie mention Discord (tape `#` puis
choisis le salon dans la liste qui apparaît, il devient bleu/cliquable),
Mimir va lire les 50 derniers messages de ce salon et s'en servir comme
contexte pour répondre.

Exemple :
```
mimir fais-moi un résumé du dernier rapport dans #ols-forum-suivi-travail-dev
```

⚠️ Important :
- Ça ne marche qu'avec une **vraie mention** (le salon doit apparaître en bleu
  dans le message envoyé), pas juste le nom tapé en texte.
- Le bot doit avoir la permission **Voir le salon** + **Lire l'historique des
  messages** sur ce salon précis (vérifie ses permissions côté Discord si
  ça ne fonctionne pas).
- Si le bot n'a pas accès, il répond sans le contexte du salon (log
  d'avertissement dans le terminal).

## Fonctionnement

- Le bot ignore tous les messages sauf ceux qui **commencent** par `mimir`
  (insensible à la casse : "Mimir", "MIMIR", "mimir" fonctionnent tous).
- Le mot déclencheur est retiré avant d'envoyer le texte à Gemini.
- Une petite mémoire de conversation (10 derniers échanges) est gardée
  par salon, pour que le bot se souvienne du contexte récent.
- Les réponses trop longues (>2000 caractères) sont automatiquement
  découpées en plusieurs messages.

## Limites du tier gratuit Gemini

Le modèle par défaut (`gemini-2.5-flash`) offre un quota gratuit quotidien
généreux, sans carte bancaire. Si tu dépasses la limite (erreur 429),
attends la réinitialisation quotidienne ou passe temporairement sur un
autre modèle en changeant `GEMINI_MODEL` dans `.env`.

## Héberger le bot en continu (24/7)

En local, le bot s'arrête si tu fermes ton PC. Pour le faire tourner
en permanence, options gratuites/pas chères :
- **Railway** ou **Render** (tier gratuit limité, faciles à configurer)
- Un petit VPS (quelques euros/mois) + `pm2` pour garder le process actif
- Une Raspberry Pi ou un vieux PC à la maison

## Prochaines étapes (pas encore construites)

- **Vocal** (écouter + répondre en voix dans un salon vocal) : nécessite
  des dépendances audio (`@discordjs/voice`, ffmpeg) plus lourdes à
  installer sur Windows. À faire dans un chantier séparé — le bot annoncera
  automatiquement qu'il enregistre dès qu'il rejoint un salon vocal.
- **Coding agent niveau Sonnet 4.5** : un modèle gratuit n'atteint pas ce
  niveau. Pour du vrai code de qualité, utilise **Claude Code** directement
  (terminal, VS Code, ou l'app desktop) plutôt que de faire coder ce bot.

## Personnalisation

- Change `TRIGGER_WORD` dans `index.js` pour un autre mot déclencheur.
- Modifie le `systemInstruction` dans `askGemini()` pour changer la
  personnalité/le ton de Mimir (ex : thème dark fantasy, etc.).
#