// ============================================================
// Déclencheurs (mots-clés) utilisés pour router un message vers le bon
// handler, et la logique de correspondance associée.
//
// Voir docs/adr/0010-correspondance-des-declencheurs.md : les déclencheurs
// courts et génériques ("come", "viens") utilisent une correspondance par
// FRONTIÈRE DE MOT plutôt qu'une simple sous-chaîne, pour éviter les faux
// positifs (ex: "mimir bienvenue" contient "venue" mais pas "viens" comme
// mot ; "mimir awesome" contient "come" comme sous-chaîne mais pas comme mot).
// ============================================================

const GLOBAL_SEARCH_TRIGGERS = [
  "tout le serveur",
  "tous les salons",
  "tous les canaux",
  "l'ensemble du serveur",
];

const IMAGE_TRIGGERS = [
  "génère une image",
  "genere une image",
  "génère moi une image",
  "dessine",
  "crée une image",
  "cree une image",
  "image de",
  "image :",
  "image:",
];

const CSV_TRIGGERS = ["csv", "graphique", "diagramme", "tableau de données", "tableau de donnees"];

// Réponse sous forme de VRAI message vocal Discord (bulle audio native),
// pas juste parlé en direct dans un salon vocal.
const VOICE_MESSAGE_TRIGGERS = [
  "message vocal",
  "note vocale",
  "réponds en vocal",
  "reponds en vocal",
  "réponds moi en vocal",
  "reponds moi en vocal",
  "envoie en vocal",
  "envoie ça en vocal",
  "envoie ca en vocal",
  "vocal stp",
  "vocal svp",
];

// Génération de PDF
const PDF_TRIGGERS = [
  "génère un pdf",
  "genere un pdf",
  "crée un pdf",
  "cree un pdf",
  "fais un pdf",
  "exporte en pdf",
  "export pdf",
  "pdf de",
  "pdf sur",
  "en pdf",
];

// Lecture explicite d'un salon (en plus de la mention #salon ou de "tout
// le serveur"). Voir docs/adr/0009-lecture-intelligente-des-salons.md.
const CHANNEL_READ_TRIGGERS = [
  "lis le salon",
  "lis ce salon",
  "résume le salon",
  "resume le salon",
  "résume ce salon",
  "resume ce salon",
  "que dit le salon",
  "que se passe",
  "quels salons",
  "liste les salons",
  "liste des salons",
];

// L'ordre de vérification dans le routeur compte : "unban"/"untimeout"
// doivent être testés AVANT "ban"/"timeout" car ils les contiennent comme
// sous-chaîne.
const BAN_TRIGGERS = ["ban ", "bannis", "banni "];
const UNBAN_TRIGGERS = ["unban", "débannis", "debannis", "dé-bannis"];
const KICK_TRIGGERS = ["kick ", "expulse"];
const TIMEOUT_TRIGGERS = ["timeout", "mute", "réduis au silence", "reduis au silence"];
const UNTIMEOUT_TRIGGERS = [
  "untimeout",
  "unmute",
  "enlève le timeout",
  "enleve le timeout",
  "enlève le mute",
  "enleve le mute",
  "retire le timeout",
  "retire le mute",
];

const FLAG_LANGUAGE_MAP = {
  "🇫🇷": "français",
  "🇬🇧": "anglais",
  "🇺🇸": "anglais",
  "🇪🇸": "espagnol",
  "🇩🇪": "allemand",
  "🇮🇹": "italien",
  "🇵🇹": "portugais",
  "🇯🇵": "japonais",
  "🇰🇷": "coréen",
  "🇨🇳": "chinois (mandarin)",
  "🇷🇺": "russe",
  "🇳🇱": "néerlandais",
  "🇸🇦": "arabe",
  "🇮🇳": "hindi",
  "🇹🇷": "turc",
  "🇵🇱": "polonais",
};

// Déclencheurs courts/génériques qui exigent une correspondance de MOT
// entier (pas de sous-chaîne) pour éviter les faux positifs documentés
// dans l'ADR 0010 (ex: "awesome" contient "come", "bienvenue" ne contient
// pas "viens" mais un mot proche pourrait).
const JOIN_VOICE_WORD_TRIGGERS = ["come", "viens"];
const JOIN_VOICE_PHRASE_TRIGGERS = [
  "rejoins le vocal",
  "rejoins mon vocal",
  "viens en vocal",
  "rejoins le salon vocal",
];
const LEAVE_VOICE_TRIGGERS = [
  "quitte le vocal",
  "pars du vocal",
  "quitte le salon vocal",
  "stop mimir",
];

/**
 * Vrai si le texte contient une des phrases données comme sous-chaîne.
 * Adapté aux déclencheurs multi-mots, où le risque de faux positif est
 * négligeable (ex: "rejoins le vocal" ne peut pas apparaître par accident).
 */
function includesAny(text, phrases) {
  return phrases.some((p) => text.includes(p));
}

/**
 * Vrai si un des mots donnés apparaît comme MOT ENTIER dans le texte
 * (frontière de mot Unicode-safe). Réservé aux déclencheurs courts et
 * génériques où includesAny() produirait des faux positifs.
 */
function includesWord(text, words) {
  return words.some((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
  });
}

/**
 * Vrai si le message demande de rejoindre le salon vocal, en combinant
 * les phrases explicites (sûres en sous-chaîne) et les mots courts
 * ("come", "viens", vérifiés en frontière de mot).
 */
function isJoinVoiceTrigger(lowerText) {
  return (
    includesAny(lowerText, JOIN_VOICE_PHRASE_TRIGGERS) ||
    includesWord(lowerText, JOIN_VOICE_WORD_TRIGGERS)
  );
}

module.exports = {
  GLOBAL_SEARCH_TRIGGERS,
  IMAGE_TRIGGERS,
  CSV_TRIGGERS,
  VOICE_MESSAGE_TRIGGERS,
  PDF_TRIGGERS,
  CHANNEL_READ_TRIGGERS,
  BAN_TRIGGERS,
  UNBAN_TRIGGERS,
  KICK_TRIGGERS,
  TIMEOUT_TRIGGERS,
  UNTIMEOUT_TRIGGERS,
  LEAVE_VOICE_TRIGGERS,
  FLAG_LANGUAGE_MAP,
  includesAny,
  includesWord,
  isJoinVoiceTrigger,
};
