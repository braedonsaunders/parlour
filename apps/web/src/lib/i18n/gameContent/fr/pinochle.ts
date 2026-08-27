import type { GameCopy } from '../types';

/** French copy for pinochle. Untranslated fields fall back to the pack's English. */
export const pinochleFr: GameCopy = {
  name: 'Pinocle',
  subtitle: 'le jeu en duo',
  tagline: 'Enchéris, déclare, ramasse les plis',
  description:
    'Assieds-toi face à ton partenaire, remporte les enchères, annonce l’atout et pose ta déclaration. As, dix et rois sont les cartes qui comptent — remplis ton contrat, ou tu es chuté.',
  facts: ['4 joueurs · 2v2', 'enchères · déclaration · plis', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Le classique américain en duo — enchéris, annonce l’atout, déclare, puis joue les plis.',
    objective:
      'Assis face à ton partenaire, remporte les enchères et remplis ton contrat — déclaration plus points de plis au moins égaux à ton annonce. La première équipe à atteindre le score cible après une manche complète remporte la partie.',
    sections: [
      {
        heading: 'La table',
        body: [
          'Quatre joueurs, deux équipes : toi et le joueur en face de toi êtes partenaires. Chaque manche distribue le double jeu complet de 48 cartes — douze chacun, pas de mort. La donne tourne à gauche à chaque manche.',
        ],
      },
      {
        heading: 'Les enchères',
        body: [
          'En commençant à la gauche du donneur, chaque joueur passe ou enchérit plus haut que l’enchère précédente. Une fois que tu passes, tu es hors jeu pour la manche. Le dernier joueur restant avec une enchère remporte les enchères et annonce l’atout. Si tout le monde passe sans qu’aucune enchère n’ait été faite, la manche est annulée et redistribuée par le même donneur.',
        ],
        bullets: [
          {
            label: 'Enchère d’ouverture',
            text: 'doit dépasser le minimum de la table (25 en mode Classique)',
          },
          {
            label: 'Surenchères',
            text: 'n’importe quel entier supérieur, jusqu’à un plafond de 60',
          },
        ],
      },
      {
        heading: 'La déclaration',
        body: [
          'Une fois l’atout annoncé, chaque joueur pose sa déclaration pour marquer des points. Les cartes restent en main — déclarer, c’est marquer des points, pas défausser — et la table la calcule pour toi, personne ne peut donc se tromper.',
        ],
        bullets: [
          { label: 'Suite à l’atout', text: 'as-10-roi-dame-valet d’atout, 15 points' },
          {
            label: 'Mariage',
            text: 'roi + dame d’une couleur — 4 si atout (2 de plus si c’est une deuxième paire en plus de la suite), 2 sinon',
          },
          {
            label: 'Pinocle',
            text: 'dame de pique + valet de carreau vaut 4 ; posséder les deux exemplaires de chacune est un double pinocle qui vaut 30',
          },
          {
            label: 'Carrés',
            text: 'une carte d’un rang dans les quatre couleurs — as 10, rois 8, dames 6, valets 4',
          },
          { label: 'Dix', text: 'chaque 9 d’atout que tu détiens vaut 1' },
        ],
      },
      {
        heading: 'Jouer les plis',
        body: [
          'L’enchérisseur entame le premier pli. Tu dois fournir la couleur demandée si tu le peux ; l’atout bat une couleur non demandée qui n’est pas l’atout, sinon la carte la plus haute l’emporte. As, dix et rois valent chacun 10 points quand ils sont capturés dans un pli ; le dernier pli vaut 10 points de plus. Le gagnant d’un pli entame le suivant.',
        ],
      },
      {
        heading: 'Compter une manche',
        body: [
          'Ajoute la déclaration de l’équipe qui a enchéri aux points de plis qu’elle a remportés. Si le contrat est rempli, elle marque le total complet. Sinon, elle est chutée — elle perd exactement le montant de son enchère, déclaration comprise. L’autre équipe marque toujours ses propres points de plis, et sa déclaration aussi, sauf si la table l’a désactivée.',
        ],
      },
      {
        heading: 'La partie',
        body: [
          'Les manches s’accumulent jusqu’à ce qu’une équipe atteigne l’objectif (100 / 150 / 500). Si les deux équipes le franchissent dans la même manche, l’équipe qui a enchéri remporte la partie directement, sauf si elle est chutée — dans ce cas, elle perd le départage face au score le plus élevé, l’enchérisseur remportant tout ex æquo restant.',
        ],
      },
      {
        heading: 'Règles maison',
        body: [
          'Les réglages de la salle changent le score cible, l’enchère minimale d’ouverture, et si les adversaires marquent leur déclaration. Les tables Classiques gardent les valeurs par défaut.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Partie en 150',
      description:
        'Pinocle en duo jusqu’à 150, enchère d’ouverture minimale de 25. Le jeu tel qu’on y joue à chaque table de cuisine.',
      facts: ['partie en 150', 'enchère min. 25', '~30 min'],
    },
    quick: {
      name: 'Rapide',
      tagline: 'Premier à 100',
      description:
        'Mêmes règles, course plus courte — 100 points, enchère d’ouverture plus basse, terminé plus vite.',
      facts: ['partie en 100', 'enchère min. 20', '~15 min'],
    },
    marathon: {
      name: 'Marathon',
      tagline: 'Partie en 500',
      description:
        'Une longue lutte en duo jusqu’à 500 — chaque déclaration et chaque chute comptent.',
      facts: ['partie en 500', 'enchère min. 25', '~90 min'],
    },
  },
  fields: {
    target: {
      label: 'Partie en',
      group: 'Partie',
      help: 'Après chaque manche, la première équipe à atteindre ou dépasser ce score remporte la partie.',
      options: {
        '100': '100 — rapide',
        '150': '150 — classique',
        '500': '500 — marathon',
      },
    },
    minBid: {
      label: 'Enchère minimale',
      group: 'Enchères',
      help: 'L’enchère d’ouverture doit dépasser ce minimum. Chaque enchère suivante doit battre la précédente, jusqu’à 60.',
    },
    opponentsScoreMeld: {
      label: 'Les adversaires marquent leur déclaration',
      group: 'Score',
      help: 'Si désactivé, l’équipe qui n’a pas enchéri ne marque que les points de plis remportés — pas sa déclaration.',
    },
  },
  presets: {
    classic: 'Classique',
    quick: 'Rapide',
    marathon: 'Marathon',
  },
};
