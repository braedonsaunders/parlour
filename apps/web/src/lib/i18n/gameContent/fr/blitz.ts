import type { GameCopy } from '../types';

/** French copy for blitz. Untranslated fields fall back to the pack's English. */
export const blitzFr: GameCopy = {
  name: 'Blitz',
  subtitle: 'le jeu du 31',
  tagline: 'File vers le 31',
  description:
    'Pioche, échange et frappe pour atteindre 31 dans une seule couleur. Trois formats de partie, des robots rusés et une célébration très bruyante.',
  facts: ['2–4 joueurs', 'classique · rapide · chronométré', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Le classique du pub, le 31 — pioche, échange et frappe pour réunir une couleur qui vaut 31.',
    objective:
      'Avoir une main plus forte que tout le monde à la fin de la manche. Une main compte sa meilleure couleur : A=11, figures=10, cartes numérotées leur valeur. 31 dans une seule couleur, c’est un BLITZ, et ça gagne sur-le-champ.',
    sections: [
      {
        heading: 'Ton tour',
        body: ['Tu as deux actions :'],
        bullets: [
          {
            label: 'Piocher',
            text: 'prends la carte du dessus du talon, ou rafle le dessus de la défausse',
          },
          {
            label: 'Défausser',
            text: 'glisse une carte de ta main, face visible, sur la pile',
          },
        ],
      },
      {
        heading: 'Compter une main',
        body: [
          'Seule ta meilleure couleur compte. Trois cœurs qui totalisent 27 battent trois cartes mélangées qui totalisent 30.',
          'Un brelan est une main spéciale qui vaut 30½ (option de la maison).',
        ],
      },
      {
        heading: 'Frapper',
        body: [
          'Au lieu de piocher, tu peux FRAPPER pour clore la manche. Tout le monde a exactement un dernier tour, puis les mains se retournent pour le dénouement.',
          'La main la plus faible perd une vie. Si c’est TOI qui as frappé et que tu finis à égalité ou dernier, la pénalité est pour toi — frappe avec assurance.',
        ],
      },
      {
        heading: 'Blitz !',
        body: [
          '31 dans une seule couleur et la manche explose aussitôt — tous les autres joueurs perdent une vie, sans dénouement.',
          'Un Blitz servi avant ton premier tour ? Ça compte. N’hésite pas à fanfaronner.',
        ],
      },
      {
        heading: 'Formats de partie',
        bullets: [
          {
            label: 'Classique',
            text: 'perds une vie à chaque manche perdue ; le dernier joueur avec des vies gagne',
          },
          {
            label: 'Rapide',
            text: 'manches indépendantes, compteur de victoires, redonne immédiate',
          },
          {
            label: 'Chronométré',
            text: 'horloge de partie, tours forcés au chrono, le plus de manches gagnées au gong l’emporte',
          },
        ],
      },
      {
        heading: 'Règles de la maison',
        body: [
          'Chaque table se règle dans les paramètres de la salle — vies, pénalités de frappe, égalités, brelan, verrou de défausse et chronos de tour s’y trouvent.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Des vies en jeu',
      description:
        'Perds une manche, perds une vie. Frappe tôt ou vise le 31 parfait — le dernier joueur avec des jetons remporte la partie.',
      facts: ['3 vies chacun', 'le dernier debout', '~5–10 min'],
    },
    fast: {
      name: 'Rapide',
      tagline: 'Une manche à la fois',
      description:
        'Des manches indépendantes, une redonne immédiate. La meilleure main remporte le pot — le premier à trois gagne la partie.',
      facts: ['le premier à 3 victoires', 'pas d’élimination', '~2–4 min'],
    },
    timed: {
      name: 'Chronométré',
      tagline: 'Course contre le gong',
      description:
        'Une horloge de partie de trois minutes et des tours éclair. Le plus de manches gagnées à la cloche l’emporte.',
      facts: ['horloge de 3:00', 'chrono de 7 s par tour', 'égalités en mort subite'],
    },
  },
  fields: {
    threeOfAKind: {
      label: 'Brelan',
      options: {
        '30.5': 'Vaut 30.5',
        '30': 'Vaut 30',
        off: 'Désactivé',
      },
    },
    tieLowest: {
      label: 'Derniers à égalité',
      options: {
        both: 'Les deux perdent',
        nobody: 'Personne ne perd',
        redeal: 'Redonne entre les ex æquo',
      },
    },
    discardLock: {
      label: 'Verrouiller la défausse que tu viens de piocher',
    },
  },
  presets: {
    'classic-pub': 'Pub classique',
    cutthroat: 'Sans pitié',
    friendly: 'Amicale',
  },
};
