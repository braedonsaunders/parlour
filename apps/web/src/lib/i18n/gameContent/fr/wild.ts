import type { GameCopy } from '../types';

/** French copy for wild. Untranslated fields fall back to the pack's English. */
export const wildFr: GameCopy = {
  name: 'Wild',
  subtitle: 'le jeu du délestage',
  tagline: 'Débarrasse-toi de tout',
  description:
    'Une émeute de 112 cartes : passes, inversions, +4, vidages de couleur et cartes claquées à tout moment. Même table chaleureuse, un paquet bien plus bruyant.',
  facts: ['2–4 joueurs', 'donne chronométrée', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Une émeute de délestage à 112 cartes — suis le dessus de la pile, déchaîne les cartes action et vide ta main en premier.',
    objective:
      'Sois le premier joueur sans cartes. Les cartes action ralentissent tout le monde — sauf si on te riposte.',
    sections: [
      {
        heading: 'Jouer une carte',
        body: [
          'À ton tour, joue une carte qui suit le dessus de la pile par la couleur ou par la figure, ou pioche à la place.',
          'Les jokers se jouent à tout moment et te laissent choisir la prochaine couleur.',
        ],
      },
      {
        heading: 'Cartes action',
        bullets: [
          {
            label: 'Passe',
            text: 'le joueur suivant perd son tour — et ne peut pas claquer de carte pour revenir',
          },
          {
            label: 'Inversion',
            text: 'le sens du jeu se renverse ; en tête-à-tête, elle te redonne un tour',
          },
          {
            label: '+2',
            text: 'le joueur suivant pioche deux cartes et perd son tour',
          },
          {
            label: 'Vide la couleur',
            text: 'défausse sous elle toutes les cartes de sa couleur dans ta main ; les cartes action balayées ne se déclenchent pas',
          },
          { label: 'Joker', text: 'joue-le à tout moment et annonce la prochaine couleur' },
          {
            label: 'Joker +4',
            text: 'annonce la couleur ET colle quatre cartes au joueur suivant',
          },
          {
            label: 'Joker échange',
            text: 'annonce la couleur, puis échange ta main avec qui tu veux (carte optionnelle)',
          },
          {
            label: 'Joker mélange',
            text: 'rassemble toutes les mains, mélange, redonne (carte optionnelle)',
          },
        ],
      },
      {
        heading: 'Dernière carte',
        body: [
          'Plus que deux cartes ? Appuie sur « Dernière carte ! » avant de jouer. Arrive à une carte sans l’avoir annoncé et tu es pris pour deux.',
          'Piocher te fait repasser au-dessus de la ligne, il faudra donc l’annoncer à nouveau.',
        ],
      },
      {
        heading: 'Les chronos',
        body: [
          'Chaque tour est chronométré. Si le chrono tombe à zéro, la table joue un coup légal pour ce joueur afin que la pile continue de tourner.',
          'La donne a aussi son horloge de partie. Pendant sa dernière minute, les places en direct de la première à la quatrième s’affichent et bougent avec les mains.',
        ],
        bullets: [
          {
            label: 'À zéro',
            text: 'le moins de cartes gagne ; les mains de même taille se départagent dans l’ordre des places pour que chaque partie ait un résultat net',
          },
          {
            label: 'Options avancées',
            text: 'règle les secondes par tour et les minutes de partie avant la donne',
          },
        ],
      },
      {
        heading: 'Chaos maison',
        body: ['Chaque réglage de table se trouve dans les options avancées avant la donne :'],
        bullets: [
          {
            label: 'Cumul',
            text: 'réponds à un +2 / +4 par la même carte et la pénalité s’empile pour la prochaine victime',
          },
          {
            label: 'Carte claquée',
            text: 'tu tiens exactement la même figure que la carte qui vient d’être jouée ? Claque-la hors de ton tour avant que quiconque réagisse',
          },
          {
            label: 'Pioche jusqu’à pouvoir jouer',
            text: 'pioche jusqu’à ce qu’une carte suive, au lieu d’en piocher une seule',
          },
          {
            label: 'Jeu forcé',
            text: 'une carte piochée qui peut être jouée doit être jouée',
          },
          {
            label: 'Défier les +4',
            text: 'un +4 n’est honnête que sans rien dans l’ancienne couleur — dénonce le bluff et il ramasse la pile, trompe-toi et tu prends deux cartes de plus',
          },
          {
            label: 'Sept et zéros',
            text: 'un 7 échange ta main avec le joueur que tu nommes ; un 0 fait tourner toutes les mains d’une place',
          },
          {
            label: 'Jokers d’échange',
            text: 'ajoute le Joker échange et le Joker mélange au paquet',
          },
        ],
      },
      {
        heading: 'Gagner',
        body: [
          'Vide ta main pour gagner avant la fin de l’horloge de partie. Sinon, à zéro, la main restante la plus légère l’emporte.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'À la lettre',
      description:
        'Suis la couleur ou le chiffre, puis vide toute une couleur d’un coup. Pas de cumul, pas de cartes claquées — une émeute polie.',
      facts: ['une seule donne', 'pas de cumul', '~5 min'],
    },
    party: {
      name: 'Fête',
      tagline: 'Empile et claque',
      description:
        'Les +2 et +4 s’empilent, et une carte identique permet à quiconque de claquer hors de son tour. Le chaos, sous une lumière chaude.',
      facts: ['cumul activé', 'cartes claquées', '~5 min'],
    },
    houseRules: {
      name: 'Règles maison',
      tagline: 'Tout est activé',
      description:
        'Les 7 échangent les mains, les 0 les font tourner, les jokers d’échange rejoignent le paquet, et une carte piochée doit être jouée.',
      facts: ['échanges 7-0', 'jokers d’échange', 'jeu forcé'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartes distribuées',
      group: 'La donne',
      help: 'Combien de cartes chaque place reçoit au départ.',
    },
    turnTimeSeconds: {
      label: 'Secondes par tour',
      group: 'Chronos',
      help: 'Quand le chrono s’épuise, la table joue un coup légal pour cette place.',
    },
    matchTimeMinutes: {
      label: 'Minutes de partie',
      group: 'Chronos',
      help: 'À zéro, le joueur à la main restante la plus légère gagne.',
    },
    stackDrawTwo: {
      label: 'Cumuler les +2',
      group: 'Pénalités',
      help: 'Réponds à un +2 par le tien et fais passer la pile grandissante.',
    },
    stackDrawFour: {
      label: 'Cumuler les +4',
      group: 'Pénalités',
      help: 'Pareil pour les +4. Les pénalités peuvent monter vite.',
    },
    jumpIn: {
      label: 'Carte claquée',
      group: 'Règles de la maison',
      help: 'Tu tiens exactement la carte qui vient d’être jouée ? Claque-la hors de ton tour.',
    },
    drawToMatch: {
      label: 'Pioche jusqu’à pouvoir jouer',
      group: 'Règles de la maison',
      help: 'Pioche jusqu’à ce qu’une carte suive, au lieu d’en piocher une seule.',
    },
    forcePlay: {
      label: 'Jeu forcé',
      group: 'Règles de la maison',
      help: 'Une carte piochée qui peut être jouée doit être jouée.',
    },
    sevenZero: {
      label: 'Sept et zéros',
      group: 'Règles de la maison',
      help: 'Joue un 7 pour échanger ta main avec quelqu’un ; joue un 0 pour faire tourner toutes les mains.',
    },
    challengeDrawFour: {
      label: 'Défier les +4',
      group: 'Règles de la maison',
      help: 'Un +4 n’est honnête que sans rien dans la couleur en cours. Dénonce le bluff : gagné, il ramasse les cartes ; perdu, tu en prends deux de plus.',
    },
    swapCards: {
      label: 'Jokers d’échange',
      group: 'Le paquet',
      help: 'Ajoute le Joker échange et le Joker mélange à la donne.',
    },
  },
  presets: {
    classic: 'Wild classique',
    party: 'Pile en fête',
    houseRules: 'Règles maison',
  },
};
