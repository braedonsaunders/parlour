import type { GameCopy } from '../types';

/** French copy for ratscrew. Untranslated fields fall back to the pack's English. */
export const ratscrewFr: GameCopy = {
  name: 'Bataille corse',
  subtitle: 'le jeu de tapes',
  tagline: 'Tape le tas la première',
  description:
    'Retourne tes cartes sur un tas commun et tape les doubles, les sandwichs et plus encore avant tout le monde. Réflexes en temps réel, défis de figures, cartes brûlées pour les fausses tapes.',
  facts: ['2–4 joueurs', 'tapes en temps réel', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Retourne des cartes à tour de rôle sur un tas commun et TAPE pour gagner toutes les cartes de la table.',
    objective:
      'Gagne les 52 cartes. Tu grossis ton paquet en tapant les motifs en premier ou en posant des figures auxquelles tes adversaires ne peuvent pas répondre. Quand tout le monde est à court de cartes — ou tape pour revenir en jeu — tu remportes la partie.',
    sections: [
      {
        heading: 'Retourner les cartes',
        body: [
          'En commençant par toi, chacun pose à tour de rôle la carte du dessus de son paquet face cachée sur le tas central, en la retournant loin de soi pour que personne ne triche.',
          'Si ton paquet s’épuise, tu arrêtes de retourner — mais avec Retour par la tape activé, une seule tape chanceuse te remet directement en jeu.',
        ],
      },
      {
        heading: 'Figures et défis',
        body: ['Une figure lance un défi contre le joueur suivant dans l’ordre du tour :'],
        bullets: [
          { label: 'Valet', text: 'il a 1 chance de retourner une autre figure' },
          { label: 'Dame', text: '2 chances' },
          { label: 'Roi', text: '3 chances' },
          { label: 'As', text: '4 chances' },
        ],
      },
      {
        heading: 'Résoudre un défi',
        body: [
          'Chaque carte qui n’est pas une figure brûle une des chances du joueur défié.',
          'Il retourne une nouvelle figure ? Le défi fait le tour de la table avec des chances fraîches pour le joueur suivant.',
          'Il est à court de chances ? Le joueur de la figure ramasse tout le tas central sous son paquet et entame le prochain retournement.',
        ],
      },
      {
        heading: 'Les tapes',
        body: [
          'Dès qu’un motif tappable tombe sur le tas, TOUT LE MONDE se précipite pour taper. La première tape valide gagne tout le tas central et entame la suite.',
          'Une courte fenêtre de tape s’ouvre chaque fois qu’un motif est en jeu — écrase le bouton TAPE avant qu’elle ne se referme !',
        ],
        bullets: [
          { label: 'Double', text: 'deux cartes du même rang à la suite (7♦ 7♣)' },
          { label: 'Sandwich', text: 'même rang avec une carte entre les deux (7♦ Q♠ 7♥)' },
          {
            label: 'Mariage',
            text: 'un roi et une dame à la suite, dans n’importe quel ordre (K♦ Q♠) — option de la maison',
          },
          {
            label: 'Dix',
            text: 'deux cartes à points consécutives dont la somme fait dix (3♦ 7♠) — option de la maison',
          },
          {
            label: 'Haut-bas',
            text: 'la carte du dessus correspond à celle tout en bas du tas — option de la maison',
          },
          {
            label: 'Suite',
            text: 'trois rangs qui montent ou descendent d’affilée (4-5-6 ou 9-8-7) — option de la maison',
          },
        ],
      },
      {
        heading: 'Fausses tapes',
        body: [
          'Taper sans motif en jeu te coûte cher : avec Fausse tape brûlante activé, ta carte du dessus glisse sous le tas en pénalité. Les nerfs coûtent cher — garde les yeux sur les cartes, pas sur le public.',
        ],
      },
      {
        heading: 'Règles de la maison',
        body: ['Règle le chaos dans les paramètres de la salle avant de commencer :'],
        bullets: [
          {
            label: 'Doubles / Sandwichs',
            text: 'les motifs de tape classiques, tous deux actifs par défaut',
          },
          {
            label: 'Mariage / Dix / Haut-bas / Suites',
            text: 'motifs supplémentaires, tous désactivés par défaut pour une table classique',
          },
          {
            label: 'Fausse tape brûle une carte',
            text: 'actif par défaut ; désactivé, seuls les motifs en jeu peuvent être tapés',
          },
          {
            label: 'Retour par la tape',
            text: 'les joueurs à court de cartes peuvent encore taper un motif en jeu pour gagner le tas et revenir',
          },
          {
            label: 'Fenêtre de tape',
            text: 'la durée pendant laquelle la course reste ouverte — plus court, plus cruel',
          },
        ],
      },
      {
        heading: 'Savoir-vivre à table',
        body: [
          'Le vainqueur du tas le glisse sous son paquet sans mélanger et retourne la suivante. Le dernier joueur à détenir toutes les cartes remporte la partie.',
          'Un bref moment de grâce garde les tapes à distance honnêtes : la table attend un temps après la fenêtre avant de la déclarer close.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Tape classique',
      tagline: 'Doubles et sandwichs',
      description:
        'Le standard du pub : retourne vite, guette les doubles et les sandwichs, et tape avant que la fenêtre ne se referme.',
      facts: ['fenêtre de tape 1,2 s', 'fausses tapes brûlent', '~8 min'],
    },
    'quick-reflex': {
      name: 'Réflexe éclair',
      tagline: 'Fenêtres cruelles',
      description:
        'Les mêmes motifs classiques sur une gâchette ultra-sensible — la fenêtre de tape se referme en 0,7 seconde.',
      facts: ['fenêtre de tape 0,7 s', 'pour les yeux affûtés', '~6 min'],
    },
    slaphappy: {
      name: 'Tapette folle',
      tagline: 'Tous les motifs en jeu',
      description:
        'Mariages, dix, haut-bas et suites comptent en plus des classiques. Le chaos, chaleureusement éclairé, très bruyant.',
      facts: ['tous les motifs', 'fenêtre de tape 0,8 s', '~5 min'],
    },
  },
  fields: {
    doubles: {
      label: 'Doubles',
    },
    sandwiches: {
      label: 'Sandwichs',
    },
    marriage: {
      label: 'Mariage (R+D)',
    },
    tens: {
      label: 'Les cartes font dix',
    },
    topBottom: {
      label: 'Haut-bas',
    },
    runs: {
      label: 'Suites',
    },
    misSlapBurn: {
      label: 'Fausse tape brûle une carte',
    },
    slapBackIn: {
      label: 'Retour par la tape',
    },
    slapWindowMs: {
      label: 'Fenêtre de tape',
    },
  },
  presets: {
    classic: 'Tape classique',
    'quick-reflex': 'Réflexe éclair',
    slaphappy: 'Tapette folle',
  },
};
