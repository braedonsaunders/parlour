import type { GameCopy } from '../types';

/** French copy for klondike. Untranslated fields fall back to the pack's English. */
export const klondikeFr: GameCopy = {
  name: 'Klondike',
  subtitle: 'le grand classique du solitaire',
  tagline: 'Vide la table du jour',
  description:
    'Monte sept colonnes en alternant les couleurs, tourne le talon et renvoie chaque couleur à la maison, de l’As au Roi. La même donne du jour attend tout le monde.',
  facts: ['1 joueur', 'donne du jour à graine', 'hors ligne'],
  howToPlay: {
    summary:
      'Le grand classique du solitaire à sept colonnes, distribué de façon déterministe pour une table neuve ou celle du jour.',
    objective: 'Monte les quatre fondations de l’As au Roi, une couleur par pile.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Sept colonnes de tableau contiennent de une à sept cartes. Seule la carte du dessus de chaque colonne commence face visible ; les vingt-quatre autres forment le talon.',
        ],
      },
      {
        heading: 'Construire le tableau',
        body: [
          'Pose les cartes en rang décroissant en alternant les couleurs. Une suite face visible se déplace d’un bloc. Seul un Roi — seul ou en tête d’une suite — peut entrer dans une colonne vide.',
        ],
      },
      {
        heading: 'Tourner et recycler',
        body: [
          'En Classique, on tourne trois cartes du talon à la fois ; en Détente, une seule. Seule la carte du dessus de la défausse peut bouger. Quand le talon est vide, retourne la défausse sans la mélanger. Il n’y a pas de limite de passages.',
        ],
      },
      {
        heading: 'Les fondations',
        body: [
          'Commence chaque couleur par son As, puis monte jusqu’au Roi. Une carte de fondation peut revenir au tableau si tu dois défaire une ligne.',
        ],
      },
      {
        heading: 'Vider la table',
        body: [
          'Déplacer la dernière carte face visible d’une colonne retourne automatiquement la carte qui vient d’être dégagée. Termine les quatre fondations pour gagner.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Du jour',
      tagline: 'Une table pour tout le monde',
      description:
        'Une donne Tirage trois à graine calée sur la date. Rejoue-la, partage-la, ou reviens demain pour une table neuve.',
      facts: ['tirage trois', 'même donne du jour', 'passages illimités'],
    },
    classic: {
      name: 'Classique',
      tagline: 'Tirage trois',
      description: 'Une donne neuve à graine, avec trois cartes du talon tournées à la fois.',
      facts: ['tirage trois', 'donne neuve', 'passages illimités'],
    },
    relaxed: {
      name: 'Détente',
      tagline: 'Tirage un',
      description: 'Une donne neuve plus douce : chaque carte du talon arrive une par une.',
      facts: ['tirage un', 'donne neuve', 'passages illimités'],
    },
  },
  fields: {
    drawCount: {
      label: 'Tirage du talon',
      group: 'Donne',
      options: {
        '3': 'Tirage trois — classique',
        '1': 'Tirage un — détente',
      },
      help: 'Tourne une ou trois cartes à la fois. La défausse peut être recyclée sans limite de passages.',
    },
  },
  presets: {
    classic: 'Classique',
    relaxed: 'Détente',
  },
};
