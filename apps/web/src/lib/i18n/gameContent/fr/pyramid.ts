import type { GameCopy } from '../types';

/** French copy for pyramid. Untranslated fields fall back to the pack's English. */
export const pyramidFr: GameCopy = {
  name: 'Pyramide',
  subtitle: 'associe jusqu’à treize',
  tagline: 'Vide la pyramide du jour',
  description:
    'Vingt-huit cartes en triangle. Associe des rangs libres qui font 13, tourne la pioche et laisse le moins possible.',
  facts: ['1 joueur', 'pyramide quotidienne déterministe', 'hors ligne'],
  howToPlay: {
    summary:
      'Un solitaire en solo : vingt-huit cartes en pyramide, et une pioche que tu tournes sur une seule défausse.',
    objective:
      'Associe des cartes libres qui font treize et vide la table. Celles qui restent font ton score — plus c’est bas, mieux c’est.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Sept rangées forment une pyramide de vingt-huit cartes face visible. Une carte est libre quand les deux qui la recouvrent sont parties — ou quand elle est sur la dernière rangée. Les vingt-quatre restantes forment la pioche. La défausse commence vide.',
        ],
      },
      {
        heading: 'Associe jusqu’à treize',
        body: [
          'L’As vaut 1 et le Roi vaut 13. Deux cartes libres dont les rangs font 13 peuvent s’associer — Dame et As, Valet et 2, et ainsi de suite. Un Roi vaut déjà 13 et se retire seul. Les enseignes n’ont aucune importance.',
        ],
      },
      {
        heading: 'La défausse',
        body: [
          'Tourne une carte de la pioche sur la défausse à la fois. Seule la carte du dessus est vivante : associe-la à une carte libre de la pyramide, ou retire-la si c’est un Roi. Les cartes enterrées de la défausse ne s’associent pas entre elles.',
        ],
      },
      {
        heading: 'Recycler',
        body: [
          'Quand la pioche est vide, retourne la défausse sans mélanger. Classique autorise deux recyclages — trois passages. Relaxé ne s’épuise jamais.',
        ],
      },
      {
        heading: 'Le score',
        body: [
          'La donne s’arrête quand plus aucune carte ne reste, ou quand rien ne s’associe et que la pioche ne peut plus revenir. Chaque carte encore dans la pyramide, la pioche ou la défausse compte. Zéro est un clear.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Quotidien',
      tagline: 'Une pyramide pour tout le monde',
      description:
        'Une pyramide Classique semée par la date. Rejoue-la, partage-la, ou reviens demain pour une nouvelle table.',
      facts: ['deux recyclages', 'même donne quotidienne', 'le plus bas gagne'],
    },
    classic: {
      name: 'Classique',
      tagline: 'Trois passages',
      description:
        'Une pyramide fraîche et déterministe. La défausse peut être recyclée deux fois — trois voyages dans la pioche.',
      facts: ['deux recyclages', 'nouvelle donne', 'trois passages'],
    },
    relaxed: {
      name: 'Relaxé',
      tagline: 'Passages illimités',
      description:
        'La même table d’associations, mais la défausse peut être retournée autant de fois que tu veux.',
      facts: ['recyclages illimités', 'nouvelle donne', 'pas de limite de passages'],
    },
  },
  fields: {
    recyclesLimit: {
      label: 'Recyclages de la défausse',
      group: 'Pioche',
      options: {
        '2': 'Deux recyclages — classique',
        '-1': 'Illimité — relaxé',
      },
      help: 'Classique autorise deux recyclages, trois passages dans la pioche. Relaxé ne s’épuise jamais.',
    },
  },
  presets: {
    classic: 'Classique',
    relaxed: 'Relaxé',
  },
};
