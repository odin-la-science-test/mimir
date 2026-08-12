# 📜 Scripts PowerShell pour Mimir

Scripts automatiques pour gérer ton bot facilement sur Fly.io.

---

## 🚀 Premier déploiement

```powershell
.\deploy.ps1
```

**Ce que ce script fait :**
1. ✅ Vérifie que Fly CLI est installé
2. ✅ T'aide à te connecter à Fly.io (ouvre le navigateur)
3. ✅ Te demande tes 3 clés API (Discord, Gemini, Groq)
4. ✅ Crée l'app sur Fly.io (te guide pour les questions)
5. ✅ Configure les secrets (clés API chiffrées)
6. ✅ Déploie le bot
7. ✅ Affiche les logs

**Durée :** 5 minutes (dont 2-3 min de build Docker)

---

## 🔄 Mise à jour du bot (après modification du code)

```powershell
.\update.ps1 "description des changements"
```

Exemple :
```powershell
.\update.ps1 "Ajout d'une nouvelle commande"
```

**Ce que ce script fait :**
1. Commit tes changements
2. Push sur GitHub
3. Redéploie sur Fly.io
4. Affiche les logs

---

## 📊 Voir les logs en temps réel

```powershell
.\logs.ps1
```

Appuie sur **Ctrl+C** pour quitter.

---

## 📈 Vérifier l'état du bot

```powershell
.\status.ps1
```

Affiche :
- État de la machine (running/stopped)
- Liste des apps Fly.io
- Utilisation des ressources (RAM, CPU)

---

## 🛠️ Commandes manuelles utiles

Si tu préfères faire les choses manuellement :

### Voir les logs
```powershell
flyctl logs
```

### Redémarrer le bot
```powershell
flyctl apps restart
```

### Ouvrir le dashboard web
```powershell
flyctl dashboard
```

### Changer une variable d'environnement
```powershell
flyctl secrets set GEMINI_MODEL="gemini-2.0-flash-exp"
```

### Voir les secrets configurés
```powershell
flyctl secrets list
```

### SSH dans la machine (debug avancé)
```powershell
flyctl ssh console
```

### Détruire l'app (pour recommencer de zéro)
```powershell
flyctl apps destroy mimir-bot
```

---

## ❓ Dépannage

### "flyctl: command not found"
**Solution :** Ferme et rouvre PowerShell (ou redémarre ton PC).

### "Error: Could not find App"
**Solution :** Tu n'es pas dans le bon dossier :
```powershell
cd C:\Users\fcb1909-user\Desktop\mimir-bot
```

### "Authentication failed"
**Solution :** Reconnecte-toi :
```powershell
flyctl auth login
```

### Le bot ne démarre pas
**Solution :** Regarde les logs pour voir l'erreur :
```powershell
flyctl logs
```
Erreur commune : clé API manquante ou invalide.

---

## 💡 Conseils

- **Sauvegarde tes clés API** quelque part (gestionnaire de mots de passe)
- **GitHub protège tes secrets** : le fichier `.env` n'est jamais poussé
- **Fly.io chiffre tes secrets** : personne ne peut les voir
- **Le bot redémarre automatiquement** en cas de crash
- **Gratuit à 100%** tant que tu restes sous 256MB RAM

---

## 🎯 Workflow typique

1. **Premier déploiement :** `.\deploy.ps1`
2. **Modifies le code dans `index.js`**
3. **Mets à jour :** `.\update.ps1 "description"`
4. **Vérifies que ça marche :** `.\logs.ps1`

C'est tout ! 🚀
