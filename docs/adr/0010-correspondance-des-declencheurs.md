# ADR 0010 — Correspondance des mots déclencheurs

## Statut
Accepté — inviolable pour les déclencheurs courts/génériques.

## Contexte
Le routeur (`src/discord/router.js`) reconnaît des intentions
(« rejoindre le vocal », « bannir », « générer une image »...) en
cherchant des mots-clés comme sous-chaînes du message
(`lowerPrompt.includes(t)`). C'est fiable pour des phrases de plusieurs
mots (`"rejoins le vocal"` ne peut apparaître par accident), mais
dangereux pour des mots courts et génériques : les déclencheurs
historiques `"come"` et `"viens"` (rejoindre le vocal) matchent en
sous-chaîne n'importe quel mot qui les contient. Exemples réels de faux
positifs avec l'ancienne logique :
- `"mimir awesome, merci !"` → contient `"come"` (dans **a-w-e-s-o-m-e**)
  → déclencherait à tort une tentative de connexion vocale.
- `"mimir tu reviens quand ?"` → contient `"viens"` (dans **re-viens**)
  → même faux positif.

## Décision
`src/triggers.js` distingue deux modes de correspondance :
- `includesAny(text, phrases)` : sous-chaîne classique, réservée aux
  déclencheurs **multi-mots** où le risque de faux positif est
  négligeable (`"rejoins le vocal"`, `"quitte le vocal"`, etc.).
- `includesWord(text, words)` : correspondance par **frontière de mot**
  Unicode-safe (regex `(?<![\p{L}\p{N}])mot(?![\p{L}\p{N}])`), réservée
  aux déclencheurs courts et génériques (`"come"`, `"viens"`).

`isJoinVoiceTrigger()` combine les deux : phrases explicites en
sous-chaîne + mots courts en frontière de mot.

## Justification
- **Alternative rejetée : tout passer en correspondance de mot entier.**
  Aurait cassé des déclencheurs légitimes qui ne sont PAS des mots isolés
  dans l'usage réel attendu — par exemple `"image :"` (avec les deux
  points collés) ne serait plus détecté par une frontière de mot standard
  incluant la ponctuation dans le motif recherché. Le risque de faux
  positif ne concerne que les mots courts et génériques ; le traiter
  au cas par cas évite de complexifier ou fragiliser les déclencheurs
  qui fonctionnaient déjà correctement.
- **Alternative rejetée : supprimer purement `"come"`/`"viens"`** et
  garder seulement les phrases complètes. Aurait réduit la flexibilité
  du langage naturel accepté (dire juste « mimir viens ! » est une
  formulation naturelle et courte qu'on veut continuer à reconnaître) —
  le vrai problème n'était pas ces mots eux-mêmes, mais l'absence de
  frontière de mot dans leur détection.
- **Regex avec lookaround plutôt que `\b` standard.** `\b` en JavaScript
  est défini par rapport à `\w` (`[A-Za-z0-9_]`), qui EXCLUT les lettres
  accentuées — un mot français adjacent à un caractère accentué
  (`"reviens"` avec un accent ailleurs dans la phrase, ou un mot suivant
  accentué) pourrait produire une frontière incorrecte. Les classes
  Unicode `\p{L}\p{N}` avec lookaround (`(?<!...)...(?!...)`) couvrent
  correctement l'alphabet français et au-delà.

## Démonstration
```js
new RegExp(`(?<![\\p{L}\\p{N}])come(?![\\p{L}\\p{N}])`, "iu").test("mimir awesome, merci")
// → false (aucune frontière de mot autour de "come" dans "awesome")

new RegExp(`(?<![\\p{L}\\p{N}])come(?![\\p{L}\\p{N}])`, "iu").test("mimir come voir ça")
// → true ("come" est bien un mot isolé)
```
Ces deux cas correspondent exactement aux exemples de faux positif et de
vrai positif cités en contexte — la correction est vérifiable par simple
exécution de la regex, sans dépendre d'un framework de test.

## Conséquences
- Deux fonctions de correspondance à choisir consciemment pour tout
  nouveau déclencheur, plutôt qu'une seule évidente — coût cognitif
  mineur, mais nécessaire : la ADR 0007 (documents) et 0008 (PDF)
  utilisent volontairement `includesAny` car leurs déclencheurs sont
  tous des phrases de 2+ mots.

## 🔒 Clause inviolable
Tout nouveau déclencheur d'un seul mot générique (susceptible d'apparaître
comme sous-chaîne d'un mot courant, français ou anglais) DOIT utiliser
`includesWord`, jamais `includesAny`. En cas de doute sur le risque de
faux positif d'un mot court, traiter comme générique par défaut (utiliser
`includesWord`) plutôt que de supposer qu'il est sûr.
