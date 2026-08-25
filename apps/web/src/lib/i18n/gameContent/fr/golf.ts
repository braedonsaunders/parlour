import type { GameCopy } from '../types';

/** French copy for golf. Untranslated fields fall back to the pack's English. */
export const golfFr: GameCopy = {
  name: 'Golf',
  subtitle: 'le solitaire rapide',
  tagline: 'Joue ±1 sur le trou',
  description:
    'Sept colonnes de cinq, toutes les cartes visibles. Joue un rang voisin du trou, enchaîne aussi loin que possible et laisse le moins possible sur l’herbe.',
  facts: ['1 joueur', 'trou quotidien déterministe', 'hors ligne'],
  howToPlay: {
    summary:
      'Un solitaire rapide en solo : sept colonnes de cinq, toutes les cartes face visible, et un seul trou.',
    objective:
      'Enlève toutes les cartes de l’herbe. Celles qui restent font ton score — plus c’est bas, mieux c’est.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Sept colonnes reçoivent cinq cartes face visible. Les dix-sept restantes forment la pioche. La première carte de la pioche ouvre le trou.',
        ],
      },
      {
        heading: 'Joue sur le trou',
        body: [
          'Seule la carte la plus basse de chaque colonne peut bouger. Pose-la sur le trou si elle est à un rang de distance — un 8 prend un 7 ou un 9. Couleurs et enseignes n’ont aucune importance.',
        ],
      },
      {
        heading: 'Tourne la pioche',
        body: [
          'Si rien sur l’herbe ne convient, retourne la carte suivante de la pioche sur le trou. L’ancienne carte du trou est enterrée et ne revient pas. Il n’y a pas de recyclage.',
        ],
      },
      {
        heading: 'As et Roi',
        body: [
          'Le Golf classique traite l’As et le Roi comme des impasses. Fairway les relie pour qu’une chaîne puisse continuer.',
        ],
      },
      {
        heading: 'Le score',
        body: [
          'Le trou s’arrête quand l’herbe est vide ou que la pioche est épuisée et qu’il n’y a plus de coup. Les cartes encore sur le tableau font ton score. Zéro est un clear.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Quotidien',
      tagline: 'Un trou pour tout le monde',
      description:
        'Un trou Classique semé par la date. Rejoue-le, partage-le, ou reviens demain pour une nouvelle table.',
      facts: ['sans boucle', 'même donne quotidienne', 'le plus bas gagne'],
    },
    classic: {
      name: 'Classique',
      tagline: 'As et Roi t’arrêtent',
      description:
        'Un trou frais et déterministe. As et Roi sont des impasses ; la pioche ne revient jamais.',
      facts: ['sans boucle', 'nouvelle donne', 'pas de recyclage'],
    },
    fairway: {
      name: 'Fairway',
      tagline: 'L’As rejoint le Roi',
      description:
        'Le même trou rapide, mais As et Roi se jouent l’un sur l’autre pour allonger les chaînes.',
      facts: ['boucle A–R', 'nouvelle donne', 'pas de recyclage'],
    },
  },
  fields: {
    wrap: {
      label: 'L’As rejoint le Roi',
      group: 'Trou',
      help: 'Le Golf classique s’arrête à l’As et au Roi. Fairway les laisse se jouer l’un sur l’autre.',
    },
  },
  presets: {
    classic: 'Classique',
    fairway: 'Fairway',
  },
};
