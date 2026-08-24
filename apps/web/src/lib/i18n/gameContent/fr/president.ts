import type { GameCopy } from '../types';

/** French copy for president. Untranslated fields fall back to the pack's English. */
export const presidentFr: GameCopy = {
  name: 'Président',
  subtitle: 'le jeu d’ascension',
  tagline: 'Grimpe jusqu’à la couronne',
  description:
    'Couvre le tas avec un jeu plus fort, débarrasse-toi de ta main en premier, et monte de Trouduc à Président. Jusqu’à huit places, couronnes et humiliations incluses.',
  facts: ['4–8 joueurs', 'rôles et échanges', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Le grand jeu d’ascension — débarrasse-toi de ta main en premier, grimpe l’échelle de Trouduc à Président, et fais servir les cartes par tes rivaux.',
    objective:
      'Termine chaque donne à la meilleure place possible. Le premier sortant est Président, le dernier est Trouduc. Les points de position s’accumulent d’une donne à l’autre ; le premier au total cible gagne la partie.',
    sections: [
      {
        heading: 'Jouer sur le tas',
        body: [
          'Le joueur qui entame ouvre le pli avec n’importe quel jeu — une carte seule, une paire, un brelan ou un carré d’un même rang.',
          'Dans le sens horaire, chacun doit couvrir le tas avec le MÊME nombre de cartes d’un rang strictement supérieur, ou passer.',
        ],
        bullets: [
          {
            label: 'Ordre des rangs',
            text: 'le 3 est le plus faible, on monte jusqu’à l’as, et le 2 trône au-dessus de tout',
          },
          {
            label: 'Passer',
            text: 'passer ne saute que ce tour-là — si quelqu’un couvre le tas plus tard dans le pli, tu reviens en jeu (sauf si la règle du passe définitif est active)',
          },
          {
            label: 'Remporter le pli',
            text: 'quand tout le monde a passé, le tas est balayé et le vainqueur entame ce qu’il veut',
          },
          {
            label: 'Un 2 dégage',
            text: 'un 2 seul remporte le tas sur-le-champ et garde l’entame — règle de la maison, active par défaut',
          },
        ],
      },
      {
        heading: 'Finir une donne',
        body: [
          'À court de cartes, tu verrouilles la prochaine place sur l’échelle. Le jeu continue jusqu’à ce qu’il ne reste qu’un joueur avec des cartes en main — le Trouduc.',
          'Le premier sortant est Président, le deuxième Vice-Président, l’avant-dernier Vice-Trouduc, et la dernière place est Trouduc.',
        ],
      },
      {
        heading: 'Les points et la partie',
        body: [
          'Chaque donne rapporte des points de position : le Président marque autant de points qu’il y a de places, le suivant un de moins, jusqu’à un seul point pour le Trouduc.',
          'La partie s’arrête dès que quelqu’un atteint la cible — le plus haut total gagne, les ex æquo partagent la couronne.',
        ],
      },
      {
        heading: 'L’échange',
        body: [
          'Avant la donne suivante, les places basses paient tribut depuis leurs nouvelles mains et les places hautes renvoient ce qu’elles veulent :',
        ],
        bullets: [
          {
            label: 'Trouduc → Président',
            text: 'les deux meilleures cartes du Trouduc ; le Président en renvoie deux au choix',
          },
          { label: 'Vice-Trouduc → Vice-Président', text: 'une carte dans chaque sens' },
          {
            label: 'Option désactivée',
            text: 'désactive l’échange dans les réglages de la salle pour un chacun-pour-soi plus pur',
          },
        ],
      },
      {
        heading: 'Règles de la maison',
        body: ['Règle la table dans les paramètres de la salle avant de commencer :'],
        bullets: [
          {
            label: 'Un 2 dégage le tas',
            text: 'actif par défaut — désactivé, un 2 est juste une carte imbattable de plus',
          },
          {
            label: 'Passes définitives',
            text: 'une fois passé, tu restes hors du pli jusqu’au bout (désactivé par défaut : tu reviens quand le tas change)',
          },
          { label: 'Échange', text: 'l’échange de cartes par rôles entre les donnes' },
          {
            label: 'Points cibles',
            text: 'la taille de la partie — 7 pour un sprint, 11 pour une session, 21 pour un marathon',
          },
        ],
      },
      {
        heading: 'Savoir-vivre à table',
        body: [
          'La première donne commence à la place de départ ; ensuite, le Président en place entame chaque donne.',
          'Les cartes sont distribuées une à une jusqu’à épuisement du talon, donc les tables impaires laissent certaines places à une carte de moins — tout le monde est dans le même bateau.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'L’échelle complète',
      description:
        'Couronnes, tributs et revanche — le premier à onze points remporte le salon. Comme on y joue au pub.',
      facts: ['le premier à 11', 'échange activé', 'le 2 dégage'],
    },
    rapid: {
      name: 'Rapide',
      tagline: 'Court et relevé',
      description:
        'Le premier à sept fait tourner la table. Mêmes règles, moins de donnes, revanches plus bruyantes.',
      facts: ['le premier à 7', '~10 min', 'génial à 6+'],
    },
    marathon: {
      name: 'Marathon',
      tagline: 'Longs règnes',
      description:
        'Vingt-et-un points de politique. Les Trouducs deviennent Présidents, les dynasties naissent et tombent.',
      facts: ['le premier à 21', 'longue session', 'arc complet'],
    },
  },
  fields: {
    twoClears: {
      label: 'Un 2 dégage le tas',
    },
    passLocks: {
      label: 'Passer t’exclut du pli',
    },
    trading: {
      label: 'Échange de cartes par rôles entre les donnes',
    },
    targetPoints: {
      label: 'Le premier à (points)',
    },
  },
  presets: {
    classic: 'Salon classique',
    rapid: 'Cabinet rapide',
    marathon: 'Marathon',
  },
};
