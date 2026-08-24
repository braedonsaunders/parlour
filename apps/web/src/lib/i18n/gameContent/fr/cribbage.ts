import type { GameCopy } from '../types';

/** French copy for cribbage. Untranslated fields fall back to the pack's English. */
export const cribbageFr: GameCopy = {
  name: 'Cribbage',
  subtitle: 'la course aux fiches',
  tagline: 'Fiche jusqu’à 121',
  description:
    'La grande course de pub — fabrique des quinzes, des suites et des paires dans ta main, fiche-les sur le plateau, et prie pour que personne ne retourne un valet derrière toi.',
  facts: ['2 joueurs', 'classique · sans pitié', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'La grande course de pub — fabrique des combinaisons qui rapportent dans ta main, puis fiche-les jusqu’à 121.',
    objective:
      'Sois le premier à ficher 121 points sur le plateau. Les points viennent deux fois : en jouant les cartes sur la table (le fichage) puis en comptant ta main et le crib au décompte.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Tu reçois six cartes. Gardes-en quatre et glisses-en deux, face cachée, dans le CRIB — une main bonus qui rapporte à celui qui donne.',
          'Donne généreusement quand le crib est à toi, prudemment quand il est à l’autre.',
        ],
      },
      {
        heading: 'La coupe',
        body: [
          'Le donneur coupe le talon pour révéler la carte de départ, commune à toutes les mains.',
          'Couper un valet rapporte ses TALONS — deux points immédiats pour le donneur.',
        ],
      },
      {
        heading: 'Le fichage',
        body: [
          'En commençant à gauche du donneur, chacun pose une carte à tour de rôle en tenant le compte courant des valeurs (les figures valent 10). Tu ne peux jamais faire dépasser 31 au compte.',
          'Marque en jouant :',
        ],
        bullets: [
          { label: 'Quinze', text: 'ta carte porte le compte courant à exactement 15 — 2 points' },
          {
            label: 'Paire / brelan / carré',
            text: 'même rang que la carte précédente — 2 / 6 / 12 points',
          },
          {
            label: 'Suite',
            text: 'trois cartes ou plus qui se suivent, dans n’importe quel ordre — 1 point par carte',
          },
          { label: 'Trente-et-un', text: 'ta carte porte le compte à exactement 31 — 2 points' },
          {
            label: 'Go et dernière carte',
            text: 'si personne ne peut jouer sous 31, le dernier à avoir posé une carte marque 1 et le compte repart à zéro',
          },
        ],
      },
      {
        heading: 'Le décompte',
        body: [
          'Après le fichage, chacun compte à voix haute : d’abord la main du non-donneur, puis celle du donneur, puis le crib. La carte de départ compte comme cinquième carte.',
        ],
        bullets: [
          {
            label: 'Quinzes',
            text: 'chaque combinaison de cartes dont la somme fait 15 — 2 points chacune',
          },
          { label: 'Paires', text: 'une paire 2, un brelan 6, un carré 12' },
          {
            label: 'Suites',
            text: 'les suites rapportent par carte ; les suites doubles se multiplient (7-7-8-9 = 12)',
          },
          {
            label: 'Couleur',
            text: 'quatre cartes de même couleur dans ta MAIN rapportent 4, cinq avec une carte de départ assortie. Dans le CRIB, seule une couleur aux cinq cartes compte.',
          },
          {
            label: 'Son valet',
            text: 'un valet de la couleur de la carte de départ — 1 point',
          },
        ],
      },
      {
        heading: 'Victoire et skunks',
        body: [
          'Le premier à 121 gagne, même en plein décompte. La donne alterne à chaque manche.',
          'Avec la règle du skunk, un perdant qui finit sous 90 est SKUNKÉ — une vraie humiliation à savourer.',
        ],
      },
      {
        heading: 'Règles de la maison',
        body: ['Les réglages de la salle tranchent les disputes de pub :'],
        bullets: [
          { label: 'Skunks', text: 'signale les perdants sous 90 (activé par défaut)' },
          {
            label: 'Muggins',
            text: 'si tu oublies de réclamer des points gagnés à la table, ton adversaire peut te les voler (désactivé par défaut) — réclame vite !',
          },
        ],
      },
    ],
  },
  modes: {
    'classic-pub': {
      name: 'Pub classique',
      tagline: 'Le vrai jeu',
      description:
        'Six cartes, deux au crib, et une longue course de fiches jusqu’à 121. Les skunks comptent — finis sous 90 et on t’en parlera pour toujours.',
      facts: ['course à 121', 'ligne de skunk à 90', '~10–15 min'],
    },
    cutthroat: {
      name: 'Sans pitié',
      tagline: 'Muggins te regarde',
      description:
        'Même course, griffes plus longues : oublie de réclamer tes points à la table et ton adversaire les prend pour toi.',
      facts: ['muggins activé', 'vole les points oubliés', 'aucune pitié'],
    },
    'match-play': {
      name: 'Match',
      tagline: 'Le meilleur de trois manches',
      description:
        'Une vraie longue soirée : cours jusqu’à 121, remets les fiches à zéro, puis recommence. Le premier à gagner deux parties complètes remporte le match.',
      facts: ['2 parties gagnantes', 'la donne alterne', '~25–40 min'],
    },
  },
  fields: {
    skunks: {
      label: 'Ligne de skunk à 90',
    },
    muggins: {
      label: 'Muggins (voler les points oubliés)',
    },
    gamesToWin: {
      label: 'Parties à gagner',
    },
  },
  presets: {
    'classic-pub': 'Pub classique',
    cutthroat: 'Sans pitié',
    'match-play': 'Match',
    friendly: 'Amical',
  },
};
