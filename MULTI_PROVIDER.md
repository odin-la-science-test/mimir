# 🤖 Rotation Intelligente Multi-Provider

Mimir utilise maintenant un système de **rotation automatique** entre plusieurs providers IA gratuits pour maximiser les quotas disponibles.

## 🎯 Comment ça marche

Le bot bascule automatiquement entre les providers dans cet ordre :

```
Gemini (clé 1,2,3) → Groq → Mistral (clé 1,2) → retour à Gemini
```

**Quand un provider atteint sa limite (erreur 429)**, le bot passe automatiquement au suivant **sans interruption de service** !

---

## 📊 Quotas Disponibles

| Provider | Quota Gratuit | Vitesse | Spécialité |
|----------|---------------|---------|------------|
| **Gemini** | ~20-50 req/jour/clé | Rapide (40 tok/s) | Polyvalent, gratuit |
| **Groq** | 14 400 req/jour | Ultra rapide (500 tok/s) | Performance brute |
| **Mistral** | ~1M tokens/mois/clé | Rapide | Excellent en français |

### Avec la configuration recommandée :
- **3 clés Gemini** : ~60-150 requêtes/jour
- **1 clé Groq** : 14 400 requêtes/jour 🔥
- **2 clés Mistral** : ~2M tokens/mois

**TOTAL : Des milliers de requêtes gratuites par jour !** 🚀

---

## 🔧 Configuration

### 1. Obtenir les clés API

#### Gemini (Google)
- Site : https://aistudio.google.com/apikey
- Gratuit, sans carte bancaire
- Tu peux créer plusieurs projets Google pour avoir plusieurs clés
- Quota : ~20-50 requêtes/jour par clé

#### Groq
- Site : https://console.groq.com
- Gratuit, sans carte bancaire
- Quota : 14 400 requêtes/jour (très généreux !)
- Ultra rapide : 500 tokens/seconde

#### Mistral AI
- Site : https://console.mistral.ai
- Gratuit, sans carte bancaire
- Quota : ~1M tokens gratuits/mois par clé
- Excellent en français

### 2. Configurer le fichier .env

Ouvre `.env` et ajoute tes clés :

```env
# Gemini : sépare plusieurs clés par des virgules
GEMINI_API_KEY=ta_clé_1,ta_clé_2,ta_clé_3

# Groq : une seule clé suffit (quota très généreux)
GROQ_API_KEY=ta_clé_groq

# Mistral : sépare plusieurs clés par des virgules
MISTRAL_API_KEY=ta_clé_mistral_1,ta_clé_mistral_2
```

### 3. Déployer sur Fly.io

Lance le script automatique :

```powershell
.\update-secrets.ps1
```

Le bot redémarre automatiquement avec toutes les clés configurées !

---

## 📝 Logs du Bot

Au démarrage, le bot affiche :

```
🤖 Configuration des providers IA :
   ✅ Gemini: 3 clé(s) configurée(s)
   ✅ Groq: 1 clé configurée (14 400 req/jour, ultra rapide)
   ✅ Mistral: 2 clé(s) configurée(s)

✅ Mimir est en ligne : Mìmir#3419
🔮 Déclencheur : messages commençant par "mimir"
🔄 Rotation intelligente activée : Gemini(3) → Groq → Mistral(2)
```

Quand un quota est dépassé :

```
⚠️ Quota dépassé pour gemini
🔄 Basculement : Gemini → Groq
🤖 Tentative 4/6 : groq (llama-3.3-70b-versatile)
```

---

## 🎮 Utilisation

**Rien ne change pour l'utilisateur !** Le bot fonctionne exactement pareil, mais avec beaucoup plus de quota disponible.

```
mimir bonjour
mimir dessine un dragon
mimir csv ventes 2024
```

Le bot choisit automatiquement le meilleur provider disponible.

---

## ⚙️ Configuration Minimale

Tu n'es **pas obligé** de configurer tous les providers. Le bot fonctionne avec :

- **Minimum** : 1 clé Gemini OU 1 clé Groq OU 1 clé Mistral
- **Recommandé** : Gemini + Groq (combo parfait gratuit)
- **Optimal** : Gemini (3) + Groq + Mistral (2) = quota maximal

---

## 🔍 Dépannage

### Le bot ne démarre pas

Vérifie que tu as au moins **une** clé API configurée :

```bash
# Dans .env, au moins une de ces lignes doit être remplie :
GEMINI_API_KEY=...
GROQ_API_KEY=...
MISTRAL_API_KEY=...
```

### Erreur "Tous les quotas IA sont épuisés"

Tous les providers ont atteint leur limite. Solutions :
1. Attendre la réinitialisation quotidienne (minuit UTC)
2. Ajouter plus de clés API dans `.env`
3. Créer de nouveaux comptes Google/Groq/Mistral

### Le bot utilise toujours Gemini

C'est normal ! Gemini est le provider par défaut. Les autres sont utilisés uniquement quand Gemini atteint sa limite.

---

## 📚 Modèles Utilisés

- **Gemini** : `gemini-2.5-flash` (configurable via `GEMINI_MODEL`)
- **Groq** : `llama-3.3-70b-versatile` (excellent, gratuit)
- **Mistral** : `mistral-small-latest` (bon compromis)

Ces modèles sont optimisés pour être gratuits, rapides et performants.

---

## 💡 Astuces

### Maximiser le quota Gemini

Crée plusieurs projets Google AI Studio avec le même compte Google :
1. Va sur https://aistudio.google.com
2. Crée un nouveau projet
3. Génère une clé API
4. Répète pour avoir 3-5 clés

### Tester la rotation

Lance le bot localement et spam des requêtes pour voir la rotation en action :

```
mimir test 1
mimir test 2
... (continue jusqu'à épuiser le quota Gemini)
```

Tu verras dans les logs le passage automatique à Groq puis Mistral.

---

## 🆘 Support

- **Problème de configuration ?** Vérifie `MULTI_PROVIDER.md` (ce fichier)
- **Quota épuisé ?** Lance `.\update-secrets.ps1` après avoir ajouté de nouvelles clés
- **Bug ?** Vérifie les logs avec `.\logs.ps1`

---

**Créé avec ❤️ pour Mimir - Le bot Discord IA 100% gratuit**
