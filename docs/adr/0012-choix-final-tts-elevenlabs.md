# ADR 0012 — Choix final du provider TTS : ElevenLabs

## Statut
Accepté — inviolable sur la conclusion (ne pas revenir sur Piper sans
revoir la RAM disponible, ne pas revenir sur Google sans en discuter le
coût carte bancaire avec l'opérateur du bot).

## Contexte
Suite à l'ADR 0011 (diagnostic du blocage Edge TTS sur Fly.io), trois
alternatives ont été examinées en conditions réelles, chacune écartée
pour une raison concrète et vérifiée — pas par préférence arbitraire :

**1. Google Cloud TTS** (implémenté dans `src/voice/googleTts.js`,
toujours disponible en option). Techniquement solide : tier gratuit
permanent de 4M caractères/mois pour les voix Standard, largement
suffisant pour l'usage réel d'un bot Discord. Écarté comme choix
**par défaut** car Google exige une carte bancaire enregistrée pour
activer l'API, même pour rester dans le tier gratuit — contrainte que
l'opérateur de ce bot a explicitement refusée.

**2. Piper TTS auto-hébergé** (exploré, jamais implémenté). Le dépôt
historique (`rhasspy/piper`, binaire autonome léger) est **archivé
depuis le 6 octobre 2025** — recherche effectuée le 13 août 2026,
confirmée sur la page GitHub du projet ("This repository was archived
by the owner... It is now read-only"). Le fork activement maintenu
(`OHF-Voice/piper1-gpl`, licence GPL-3.0) se distribue désormais via
`pip install piper-tts`, pas un binaire autonome : l'intégrer
demanderait d'ajouter Python3 + pip + le runtime ONNX à l'image Docker
(+300-500 Mo estimés), et de faire tourner Node.js + Discord.js +
ffmpeg + un processus Python/ONNX simultanément sur la machine Fly.io
actuelle (`shared-cpu-1x`, 256 Mo de RAM — voir `fly.toml`). Le palier
suivant chez Fly.io (`shared-cpu-2x`, 512 Mo, vérifié via
`flyctl platform vm-sizes`) est un changement de machine payant :
Piper aurait donc simplement déplacé le coût refusé (carte Google) vers
un autre poste (facture Fly.io plus élevée), sans le supprimer.

**3. ElevenLabs.** Tier gratuit sans carte bancaire à la création du
compte (à vérifier par l'opérateur au moment de l'inscription — voir
note de transparence ci-dessous), ~10 000 caractères/mois, API REST
simple (`POST /v1/text-to-speech/{voice_id}`, header `xi-api-key`,
réponse en octets audio bruts). Retenu comme provider par défaut.

## Décision
`src/voice/tts.js::synthesizeSpeechBuffer()` essaie les providers dans
cet ordre, chacun activé uniquement si sa clé est présente :
**ElevenLabs → Google Cloud TTS → Microsoft Edge TTS**. Google Cloud
reste dans le code (déjà implémenté et testé, ADR 0011) plutôt que
supprimé : c'est une option fonctionnelle pour quiconque accepterait
d'y associer une carte plus tard, sans coût de maintenance significatif
puisqu'elle reste inactive tant qu'aucune clé n'est fournie.

## Justification
- **Pourquoi ElevenLabs en tête plutôt que Google, alors que Google a un
  quota gratuit plus large (4M vs 10k caractères/mois) ?** Parce que le
  critère décisif pour l'opérateur de ce bot n'était pas le volume mais
  l'absence de carte bancaire à fournir. Un quota bas mais atteignable
  sans friction d'inscription passe avant un quota large qui exige une
  démarche refusée.
- **Pourquoi ne pas insister sur Piper malgré son coût nul en usage
  (pas de quota, pas de facturation à la requête) ?** Parce que "coût
  nul en usage" n'est pas la même chose que "coût nul tout court" — le
  coût se serait simplement déplacé vers l'infrastructure (upgrade de
  machine payant) et la complexité opérationnelle (processus Python à
  maintenir, image Docker alourdie, risque de plantage mémoire). Un
  choix rejeté sur un critère (carte bancaire) ne doit pas être remplacé
  par un autre choix qui viole implicitement ce même critère par un
  chemin détourné.
- **Google Cloud gardé dans le code plutôt que retiré** : contrairement
  au SDK `@google-cloud/text-to-speech` retiré dans l'ADR 0001 (dead
  code, jamais appelé), l'intégration REST de l'ADR 0011 est
  fonctionnelle et testée — la retirer maintenant détruirait un travail
  valide pour un hypothétique futur changement d'avis sur la carte
  bancaire, sans bénéfice de simplicité proportionné.

## Démonstration
- Statut d'archivage de `rhasspy/piper` vérifié directement sur la page
  GitHub du dépôt (bannière d'archivage explicite), pas déduit.
- Distribution pip du fork actif vérifiée via la documentation officielle
  `OHF-Voice/piper1-gpl` (`docs/CLI.md`) : `pip install piper-tts`,
  invocation `python3 -m piper -m <voix> -f <fichier> -- '<texte>'`.
- Paliers de machine Fly.io vérifiés en direct via
  `flyctl platform vm-sizes` (256 Mo → 512 Mo implique de passer de
  `shared-cpu-1x` à `shared-cpu-2x`, pas un simple réglage gratuit).
- Format de réponse ElevenLabs (octets audio bruts, pas de JSON/base64
  comme Google) vérifié via la documentation API officielle avant
  d'écrire `src/voice/elevenLabsTts.js` — aucun champ deviné.

## Conséquences
- Le quota ElevenLabs gratuit (~10 000 caractères/mois) est bas : à
  raison de quelques centaines de caractères par réponse vocale, ça
  représente environ 30 à 50 réponses vocales par mois avant blocage.
  Au-delà, `synthesizeWithElevenLabs` remonte l'erreur HTTP de
  l'API (402/429 selon le cas) telle quelle, sans tentative de repli
  automatique vers Edge TTS (cohérent avec le principe de l'ADR 0011 :
  pas d'essai-échec caché qui masquerait la cause réelle à l'opérateur).
- L'audio généré via le tier gratuit ElevenLabs impose une attribution
  ElevenLabs et exclut un usage commercial du contenu généré (conditions
  de leur offre gratuite) — sans incidence pour un bot Discord
  communautaire non commercial, à réévaluer si l'usage change.

## 🔒 Clause inviolable
Ne pas réintroduire Piper (ou tout autre TTS auto-hébergé basé sur un
runtime ML lourd type ONNX/PyTorch) sans revoir explicitement la taille
de la machine Fly.io (`fly.toml [[vm]] memory`) au moment de l'ajout —
l'estimation mémoire de cet ADR n'est qu'une estimation à date, pas une
mesure en conditions réelles.
