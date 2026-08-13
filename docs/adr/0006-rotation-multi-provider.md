# ADR 0006 — Rotation multi-provider IA

## Statut
Accepté — inviolable sur l'ordre de rotation et le déclencheur (429).

## Contexte
Chaque provider IA gratuit (Gemini, Groq, Mistral) impose un quota
quotidien ou mensuel. Un bot Discord actif sur plusieurs serveurs peut
épuiser le quota d'un seul provider en quelques heures, après quoi
toute requête échoue avec une erreur 429 tant que le quota ne se
réinitialise pas — inacceptable pour un bot censé répondre en continu.

## Décision
`callAIGenerateContent()` (`src/ai/providers.js`) maintient un état de
rotation global (`currentProvider`, `currentGeminiIndex`,
`currentMistralIndex`) et, sur toute erreur contenant `429`, `quota` ou
`rate limit`, appelle `switchToNextProvider()` puis retente
immédiatement avec le nouveau provider, dans cet ordre :
**Gemini (clé 1 → clé N) → Groq → Mistral (clé 1 → clé N) → retour à
Gemini**. Chaque provider/clé n'est tenté qu'une fois par appel
(`maxRetries` = nombre total de clés disponibles), pour ne jamais boucler
indéfiniment si tous les quotas sont épuisés.

Groq et Mistral partagent un seul appelant HTTP paramétré
(`callOpenAICompatibleAPI`) car les deux exposent une API
`/chat/completions` au format identique (compatible OpenAI) : dupliquer
cette fonction pour chaque provider aurait été une duplication pure sans
différence fonctionnelle.

## Justification
- **Alternative rejetée : un seul provider avec échec direct.** Plus
  simple, mais un 429 unique rendrait le bot muet jusqu'à la
  réinitialisation quotidienne du quota — inacceptable pour un service
  censé être disponible.
- **Alternative rejetée : répartition aléatoire ou round-robin dès la
  première requête** (au lieu de rotation seulement sur échec). Gemini
  offre le meilleur rapport qualité/quota dans ce projet ; y rester par
  défaut et ne basculer qu'en cas d'échec maximise l'usage du quota le
  plus généreux avant de puiser dans les autres.
- **Ordre Gemini → Groq → Mistral, pas un autre.** Gemini a le plus de
  clés cumulables (3, contre 1 pour Groq) et un quota par clé plus
  généreux pour ce projet ; Groq est extrêmement rapide mais une seule
  clé donc épuisable vite en usage concurrent ; Mistral sert de dernier
  recours car son quota mensuel (pas quotidien) ne se régénère pas aussi
  vite si épuisé.

## Démonstration
`switchToNextProvider()` retourne `false` si tous les providers/clés ont
été essayés dans le cycle courant, ce que `callAIGenerateContent`
traduit en erreur explicite listant l'état de chaque provider
(`Gemini: N clé(s), Groq: configuré/non configuré, Mistral: N clé(s)`)
plutôt qu'un message générique — un opérateur qui lit les logs sait
immédiatement s'il doit ajouter des clés ou attendre la réinitialisation.
La mutualisation Groq/Mistral (`callOpenAICompatibleAPI`) est vérifiable
par lecture : les deux fonctions exportées (`callGroqAPI`,
`callMistralAPI`) ne sont que des applications partielles de la même
fonction avec une URL et un nom de provider différents — aucune
divergence de comportement entre elles n'est possible par construction.

## Conséquences
- L'état de rotation (`currentProvider`, index de clé) est un état
  process global, pas persistant : un redémarrage repart toujours sur
  Gemini clé 0, même si la rotation avait avancé avant l'arrêt. C'est
  acceptable : le quota se réinitialise de toute façon quotidiennement
  pour Gemini/Groq.
- Un appel qui échoue pour une raison AUTRE qu'un quota dépassé
  (erreur réseau, prompt invalide) n'entraîne PAS de rotation — il
  remonte directement, pour ne pas masquer un vrai bug derrière un
  changement de provider qui ne le corrigerait pas.

## 🔒 Clause inviolable
La rotation ne doit se déclencher QUE sur une erreur de quota
(429/quota/rate limit), jamais sur une erreur générique. Élargir ce
déclencheur masquerait des bugs réels (prompt malformé, clé invalide)
derrière un changement de provider qui ne les résout pas et complique le
diagnostic.
