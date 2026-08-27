import type { GameCopy } from '../types';

/** French copy for tripeaks. Untranslated fields fall back to the pack's English. */
export const tripeaksFr: GameCopy = {
  name: 'TriPeaks',
  subtitle: 'dégage les trois sommets',
  tagline: 'Joue ±1 sur le trou',
  description:
    'Dix-huit cartes en trois sommets, toutes face visible. Libère une carte en dégageant ce qui la recouvre, enchaîne les coups sur le trou et dégage les sommets.',
  facts: ['1 joueur', 'sommets du jour avec graine', 'hors ligne'],
  howToPlay: {
    summary:
      'Une réussite à un joueur : trois sommets de dix-huit cartes, toutes face visible, et une pioche que tu tournes sur un unique trou.',
    objective:
      'Dégage toutes les cartes des sommets. Les cartes restantes sont ton score — moins il en reste, mieux c’est.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Trois sommets de dix-huit cartes reposent face visible sur quatre rangées. La rangée de base de neuf cartes est toujours libre. Les trente-quatre cartes restantes forment la pioche, et la première ouvre le trou.',
        ],
      },
      {
        heading: 'Cartes libres',
        body: [
          'Une carte devient libre dès que les deux cartes posées dessus ont disparu. Seules les cartes libres peuvent bouger — les cartes encore recouvertes restent bloquées jusqu’à ce que leurs filles se dégagent.',
        ],
      },
      {
        heading: 'Joue sur le trou',
        body: [
          'Joue une carte libre sur le trou quand elle est à un rang d’écart — un 8 accepte un 7 ou un 9. Les couleurs et enseignes n’ont pas d’importance. Enchaîne autant de coups que possible.',
        ],
      },
      {
        heading: 'Tourne la pioche',
        body: [
          'Si rien sur les sommets ne convient, tourne la carte suivante de la pioche sur le trou. L’ancienne carte du trou est ensevelie dessous.',
        ],
      },
      {
        heading: 'As, Roi et la pioche',
        body: [
          'Le TriPeaks Classique traite l’As et le Roi comme des culs-de-sac, et la pioche ne revient jamais. Relaxé permet à l’As et au Roi de s’enchaîner, et autorise un mélange du trou vers la pioche une fois celle-ci épuisée.',
        ],
      },
      {
        heading: 'Le score',
        body: [
          'La partie se termine quand les sommets sont dégagés, ou que plus rien ne joue et que la pioche ne peut plus revenir. Les cartes restant sur les sommets forment ton score. Zéro, c’est un sommet vidé.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Du jour',
      tagline: 'Une donne pour tout le monde',
      description:
        'Une donne Classique déterminée par la date. Rejoue-la, partage-la, ou reviens demain pour de nouveaux sommets.',
      facts: ['sans enchaînement', 'même donne du jour', 'moins il en reste, mieux c’est'],
    },
    classic: {
      name: 'Classique',
      tagline: 'As et Roi t’arrêtent',
      description:
        'Une donne fraîche déterminée par une graine. L’As et le Roi sont des culs-de-sac ; la pioche ne revient jamais.',
      facts: ['sans enchaînement', 'donne fraîche', 'sans recyclage'],
    },
    relaxed: {
      name: 'Relaxé',
      tagline: 'L’As s’enchaîne au Roi',
      description:
        'Les mêmes trois sommets, mais l’As et le Roi se jouent l’un sur l’autre et le trou peut être recyclé une fois.',
      facts: ['enchaîne A–K', 'donne fraîche', 'un recyclage'],
    },
  },
  fields: {
    wrap: {
      label: 'L’As s’enchaîne au Roi',
      group: 'Trou',
      help: 'Le TriPeaks Classique s’arrête à l’As et au Roi. Relaxé laisse A et K se jouer l’un sur l’autre.',
    },
    recycle: {
      label: 'Recycler le trou',
      group: 'Pioche',
      help: 'Quand la pioche s’épuise, mélange le trou (sauf sa carte du dessus) une fois vers la pioche.',
    },
  },
  presets: {
    classic: 'Classique',
    relaxed: 'Relaxé',
  },
};
