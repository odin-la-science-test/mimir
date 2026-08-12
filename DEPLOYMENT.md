# 🚀 Déploiement sur Fly.io (Gratuit 24/7)

## Pourquoi Fly.io ?
- ✅ **Toujours actif** (ne s'endort JAMAIS)
- ✅ Complètement gratuit pour petites apps
- ✅ 3 VMs gratuites (1 suffit pour le bot)
- ✅ 160GB bande passante/mois gratuite
- ✅ Hébergement mondial (Paris, London, Frankfurt...)

---

## 📋 Prérequis

1. Un compte Fly.io (gratuit, sans carte bancaire)
2. Git installé
3. Ton code déjà poussé sur GitHub

---

## 🔧 Installation de Fly CLI

### Windows (PowerShell en admin)
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### macOS/Linux
```bash
curl -L https://fly.io/install.sh | sh
```

Ferme et rouvre ton terminal après l'installation.

---

## 🚀 Déploiement (Étape par étape)

### 1. Connecte-toi à Fly.io
```bash
fly auth login
```
Une page web s'ouvre → Crée un compte ou connecte-toi (gratuit, sans CB).

---

### 2. Lance ton app depuis le dossier du projet
```bash
cd mimir-bot
fly launch
```

Fly va te poser quelques questions :
- **Choose an app name** : Appuie sur Entrée (génère un nom aléatoire) ou tape "mimir-bot-tonnom"
- **Choose a region** : Tape `cdg` pour Paris (ou `lhr` pour London, `fra` pour Frankfurt)
- **Would you like to set up a Postgresql database?** → **Non** (tape `n`)
- **Would you like to set up an Upstash Redis database?** → **Non** (tape `n`)
- **Would you like to deploy now?** → **Non** (tape `n`) — on va d'abord configurer les secrets

---

### 3. Configure les variables d'environnement secrètes

```bash
fly secrets set DISCORD_TOKEN="ton_token_discord_ici"
fly secrets set GEMINI_API_KEY="ta_cle_gemini_ici"
fly secrets set GROQ_API_KEY="ta_cle_groq_ici"
```

⚠️ **Important** : Remplace les valeurs par tes vraies clés (garde les guillemets).

Pour vérifier que c'est bien configuré :
```bash
fly secrets list
```

---

### 4. Déploie ton bot 🚀

```bash
fly deploy
```

Le déploiement prend 2-3 minutes. Fly construit l'image Docker et lance le bot.

---

### 5. Vérifie que le bot tourne

```bash
fly status
```

Tu devrais voir `Status: running` ✅

Pour voir les logs en temps réel :
```bash
fly logs
```

Tu devrais voir :
```
✅ Mimir est en ligne : Mimir#1234
🔮 Déclencheur : messages commençant par "mimir"
```

---

## 📊 Commandes utiles

### Voir les logs en direct
```bash
fly logs
```

### Redémarrer le bot
```bash
fly apps restart mimir-bot
```

### Voir l'état de la machine
```bash
fly status
```

### Ouvrir le dashboard web
```bash
fly dashboard
```

### Mettre à jour le bot (après un changement de code)
```bash
git add .
git commit -m "Update bot"
git push
fly deploy
```

### Changer une variable d'environnement
```bash
fly secrets set GEMINI_MODEL="gemini-2.0-flash-exp"
```

### Supprimer l'app (si tu veux tout recommencer)
```bash
fly apps destroy mimir-bot
```

---

## 🐛 Dépannage

### Le bot ne démarre pas
```bash
fly logs
```
Lis les logs pour voir l'erreur (souvent : clé API manquante ou invalide).

### "Error: no such app"
Tu n'es pas dans le bon dossier. Fais :
```bash
cd mimir-bot
```

### Le bot s'est arrêté
Fly gratuit garde 1 machine active en permanence. Vérifie avec :
```bash
fly status
```
Si Status = `stopped`, redémarre avec :
```bash
fly apps restart
```

### Besoin de plus de RAM
Le plan gratuit donne 256MB. Si le bot crash (Out of Memory), augmente :
```bash
fly scale memory 512
```
(toujours gratuit jusqu'à 1GB sur 1 machine)

---

## 💰 Coûts (GRATUIT)

Le plan gratuit Fly.io inclut :
- 3 machines partagées (1 suffit pour ce bot)
- 256MB RAM par machine
- 160GB transfert/mois
- Toujours actif 24/7 (ne s'endort jamais)

**Ton bot Discord consomme :**
- ~50-100MB RAM
- Quelques MB/jour de bande passante
- **= Complètement gratuit** 🎉

---

## 🔒 Sécurité

✅ Les secrets (tokens, clés API) sont chiffrés par Fly.io
✅ Jamais dans le code source ni sur GitHub
✅ Le `.env` local n'est pas déployé (bloqué par `.dockerignore`)

---

## 📝 Notes

- Le bot redémarre automatiquement en cas de crash
- Les logs sont gardés 7 jours sur Fly.io
- Tu peux avoir plusieurs bots gratuits (3 machines gratuites au total)
- Pas besoin de carte bancaire pour rester sur le plan gratuit

---

## 🎯 Résumé rapide (TL;DR)

```bash
# 1. Installe Fly CLI
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# 2. Connecte-toi
fly auth login

# 3. Lance l'app
cd mimir-bot
fly launch

# 4. Configure les secrets
fly secrets set DISCORD_TOKEN="..."
fly secrets set GEMINI_API_KEY="..."
fly secrets set GROQ_API_KEY="..."

# 5. Déploie
fly deploy

# 6. Vérifie
fly logs
```

**C'est tout !** Ton bot tourne maintenant 24/7 gratuitement. 🚀
