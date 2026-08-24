import type { GameCopy } from '../types';

/** French copy for poker. Untranslated fields fall back to the pack's English. */
export const pokerFr: GameCopy = {
  name: 'Poker',
  subtitle: 'hold’em sans limite',
  tagline: 'Le dernier tapis gagne',
  description:
    'Deux cartes rien que pour toi, cinq au milieu, et tous tes jetons pour dire à quel point tu y crois. Les blinds montent jusqu’à ce qu’un joueur ait tout.',
  facts: ['2–6 joueurs', 'hold’em sans limite', 'jetons fictifs'],
  howToPlay: {
    summary:
      'Le Texas hold’em sans limite, en sit-and-go — tout le monde part à égalité, les blinds montent, et le dernier tapis gagne.',
    objective:
      'Gagne tous les jetons. À chaque main, tu reçois deux cartes rien qu’à toi et tu partages cinq cartes au milieu ; la meilleure main de cinq cartes remporte le pot, et quiconque n’a plus de jetons est éliminé de la partie.',
    sections: [
      {
        heading: 'Les jetons',
        body: [
          'Les jetons servent à compter, pas à miser — il n’y a rien à acheter et rien à encaisser. Tout le monde commence avec le même tapis, et la partie s’arrête quand un joueur a tout.',
        ],
      },
      {
        heading: 'Une main',
        body: [
          'Deux cartes faces cachées à chaque place, puis un tour de mises. Trois cartes communes (le flop), un tour. Une quatrième (le turn), un tour. Une cinquième (la river), un dernier tour. Ceux qui restent montrent leurs cartes, et les cinq meilleures parmi les sept disponibles gagnent.',
        ],
        bullets: [
          {
            label: 'Le bouton',
            text: 'marque le donneur et avance d’une place vers la gauche à chaque main',
          },
          {
            label: 'Blinds',
            text: 'les deux places à gauche du bouton mettent des jetons avant la donne, pour qu’il y ait toujours quelque chose à gagner',
          },
        ],
      },
      {
        heading: 'À toi de jouer',
        body: ['Quand l’action arrive à toi, il n’y a jamais que quatre choses possibles.'],
        bullets: [
          { label: 'Se coucher', text: 'abandonner la main et ce que tu as déjà misé' },
          {
            label: 'Parole',
            text: 'rester sans miser — seulement quand tu ne dois rien',
          },
          { label: 'Suivre', text: 'égaler la mise en cours' },
          {
            label: 'Miser / relancer',
            text: 'mettre plus, que tous les autres doivent égaler pour rester. Une relance vaut au moins la taille de la précédente — sauf si tu mises tout ce qu’il te reste',
          },
        ],
      },
      {
        heading: 'Tapis',
        body: [
          'Tu ne peux jamais perdre plus que ce que tu as devant toi. Miser ton dernier jeton, c’est faire tapis : tu restes dans la main jusqu’au bout, et toute mise plus grosse que ton tapis alimente un pot annexe que tu ne peux ni gagner ni perdre.',
        ],
      },
      {
        heading: 'Valeur des mains',
        body: [
          'De la plus forte à la plus faible. Les égalités se départagent à la carte suivante la plus haute, et une vraie égalité partage le pot.',
        ],
        bullets: [
          {
            label: 'Quinte flush',
            text: 'cinq cartes qui se suivent, même couleur — à l’as, c’est une quinte flush royale',
          },
          { label: 'Carré', text: 'les quatre cartes d’une même hauteur' },
          { label: 'Full', text: 'trois cartes d’une hauteur et deux d’une autre' },
          { label: 'Couleur', text: 'cinq cartes de la même couleur' },
          { label: 'Quinte', text: 'cinq cartes qui se suivent — l’as compte haut ou bas' },
          { label: 'Brelan', text: 'trois cartes d’une même hauteur' },
          { label: 'Double paire', text: 'deux cartes d’une hauteur et deux d’une autre' },
          { label: 'Paire', text: 'deux cartes d’une même hauteur' },
          { label: 'Carte haute', text: 'rien de tout ça' },
        ],
      },
      {
        heading: 'La partie',
        body: [
          'Les blinds montent selon un calendrier, donc se coucher sans fin n’est pas un plan — une partie finit toujours. Saute et tu es éliminé ; le dernier joueur avec des jetons gagne, et les autres se classent dans l’ordre de leur sortie.',
        ],
      },
      {
        heading: 'Règles de la maison',
        body: [
          'Les réglages de la salle choisissent le tapis de départ, la vitesse de montée des blinds, si la grosse blind paie une ante pour toute la table à partir du troisième niveau, et si les mains battues sont retournées à l’abattage ou jetées faces cachées.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'La table au complet',
      description:
        'Trois mille jetons chacun et des blinds qui montent toutes les huit mains. De la place pour jouer une main à fond avant d’être engagé.',
      facts: ['3 000 jetons', 'blinds toutes les 8', '~25 min'],
    },
    turbo: {
      name: 'Turbo',
      tagline: 'Tapis ou rien',
      description:
        'Petits tapis et blinds qui doublent toutes les quatre mains. Personne n’a le temps d’attendre les as.',
      facts: ['1 500 jetons', 'blinds toutes les 4', '~10 min'],
    },
    deep: {
      name: 'Deep Stack',
      tagline: 'Joue le joueur',
      description:
        'Six mille jetons et une montée lente, sans ante. Le jeu long, où la position et la patience paient.',
      facts: ['6 000 jetons', 'blinds toutes les 12', 'sans ante'],
    },
  },
  fields: {
    startingStack: {
      label: 'Tapis de départ',
      help: 'Les jetons que chaque place reçoit au départ. Des tapis plus profonds laissent plus de jeu après le flop avant d’être engagé.',
      group: 'Partie',
      options: {
        '1500': '1 500 — court',
        '3000': '3 000 — standard',
        '6000': '6 000 — profond',
      },
    },
    blindSpeed: {
      label: 'Montée des blinds',
      help: 'Les blinds montent selon un calendrier pour qu’une partie finisse toujours. Turbo force l’action tôt.',
      group: 'Partie',
      options: {
        slow: 'Lente — toutes les 12 mains',
        standard: 'Standard — toutes les 8 mains',
        turbo: 'Turbo — toutes les 4 mains',
      },
    },
    ante: {
      label: 'Ante de table',
      help: 'À partir du troisième niveau, la grosse blind paie une blind de plus pour toute la table, pour qu’il y ait toujours quelque chose à prendre.',
      group: 'Mises',
    },
    showMucked: {
      label: 'Montrer les mains perdantes',
      help: 'Désactivé, une main battue est jetée faces cachées comme à une vraie table. Activé, tout le monde voit chaque main arrivée jusqu’à la river.',
      group: 'Abattage',
    },
  },
  presets: {
    classic: 'Classique',
    turbo: 'Turbo',
    deep: 'Deep Stack',
  },
};
