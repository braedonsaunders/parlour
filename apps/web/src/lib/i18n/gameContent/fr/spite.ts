import type { GameCopy } from '../types';

/** French copy for spite. Untranslated fields fall back to the pack's English. */
export const spiteFr: GameCopy = {
  name: 'Spite & Malice',
  subtitle: 'la course à la pile gagnante',
  tagline: 'Rends-leur la monnaie de leur carte',
  description:
    'Monte les piles du centre de l’As à la Dame, vide ta pile gagnante et ruine les plans des autres avec des jokers bien placés. Le nom du jeu, c’est la règle.',
  facts: ['2–4 joueurs', 'classique · rapide · sans pitié', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Spite & Malice — monte les piles communes du centre de l’As à la Dame et vide ta pile gagnante avant tout le monde.',
    objective:
      'Sois le premier joueur à vider ta pile gagnante. Chaque carte que tu y laisses enfermée, c’est un autre joueur qui s’en réjouira.',
    sections: [
      {
        heading: 'La table',
        body: ['Quatre sortes de cartes, quatre endroits où les poser :'],
        bullets: [
          {
            label: 'Pile gagnante',
            text: 'ta pile d’objectif, face cachée ; la carte du dessus est face visible',
          },
          {
            label: 'Main',
            text: 'cinq cartes, complétées à cinq au début de ton tour',
          },
          {
            label: 'Piles de défausse',
            text: 'quatre piles personnelles — finir ton tour, c’est te défausser sur l’une d’elles',
          },
          {
            label: 'Piles du centre',
            text: 'jusqu’à quatre constructions communes sur lesquelles tout le monde joue',
          },
        ],
      },
      {
        heading: 'Ton tour',
        body: [
          'D’abord, pioche pour revenir à cinq cartes. Ensuite, fais autant de coups que tu veux, dans l’ordre que tu veux :',
          'joue sur une pile du centre, joue le dessus de ta pile gagnante, ou joue le dessus de l’une de tes piles de défausse.',
          'Ton tour ne se termine que lorsque tu te défausses d’une carte de ta main sur l’une de tes piles de défausse.',
        ],
      },
      {
        heading: 'Construire',
        body: [
          'Une pile du centre commence par un As et monte rang par rang jusqu’à la Dame. La couleur n’a aucune importance.',
          'Termine une pile à la Dame et elle repart entièrement dans le talon — la pile repart à zéro, en attendant un As ou un joker.',
        ],
      },
      {
        heading: 'Les jokers',
        bullets: [
          {
            label: 'Rois',
            text: 'jokers — joue-les comme n’importe quel rang, et ce rang est mémorisé pour la pile',
          },
          {
            label: 'Jokers',
            text: 'exactement pareil quand la table les mélange au jeu',
          },
          {
            label: 'Rangs mémorisés',
            text: 'un joker qui tient lieu de 6 fait de la carte suivante un 7, peu importe qui la joue',
          },
        ],
      },
      {
        heading: 'La pile gagnante',
        body: [
          'Jouer le dessus de ta pile gagnante retourne aussitôt la carte suivante face visible — et si c’était ta dernière, tu gagnes sur-le-champ, en plein tour, sans défausse.',
          'Coincé sans rien à jouer ? Défausse-toi à bon escient : ce que tu mets de côté maintenant, c’est un coup que tu débloqueras plus tard.',
        ],
      },
      {
        heading: 'Talon à sec',
        body: [
          'Les piles terminées repartent directement dans le talon, donc le paquet continue de circuler.',
          'Si le talon est à sec au début de ton tour, toutes les piles du centre à moitié montées y retournent aussi — on redemande un As et les cartes enterrées sortent de leur tombe.',
          'Et si la table se bloque complètement, c’est la pile gagnante la plus proche du vide qui l’emporte plutôt que de laisser tout le monde poireauter.',
        ],
      },
      {
        heading: 'Façons de jouer',
        bullets: [
          {
            label: 'Classique',
            text: 'la grande course avec 20 cartes dans la pile gagnante — prévois le goûter',
          },
          {
            label: 'Rapide',
            text: 'une pile gagnante de 10 cartes pour une vengeance éclair',
          },
          {
            label: 'Sans pitié',
            text: '13 cartes dans la pile gagnante et pas de pioche en cours de tour : vide ta main trop tôt et tu joueras à découvert',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'La grande course',
      description:
        'Vingt cartes enterrées dans chaque pile gagnante et tous les jokers du paquet. Le jeu tel qu’il mérite d’être savouré.',
      facts: ['pile gagnante de 20', 'rois et jokers sauvages', '~15 min'],
    },
    quick: {
      name: 'Rapide',
      tagline: 'Rancune courte',
      description:
        'Des piles gagnantes de dix cartes, tout le reste intact — mêmes jokers, même malice, moitié moins d’attente avant ta revanche.',
      facts: ['pile gagnante de 10', 'tous les jokers', '~5–8 min'],
    },
    cutthroat: {
      name: 'Sans pitié',
      tagline: 'Ni merci, ni pioche',
      description:
        'Treize cartes à vider et aucune pioche en cours de tour : vide ta main au mauvais moment et tu joueras à découvert pendant qu’un autre gagne.',
      facts: ['pile gagnante de 13', 'pas de pioche en cours de tour', 'impitoyable'],
    },
  },
  fields: {
    payoffSize: {
      label: 'Pile gagnante',
      help: 'Cartes enterrées dans chaque pile gagnante. Vide la tienne pour gagner — les petits chiffres font des parties plus courtes.',
      group: 'La donne',
    },
    handSize: {
      label: 'Cartes distribuées',
      help: 'Taille de la main, complétée au début de chaque tour.',
      group: 'La donne',
    },
    discardPiles: {
      label: 'Piles de défausse',
      help: 'Piles devant chaque joueur. Finir un tour, c’est se défausser sur l’une d’elles.',
      group: 'La donne',
    },
    kingsWild: {
      label: 'Les Rois sont jokers',
      help: 'Un Roi tient lieu du rang que tu annonces. Désactivé, aucun Roi n’est distribué.',
      group: 'Jokers',
    },
    jokersWild: {
      label: 'Les Jokers sont jokers',
      help: 'Les Jokers se jouent exactement comme les Rois. Désactivé, aucun n’est distribué.',
      group: 'Jokers',
    },
    buildPiles: {
      label: 'Piles du centre',
      help: 'Piles communes sur lesquelles tout le monde joue. Moins il y en a, plus tu attends l’As d’un autre.',
      group: 'Le centre',
    },
    refillMidTurn: {
      label: 'Pioche en cours de tour',
      help: 'Vide ta main et elle se complète aussitôt à cinq pour continuer. Désactivé, c’est sans pitié.',
      group: 'Règles de la maison',
    },
  },
  presets: {
    classic: 'Classique',
    quick: 'Rapide',
    cutthroat: 'Sans pitié',
  },
};
