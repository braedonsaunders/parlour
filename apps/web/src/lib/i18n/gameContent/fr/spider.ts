import type { GameCopy } from '../types';

/** French copy for spider. Untranslated fields fall back to the pack's English. */
export const spiderFr: GameCopy = {
  name: 'Spider',
  subtitle: 'le solitaire à deux jeux',
  tagline: 'Décolle huit suites à la couleur',
  description:
    'Monte dix colonnes en descendant, ne déplace que les suites d’une même couleur et retire chaque Roi-à-As de la table. La même donne quotidienne à deux couleurs attend tout le monde.',
  facts: ['1 joueur', 'donne du jour à graine', 'hors ligne'],
  howToPlay: {
    summary:
      'Spider façon Microsoft à deux jeux : dix colonnes, cinq rangées de réserve et huit couleurs à décrocher.',
    objective: 'Envoie huit suites de la même couleur, du Roi à l’As, vers les fondations.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Dix colonnes sont distribuées : les quatre premières en ont six et les autres cinq. Seule la carte du dessus de chaque colonne commence face visible. Il reste cinquante cartes au talon, en cinq rangées de dix.',
        ],
      },
      {
        heading: 'Construire le tableau',
        body: [
          'Pose les cartes en rang décroissant, n’importe quelle couleur. Seule une suite descendante de la même couleur peut se déplacer d’un bloc. Une colonne vide accepte n’importe quelle carte ou suite.',
        ],
      },
      {
        heading: 'Distribuer une rangée',
        body: [
          'Clique le talon pour poser une carte face visible sur chaque colonne. Tu ne peux pas distribuer tant qu’une colonne est vide, ou s’il reste moins de dix cartes.',
        ],
      },
      {
        heading: 'Décrocher une couleur',
        body: [
          'Quand une suite de la même couleur, du Roi à l’As, est complète sur une colonne, elle part vers une fondation dans le même coup. Une carte retournée nouvellement exposée se retourne toute seule.',
        ],
      },
      {
        heading: 'Les couleurs',
        body: [
          'Détendu peint les 104 cartes en piques. Classique (le quotidien) utilise piques et cœurs. Difficile utilise toutes les couleurs, donc les suites empaquetées sont plus rares.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Quotidien',
      tagline: 'Une table pour tous',
      description:
        'Une donne à deux couleurs semée par la date. Rejoue-la, partage-la, ou reviens demain pour une table neuve.',
      facts: ['deux couleurs', 'même donne du jour', 'cinq rangées de talon'],
    },
    relaxed: {
      name: 'Détendu',
      tagline: 'Que des piques',
      description:
        'Une donne neuve plus douce : chaque carte est un pique, les suites se montent librement.',
      facts: ['une couleur', 'donne neuve', 'cinq rangées de talon'],
    },
    classic: {
      name: 'Classique',
      tagline: 'Deux couleurs',
      description: 'Une donne neuve à graine peinte en piques et cœurs — le défaut Microsoft.',
      facts: ['deux couleurs', 'donne neuve', 'cinq rangées de talon'],
    },
    hard: {
      name: 'Difficile',
      tagline: 'Quatre couleurs',
      description:
        'La donne complète à deux jeux. Les suites d’une même couleur sont rares et chaque décrochage se mérite.',
      facts: ['quatre couleurs', 'donne neuve', 'cinq rangées de talon'],
    },
  },
  fields: {
    suitCount: {
      label: 'Couleurs',
      group: 'Donne',
      options: {
        '1': 'Une couleur — détendu',
        '2': 'Deux couleurs — classique',
        '4': 'Quatre couleurs — difficile',
      },
      help: 'Les donnes à une couleur sont toutes des piques. Le classique utilise piques et cœurs. Le difficile utilise toutes les couleurs.',
    },
  },
  presets: {
    relaxed: 'Détendu',
    classic: 'Classique',
    hard: 'Difficile',
  },
};
