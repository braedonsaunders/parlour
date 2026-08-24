import type { GameCopy } from '../types';

/** French copy for ohhell. Untranslated fields fall back to the pack's English. */
export const ohhellFr: GameCopy = {
  name: 'Oh Hell',
  subtitle: 'le jeu d’annonces',
  tagline: 'Annonce tes plis. Fais exactement ça.',
  description:
    'Les mains grandissent puis rétrécissent à chaque manche pendant que tu annonces le nombre exact de plis que tu feras. La règle du croc garantit que quelqu’un se trompe — fais en sorte que ce ne soit pas toi.',
  facts: ['3–7 joueurs', 'annonce · atout · exact', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Annonce le nombre exact de plis que tu feras — ni plus, ni moins. Les mains grandissent puis rétrécissent à chaque manche jusqu’à ce que quelqu’un surclasse la table.',
    objective:
      'Sur une partie de mains qui grandissent puis rétrécissent, marque plus que tout le monde en réussissant ton annonce au pli près. Un joueur est mathématiquement condamné à chaque manche — fais en sorte que ce ne soit pas toi.',
    sections: [
      {
        heading: 'La table',
        body: [
          'De trois à sept joueurs, chacun pour soi. Une partie est une suite de manches : la première distribue une carte chacun, puis les mains grandissent jusqu’à un sommet (plafonné pour qu’il reste toujours une carte pour l’atout) et redescendent jusqu’à une. La donne tourne dans le sens horaire à chaque manche.',
        ],
      },
      {
        heading: 'La retourne',
        body: [
          'Après la donne, la carte suivante du talon est retournée face visible — sa couleur est l’atout de la manche.',
        ],
        bullets: [
          {
            label: 'Plus de carte',
            text: 'quand la donne a épuisé tout le paquet, il n’y a rien à retourner et la manche se joue sans atout',
          },
          {
            label: 'Atout coupé',
            text: 'les tables avec « atout coupé » réduisent plutôt la manche à paquet entier d’une carte, pour pouvoir couper un atout au fond du paquet',
          },
        ],
      },
      {
        heading: 'Les annonces',
        body: [
          'En partant de la gauche du donneur et dans le sens horaire, chaque place annonce un nombre de 0 à la taille de sa main : exactement combien de plis elle prétend faire. Pas de passe, pas de seconde chance.',
        ],
        bullets: [
          {
            label: 'La règle du croc',
            text: 'le donneur annonce EN DERNIER et ne peut pas faire en sorte que le total des annonces égale les plis disponibles — un joueur à cette table est forcément à côté. L’annonce interdite n’apparaît tout simplement pas sur ton cadran',
          },
          { label: 'Zéro', text: 'une annonce comme une autre : ne faire aucun pli' },
        ],
      },
      {
        heading: 'Jouer les plis',
        body: [
          'Le joueur à gauche du donneur entame le premier pli. Fournis la couleur si tu peux ; l’atout le plus haut gagne, sinon la carte la plus haute de la couleur entamée. Celui qui prend le pli entame le suivant.',
        ],
      },
      {
        heading: 'Marquer une manche',
        body: [
          'Réussis ton annonce EXACTEMENT ou ne marque rien (par défaut). Le score de manche de chaque place s’ajoute à son total ; après la dernière manche de l’arc, le total le plus haut gagne.',
        ],
        bullets: [
          {
            label: 'Exact seulement',
            text: 'une annonce réussie marque 10 + l’annonce ; tout le reste marque 0',
          },
          {
            label: 'Pénalité',
            text: 'une annonce réussie marque 10 + l’annonce ; rater coûte moins l’écart de ton erreur',
          },
          {
            label: 'Plus un',
            text: 'une annonce réussie marque le double de l’annonce ; tout le reste marque 0',
          },
        ],
      },
      {
        heading: 'Variante Wizard',
        body: [
          'Avec Sorciers et Bouffons activés, quatre Sorciers et quatre Bouffons rejoignent le paquet (60 cartes) et bousculent l’ordre habituel des choses.',
        ],
        bullets: [
          {
            label: 'Sorcier',
            text: 'bat tout ; le PREMIER Sorcier joué prend le pli. En entamer un laisse le pli sans couleur entamée — chacun peut jouer ce qu’il veut',
          },
          {
            label: 'Bouffon',
            text: 'perd contre tout ; si toutes les cartes d’un pli sont des Bouffons, le premier gagne. En entamer un renvoie la couleur entamée à la prochaine vraie carte',
          },
          {
            label: 'Retourne d’atout',
            text: 'un Sorcier retourné laisse le DONNEUR choisir l’atout ; un Bouffon retourné signifie une manche sans atout',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Monte et redescends',
      description:
        'L’arc classique — une carte, en grandissant jusqu’au sommet, puis retour à une. Règle du croc activée, annonces exactes seulement. Quelqu’un se trompe à chaque manche ; pas toi, avec un peu de chance.',
      facts: ['mains 1…sommet…1', 'règle du croc', '~20 min'],
    },
    quick: {
      name: 'Rapide',
      tagline: 'Donne large, rétrécis vite',
      description:
        'On commence à cinq cartes et on descend directement jusqu’à une. Une partie entière en dix minutes, que du nerf et pas de gras.',
      facts: ['mains 5→1', '~10 min'],
    },
    wizard: {
      name: 'Wizard',
      tagline: 'Soixante cartes, quatre certitudes',
      description:
        'Quatre Sorciers gagnent toujours et quatre Bouffons jamais. La couleur entamée se plie autour d’eux et le donneur choisit parfois l’atout. Le chaos, formalisé.',
      facts: ['paquet de 60 cartes', 'sorciers activés'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartes en main',
      help: 'Cartes distribuées à chaque joueur pour cette manche. Une partie complète règle ça automatiquement à chaque manche.',
      group: 'Partie',
    },
    dealer: {
      label: 'Place du donneur',
      help: 'La place qui donne cette manche et annonce en dernier. Une partie complète fait tourner la donne à chaque manche.',
      group: 'Partie',
    },
    handArc: {
      label: 'Arc des mains',
      help: 'Comment les tailles de main évoluent sur une partie : montée puis descente, montée seule, ou donne large puis rétrécis.',
      group: 'Partie',
      options: {
        updown: 'Monte et redescends — 1…sommet…1',
        up: 'Montée seule — 1…sommet',
        down: 'Descente seule — sommet…1',
      },
    },
    maxHand: {
      label: 'Main la plus grande',
      help: 'L’arc ne distribue jamais plus que ça — plafonné pour que chaque manche garde une carte à retourner pour l’atout.',
      group: 'Partie',
    },
    hookRule: {
      label: 'Règle du croc',
      help: 'Piège le donneur : la dernière annonce ne peut pas rendre le total exactement égal aux plis disponibles, donc quelqu’un se trompe toujours.',
      group: 'Annonces',
    },
    scoring: {
      label: 'Score',
      help: 'Réussis ton annonce au pli près pour marquer. Les modes diffèrent sur ce que coûte un échec.',
      group: 'Score',
      options: {
        exactOnly: 'Exact seulement — 10 + l’annonce ou rien',
        penalty: 'Pénalité — rate de n, perds n',
        plusOne: 'Plus un — double l’annonce en cas de réussite',
      },
    },
    wizards: {
      label: 'Sorciers et Bouffons',
      help: 'Ajoute quatre Sorciers (gagnent toujours) et quatre Bouffons (perdent toujours) — un paquet de 60 cartes.',
      group: 'Avancé',
    },
    trumpOnLastRound: {
      label: 'Atout coupé sur les manches à paquet entier',
      help: 'Quand une manche distribuerait tout le paquet, coupe d’abord un atout au fond (les mains rétrécissent d’une carte) au lieu de jouer sans atout.',
      group: 'Avancé',
    },
  },
  presets: {
    classic: 'Classique',
    quick: 'Rapide',
    wizard: 'Wizard',
  },
};
