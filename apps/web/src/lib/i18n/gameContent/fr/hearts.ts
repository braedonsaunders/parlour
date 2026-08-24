import type { GameCopy } from '../types';

/** French copy for hearts. Untranslated fields fall back to the pack's English. */
export const heartsFr: GameCopy = {
  name: 'Cœurs',
  subtitle: 'le jeu d’évitement',
  tagline: 'Ne prends aucun cœur',
  description:
    'Esquive chaque cœur, fuis la Dame noire et fais porter les points à quelqu’un d’autre. Passes tournantes, choix secrets, une dame bien acérée.',
  facts: ['4 joueurs', 'passe · pli · évite', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Le classique de l’évitement — ne prends aucun cœur, esquive la Dame noire et laisse un autre avaler les points.',
    objective:
      'Termine la partie avec le score le plus bas. Chaque cœur capturé coûte 1 point et la dame de pique en coûte 13 ; quand un joueur franchit le seuil de fin (100 par défaut), le total le plus bas gagne.',
    sections: [
      {
        heading: 'La passe',
        body: [
          'Avant chaque donne, tu choisis trois cartes et tu les glisses à un voisin — tout le monde choisit en secret, puis les quatre passes arrivent ensemble.',
          'Le sens tourne à chaque donne : gauche, droite, en face, puis une donne sans passe du tout.',
        ],
      },
      {
        heading: 'Jouer les plis',
        body: [
          'Le deux de trèfle entame le premier pli. Suis la couleur si tu peux ; la carte la plus haute de la couleur entamée prend le pli et son vainqueur entame le suivant.',
        ],
        bullets: [
          {
            label: 'Premier pli',
            text: 'aucune carte à points ne peut y être jetée (option de la maison)',
          },
          {
            label: 'Briser les cœurs',
            text: 'on ne peut pas entamer cœur tant qu’aucun cœur n’a été défaussé sur un pli précédent — sauf si ta main n’est que des cœurs',
          },
          {
            label: 'À sec',
            text: 'plus rien dans la couleur entamée ? Jette ce que tu veux — c’est là que la dame tombe sur quelqu’un',
          },
        ],
      },
      {
        heading: 'Compter une donne',
        body: [
          'Quand les treize plis sont joués, chaque cœur capturé vaut 1 point et la dame de pique en vaut 13.',
        ],
        bullets: [
          {
            label: 'Valet de carreau',
            text: 'règle de la maison optionnelle — il rapporte −10 à qui le capture',
          },
          {
            label: 'Grand chelem',
            text: 'capture les TREIZE cœurs plus la dame et tu marques zéro pendant que tous les autres prennent +26 — ou, avec l’autre règle de la maison, ton propre score baisse de 26',
          },
        ],
      },
      {
        heading: 'La partie',
        body: [
          'Les donnes s’accumulent jusqu’à ce que quelqu’un franchisse la ligne de fin (50 / 75 / 100). Le total le plus bas remporte la partie ; les égalités partagent la couronne.',
        ],
      },
      {
        heading: 'Règles de la maison',
        body: [
          'Les paramètres de la salle règlent tout : sens de la passe, donnes sans passe, protection du premier pli, valet de carreau, seuil de fin et variante du grand chelem. Les tables classiques gardent les valeurs par défaut.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'À la lettre',
      description:
        'Passes tournantes gauche-droite-en face, une donne sans passe toutes les quatre, aucun point au premier pli. Partie en 100.',
      facts: ['partie en 100', 'dones sans passe', '~15 min'],
    },
    quickcut: {
      name: 'Rapide',
      tagline: 'Les mêmes cœurs, en plus vite',
      description:
        'Règles identiques, plafond plus bas — le premier joueur au-delà de 50 y met fin. Une partie entière le temps d’un café.',
      facts: ['partie en 50', 'dones sans passe', '~8 min'],
    },
    cutthroat: {
      name: 'Sans pitié',
      tagline: 'Le valet se balade',
      description:
        'Le valet de carreau rapporte −10 à qui l’attrape, et les cartes à points volent dès le premier pli. Personne n’est à l’abri.',
      facts: ['J♦ −10', 'points dès le premier pli', 'partie en 100'],
    },
  },
  fields: {
    passDirection: {
      label: 'Passe',
      options: {
        left: 'Gauche',
        right: 'Droite',
        across: 'En face',
        hold: 'Sans passe',
      },
    },
    holdHand: {
      label: 'Donne sans passe toutes les quatre',
    },
    noPointsFirstTrick: {
      label: 'Aucune carte à points au premier pli',
    },
    jackDiamonds: {
      label: 'Le valet de carreau rapporte −10',
    },
    gameOver: {
      label: 'Fin de partie à',
      options: {
        '50': '50 points',
        '75': '75 points',
        '100': '100 points',
      },
    },
    moonShift: {
      label: 'Grand chelem',
      options: {
        opponents: '+26 pour tous les autres',
        self: '−26 sur ton propre score',
      },
    },
  },
  presets: {
    classic: 'Cœurs classique',
    quickcut: 'Rapide',
    cutthroat: 'Sans pitié',
  },
};
