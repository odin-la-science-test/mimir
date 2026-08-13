# Architecture Decision Records — Mimir

Ces ADR documentent les décisions structurantes du bot : le **pourquoi**
derrière le code, pas seulement le **quoi**. Chacune suit le même format :

- **Contexte** — le problème et les contraintes réelles observées.
- **Décision** — ce qui a été choisi.
- **Justification** — pourquoi ce choix plutôt qu'une alternative.
- **Démonstration** — une preuve concrète (référence de code, calcul, cas
  de test) que la décision fonctionne, pas juste une affirmation.
- **Conséquences** — ce que ce choix coûte ou implique, assumé explicitement.
- **🔒 Clause inviolable** — ce qui ne doit **jamais** être modifié sans
  repasser par un nouvel ADR qui l'abroge explicitement, et pourquoi
  une modification silencieuse casserait quelque chose de non évident.

| ADR | Sujet |
|---|---|
| [0001](0001-architecture-modulaire.md) | Découpage du monolithe en modules |
| [0002](0002-serveur-http-de-health-check.md) | Serveur HTTP de health-check |
| [0003](0003-contrainte-hebergement-vocal-temps-reel.md) | Contrainte d'hébergement du vocal temps réel |
| [0004](0004-protocole-messages-vocaux-natifs.md) | Protocole des messages vocaux natifs Discord |
| [0005](0005-politique-timeout-tts.md) | Timeout et retry de la synthèse vocale |
| [0006](0006-rotation-multi-provider.md) | Rotation multi-provider IA |
| [0007](0007-lecture-de-documents.md) | Lecture de documents (PDF/DOCX/texte) |
| [0008](0008-generation-de-pdf.md) | Génération de PDF |
| [0009](0009-lecture-intelligente-des-salons.md) | Lecture intelligente des salons Discord |
| [0010](0010-correspondance-des-declencheurs.md) | Correspondance des mots déclencheurs |
| [0011](0011-tts-google-cloud-si-edge-bloque.md) | Google Cloud TTS comme provider primaire si configuré |
| [0012](0012-choix-final-tts-elevenlabs.md) | Choix final du provider TTS : ElevenLabs (vs Google/Piper) |
| [0013](0013-cause-reelle-echec-vocal-dave.md) | Cause réelle du vocal temps réel : protocole DAVE manquant (supersède 0003) |
| [0014](0014-limitation-cache-discordjs.md) | Limitation du cache interne de discord.js (fix OOM) |
| [0015](0015-pont-agent-codage-local.md) | Pont vers un agent de codage local (Claude Code) déclenché depuis Discord |
