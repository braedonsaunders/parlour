import type { GameCopy } from '../types';

/** French copy for gin. Untranslated fields fall back to the pack's English. */
export const ginFr: GameCopy = {
  name: 'Gin Rami',
  subtitle: 'le classique du rami',
  tagline: 'Combine, frappe, gagne la soirée',
  description:
    'Dix cartes, deux chaises. Forme des brelans et des suites, allège ton bois mort et frappe la table avant ton adversaire.',
  facts: ['2 joueurs', 'frapper · gin · grand gin', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Le classique à deux — pioche, défausse et combine jusqu’à une main qui vaut le coup de frapper.',
    objective:
      'Transforme tes dix cartes en brelans et en suites pour qu’il ne reste presque rien, puis frappe avant ton adversaire. La première place à dépasser la cible de la partie gagne.',
    sections: [
      {
        heading: 'Combinaisons et bois mort',
        body: [
          'Une combinaison est soit trois ou quatre cartes de même rang, soit trois cartes ou plus de la même couleur en séquence. Les as sont toujours bas (A-2-3, jamais D-R-A).',
          'Tout ce qui n’est pas dans une combinaison est du bois mort, compté à sa valeur faciale avec les figures à dix et les as à un. Plus c’est bas, mieux c’est.',
        ],
      },
      {
        heading: 'Ton tour',
        body: ['Deux étapes, à chaque tour :'],
        bullets: [
          {
            label: 'Piocher',
            text: 'prends le dessus du talon, ou rafle le dessus de la défausse',
          },
          {
            label: 'Défausser',
            text: 'glisse une carte face visible sur la pile — jamais une carte piochée ce tour-ci, d’une pile comme de l’autre',
          },
        ],
      },
      {
        heading: 'La carte retournée d’ouverture',
        body: [
          'Après la donne, une carte reste face visible. Celui qui ne donne pas peut la prendre dans sa main, ou passer ; puis le donneur a le même choix. Si les deux passent, celui qui ne donne pas pioche dans le talon et le jeu commence.',
        ],
      },
      {
        heading: 'Frapper',
        body: [
          'Au lieu de te défausser, tu peux frapper dès que ton bois mort est au plafond de frappe ou en dessous (10 par défaut). Cela termine la manche immédiatement — sans défausse. Piocher d’abord une onzième carte ouvre la voie du grand gin si tout se combine.',
        ],
      },
      {
        heading: 'Gin et décharges',
        body: [
          'Zéro bois mort, c’est le gin — le défenseur ne peut rien décharger et paie tout son bois mort plus le bonus de gin.',
          'Sur une frappe simple, le défenseur décharge d’abord : toutes ses cartes restantes qui allongent un brelan du frappeur à quatre ou prolongent une suite à l’un ou l’autre bout glissent hors des comptes avant la comparaison.',
          'Si le bois mort du défenseur finit égal ou inférieur au tien, c’est une contre-frappe — c’est lui qui empoche la différence plus un bonus.',
        ],
      },
      {
        heading: 'Score et partie',
        body: [
          'Les manches s’enchaînent jusqu’à ce que quelqu’un dépasse la cible de la partie (100 par défaut), la donne alternant à chaque manche.',
        ],
        bullets: [
          { label: 'Frappe', text: 'la différence entre les bois morts' },
          { label: 'Contre-frappe', text: 'différence + 25 pour le défenseur' },
          { label: 'Gin', text: 'tout le bois mort du défenseur + 25' },
          {
            label: 'Grand gin',
            text: 'onze cartes toutes combinées — bois mort du défenseur + 31 (option)',
          },
          {
            label: 'Bonus de ligne',
            text: '+25 optionnel par manche gagnée, ajouté à la fin (option)',
          },
        ],
      },
      {
        heading: 'Règles maison',
        body: ['Chaque table peut être réglée dans les paramètres de la salle :'],
        bullets: [
          {
            label: 'Plafond de frappe',
            text: 'à quel point tu dois être bas pour frapper — des plafonds plus serrés font des manches plus longues',
          },
          {
            label: 'Cible de la partie',
            text: '50 pour une partie rapide, 100 en classique, plus pour les acharnés',
          },
          { label: 'Grand gin / bonus / bonus de ligne', text: 'les réglages de gains' },
        ],
      },
      {
        heading: 'Manches mortes',
        body: [
          'Si le talon tombe à deux cartes, la manche est morte — pas de score, le donneur redonne. Frappe plus tôt.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Direct vers les 100',
      description:
        'Le standard du pub — frappe à dix de bois mort ou mieux, le gin paie 25, le grand gin paie 31. Le premier à passer 100 l’emporte.',
      facts: ['plafond de frappe 10', 'partie à 100', '~15 min'],
    },
    quick: {
      name: 'Rapide',
      tagline: 'Course à 50',
      description:
        'Mêmes règles, échelle plus courte. Une partie à deux rapide le temps que la bouilloire chauffe.',
      facts: ['partie à 50', '~8 min'],
    },
    purist: {
      name: 'Puriste',
      tagline: 'Sans fioritures',
      description:
        'Le grand gin est désactivé et les bonus de ligne restent à la maison. Que des frappes, que du bois mort, aucun filet de sécurité.',
      facts: ['sans grand gin', 'sans bonus de ligne'],
    },
  },
  fields: {
    knockCap: {
      label: 'Plafond de frappe',
      help: 'Le bois mort le plus haut avec lequel tu peux frapper',
      group: 'Table',
    },
    matchTarget: {
      label: 'Partie à',
      help: 'La première place à dépasser ce total remporte la partie',
      group: 'Table',
    },
    ginBonus: {
      label: 'Bonus de gin',
      group: 'Bonus',
    },
    bigGin: {
      label: 'Grand gin',
      help: 'Pioche une onzième carte qui se combine entièrement',
      group: 'Bonus',
    },
    bigGinBonus: {
      label: 'Bonus de grand gin',
      group: 'Bonus',
    },
    boxBonus: {
      label: 'Bonus de ligne',
      help: '+25 par manche gagnée, ajouté au total final',
      group: 'Bonus',
    },
  },
  presets: {
    classic: 'Classique',
    quick: 'Partie rapide',
    purist: 'Puriste',
  },
};
