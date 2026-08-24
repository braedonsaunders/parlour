import type { GameCopy } from '../types';

/** French copy for eights. Untranslated fields fall back to the pack's English. */
export const eightsFr: GameCopy = {
  name: 'Huit américain',
  subtitle: 'le jeu du huit joker',
  tagline: 'Les huit passent partout',
  description:
    'Un paquet ordinaire, une pile qui grandit. Suis la couleur ou le rang, pose un huit pour plier la table à la couleur de ton choix, et fais payer aux autres tout ce qu’ils ont encore en main.',
  facts: ['2–6 joueurs', 'on joue jusqu’à un score', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Un paquet ordinaire, une pile, et des huit qui passent sur tout. Vide ta main et fais payer à la table ce qu’elle a encore en main.',
    objective:
      'Vide ta main pour clore la manche et empoche toutes les cartes restantes des autres. Le premier à dépasser le score cible remporte la partie.',
    sections: [
      {
        heading: 'Jouer une carte',
        body: [
          'À ton tour, joue une carte qui suit la pile par la couleur ou par le rang — un 7♦ passe sur n’importe quel carreau et sur n’importe quel autre sept.',
          'Un huit est joker. Il passe sur tout, et c’est toi qui annonces la couleur qui doit suivre.',
          'Rien à jouer ? Pioche. La pile demande la même couleur tant que personne ne la change.',
        ],
      },
      {
        heading: 'Cartes d’action',
        body: [
          'Chacune est un réglage de la table, pour qu’une maison joue aussi simplement ou aussi bruyamment qu’elle veut.',
        ],
        bullets: [
          {
            label: '8 — joker',
            text: 'toujours jouable ; tu annonces la couleur qui suit (toujours actif)',
          },
          {
            label: '2 — pioche deux',
            text: 'la place suivante prend deux cartes et perd son tour',
          },
          { label: 'Q — passe', text: 'le jeu saute carrément la place suivante' },
          {
            label: 'A — inverse',
            text: 'la table change de sens ; en tête-à-tête, ça te redonne un tour',
          },
        ],
      },
      {
        heading: 'Piocher',
        body: [
          'Par tradition, tu pioches jusqu’à trouver quelque chose de jouable. Désactive ça et un tour n’achète qu’une seule carte.',
          'Une carte piochée qui peut être jouée est à toi : joue-la tout de suite ou garde-la — sauf si la table t’oblige à la jouer.',
          'Quand le talon est épuisé, tout ce qui se trouve sous la carte face visible est remélangé en un talon neuf.',
        ],
      },
      {
        heading: 'Compter la manche',
        body: [
          'Dès qu’une main se vide, tout le monde compte ce qu’il a encore en main et celui qui s’est débarrassé de tout empoche le lot.',
        ],
        bullets: [
          { label: 'Chaque huit', text: '50 points' },
          { label: 'Chaque 10, V, D ou R', text: '10 points' },
          { label: 'Chaque as', text: '1 point' },
          { label: 'Tout le reste', text: 'sa valeur faciale' },
          {
            label: 'Manche bloquée',
            text: 'talon épuisé et personne ne peut jouer — la main la plus légère gagne et empoche la différence',
          },
        ],
      },
      {
        heading: 'Gagner la partie',
        body: [
          'Les manches s’enchaînent, la donne avançant d’une place à chaque fois, jusqu’à ce que quelqu’un dépasse le score cible. Le score le plus haut gagne.',
          'Une égalité en tête redonne une manche plutôt que de partager la couronne.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Des huit et rien d’autre',
      description:
        'Le jeu tel que ta grand-mère le distribuait. Suis la couleur ou le rang, pose un huit pour annoncer une couleur, pioche jusqu’à trouver ton bonheur. Premier à 100.',
      facts: ['seuls les 8 sont jokers', 'pioche jusqu’au jouable', 'jusqu’à 100'],
    },
    house: {
      name: 'Maison',
      tagline: 'Deux, dames et as',
      description:
        'Les règles que presque tout le monde joue vraiment : les deux font piocher, les dames sautent la place suivante, les as retournent la table. Premier à 100.',
      facts: ['2 · Q · A actifs', 'pas de cumul', 'jusqu’à 100'],
    },
    chaos: {
      name: 'Délire',
      tagline: 'Empile tout',
      description:
        'Les deux s’empilent sur les deux jusqu’à ce que quelqu’un avale le paquet, une carte piochée doit être jouée, et tu n’as droit qu’à une pioche par tour. Partie longue, table bruyante.',
      facts: ['cumul activé', 'jeu forcé', 'jusqu’à 150'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartes distribuées',
      help: 'Le nombre de cartes avec lequel chaque place commence une manche.',
      group: 'La donne',
    },
    targetScore: {
      label: 'Jouer jusqu’à',
      help: 'Les manches s’enchaînent jusqu’à ce que quelqu’un dépasse ce score.',
      group: 'La donne',
    },
    twosDrawTwo: {
      label: 'Les deux font piocher deux',
      help: 'La place suivante prend deux cartes et perd son tour.',
      group: 'Cartes d’action',
    },
    queensSkip: {
      label: 'Les dames font passer',
      help: 'Le jeu saute carrément la place suivante.',
      group: 'Cartes d’action',
    },
    acesReverse: {
      label: 'Les as inversent',
      help: 'La table change de sens. À deux joueurs, ça fait passer le tour.',
      group: 'Cartes d’action',
    },
    stackDrawTwo: {
      label: 'Cumuler les deux',
      help: 'Réponds à un deux par le tien et fais suivre toute la pioche.',
      group: 'Règles de la maison',
    },
    drawUntilPlayable: {
      label: 'Piocher jusqu’au jouable',
      help: 'La règle traditionnelle. Désactive-la pour piocher exactement une carte par tour.',
      group: 'Règles de la maison',
    },
    forcePlay: {
      label: 'Jeu forcé',
      help: 'Une carte piochée qui peut être jouée doit être jouée.',
      group: 'Règles de la maison',
    },
  },
  presets: {
    classic: 'Huit américain classique',
    house: 'Huit américain maison',
    chaos: 'Huit américain délire',
  },
};
