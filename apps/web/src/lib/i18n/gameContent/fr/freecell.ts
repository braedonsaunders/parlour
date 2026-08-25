import type { GameCopy } from '../types';

/** French copy for freecell. Untranslated fields fall back to the pack's English. */
export const freecellFr: GameCopy = {
  name: 'FreeCell',
  subtitle: 'le solitaire à cartes ouvertes',
  tagline: 'Vide la table du jour',
  description:
    'Huit colonnes, toutes les cartes faces visibles. Gare les extras dans les cellules libres et renvoie chaque couleur à la maison, de l’As au Roi. La même donne du jour attend tout le monde.',
  facts: ['1 joueur', 'donne du jour à graine', 'hors ligne'],
  howToPlay: {
    summary:
      'Le grand classique du solitaire à cartes ouvertes, distribué de façon déterministe pour une table neuve ou celle du jour.',
    objective: 'Monte les quatre fondations de l’As au Roi, une couleur par pile.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Huit colonnes de tableau montrent toutes les cartes faces visibles. Les quatre premières colonnes reçoivent sept cartes ; les quatre dernières en reçoivent six.',
        ],
      },
      {
        heading: 'Cellules libres',
        body: [
          'Gare une carte dans chaque cellule libre. Classique en a quatre ; Détente en a six. Une cellule ne tient qu’une carte, qui peut aller au tableau ou à une fondation.',
        ],
      },
      {
        heading: 'Construire le tableau',
        body: [
          'Pose les cartes en rang décroissant en alternant les couleurs. Une suite compacte se déplace d’un bloc si la limite de supermouvement le permet. N’importe quelle carte — pas seulement un Roi — peut entrer dans une colonne vide.',
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
        body: ['Renvoie toutes les cartes à la maison. Termine les quatre fondations pour gagner.'],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Du jour',
      tagline: 'Une table pour tout le monde',
      description:
        'Une donne Classique à graine calée sur la date. Rejoue-la, partage-la, ou reviens demain pour une table neuve.',
      facts: ['quatre cellules', 'même donne du jour', 'n’importe quelle carte au vide'],
    },
    classic: {
      name: 'Classique',
      tagline: 'Quatre cellules libres',
      description: 'Une donne neuve à graine, avec quatre cellules d’une carte.',
      facts: ['quatre cellules', 'donne neuve', 'n’importe quelle carte au vide'],
    },
    relaxed: {
      name: 'Détente',
      tagline: 'Six cellules libres',
      description:
        'Une donne neuve plus douce : deux cellules de plus facilitent les longues suites.',
      facts: ['six cellules', 'donne neuve', 'n’importe quelle carte au vide'],
    },
  },
  fields: {
    freeCells: {
      label: 'Cellules libres',
      group: 'Donne',
      options: {
        '4': 'Quatre cellules — classique',
        '6': 'Six cellules — détente',
      },
      help: 'Gare une carte dans chaque cellule. Détente ajoute deux cellules.',
    },
  },
  presets: {
    classic: 'Classique',
    relaxed: 'Détente',
  },
};
