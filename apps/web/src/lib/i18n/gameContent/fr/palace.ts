import type { GameCopy } from '../types';

/** French copy for palace. Untranslated fields fall back to the pack's English. */
export const palaceFr: GameCopy = {
  name: 'Palace',
  subtitle: 'le jeu qui vide les couches',
  tagline: 'Videz la table, couche par couche',
  description:
    'La main, puis le visible, puis le caché — brûlez les dix, esquivez les deux, et soyez le ' +
    'premier à vider chaque couche. Aussi connu sous le nom de Shithead ou Karma.',
  facts: ['2–6 joueurs', 'des deux, des dix et des huit', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Débarrassez-vous de tout ce que vous tenez — la main, puis la rangée visible, puis la rangée ' +
      'cachée — avant que quelqu’un d’autre ne vide la table.',
    objective:
      'Videz votre main, votre rangée visible et votre rangée cachée en premier pour gagner la manche. ' +
      'Les manches gagnées s’accumulent sur la partie ; le premier à atteindre l’objectif remporte la partie.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Chacun reçoit trois cartes face cachée, trois cartes face visible posées dessus, et trois ' +
            'cartes en main.',
          'Avant de commencer, échangez autant de cartes de votre main que vous voulez contre vos ' +
            'propres cartes visibles — un seul échange, puis vous vous déclarez prêt.',
        ],
      },
      {
        heading: 'Jouer sur la pile',
        body: [
          'À votre tour, jouez une ou plusieurs cartes de même valeur qui égalent ou dépassent la ' +
            'valeur de la pile, ou ramassez toute la pile dans votre main.',
          'Vous devez vider votre main avant de toucher votre rangée visible, et vider la rangée ' +
            'visible avant de toucher la rangée cachée.',
        ],
        bullets: [
          {
            label: 'Ouvrir la manche',
            text: 'celui qui détient la plus petite carte ordinaire commence — les trois d’abord, puis en montant',
          },
          {
            label: 'Ramassez à tout moment',
            text: 'vous pouvez prendre la pile même avec un coup légal en main — parfois c’est le choix le plus sûr',
          },
          {
            label: 'Jouer une carte cachée',
            text:
              'main et rangée visible vides, retournez une carte cachée à l’aveugle — si elle bat la ' +
              'pile, elle reste en jeu et vous continuez ; sinon, vous ramassez la pile et la carte',
          },
        ],
      },
      {
        heading: 'Les cartes spéciales',
        body: [
          'Quatre valeurs changent les règles — toutes activées par défaut, toutes réglables :',
        ],
        bullets: [
          {
            label: '2 — réinitialise',
            text: 'se joue sur n’importe quoi ; le seuil de la pile retombe presque à rien',
          },
          {
            label: '10 — brûle',
            text: 'se joue sur n’importe quoi ; la pile sort du jeu et vous rejouez',
          },
          {
            label: '8 — invisible',
            text: 'toujours jouable, et ne change jamais ce que la pile demande — le suivant répond à ce qu’il y a dessous',
          },
          {
            label: 'Carré',
            text: 'quatre cartes de même valeur en haut de la pile la brûlent, peu importe comment elles y sont arrivées — vous rejouez',
          },
        ],
      },
      {
        heading: 'Gagner la manche',
        body: [
          'Dès qu’un joueur vide sa main, sa rangée visible et sa rangée cachée à la fois, la manche ' +
            'se termine immédiatement.',
          'Tous les autres sont classés selon le nombre de cartes qu’il leur reste — moins c’est mieux ' +
            '— avec les cartes cachées restantes comme départage.',
        ],
      },
      {
        heading: 'Règles de la maison',
        body: ['Réglez la table dans les paramètres de salle avant de commencer :'],
        bullets: [
          {
            label: 'Échange avant de jouer',
            text: 'désactivez pour passer directement de la donne au premier coup',
          },
          {
            label: 'Le 2 réinitialise / le 10 brûle / le 8 est toujours jouable',
            text: 'désactivez n’importe quel spécial pour rendre cette valeur ordinaire',
          },
          {
            label: 'Le carré brûle',
            text: 'désactivez pour laisser une pile de valeurs identiques simplement grandir',
          },
          {
            label: 'Premier à (manches gagnées)',
            text: 'combien de manches il faut pour gagner la partie — 1 pour une manche rapide, jusqu’à 7 pour une longue soirée',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'L’ascension complète par couches',
      description:
        'Échangez, puis videz la main, le visible et le caché. Le premier à trois manches gagnées ' +
        'remporte la table.',
      facts: ['jusqu’à 3 manches', 'échange activé', 'tous les spéciaux'],
    },
    quick: {
      name: 'Rapide',
      tagline: 'Une manche et c’est réglé',
      description:
        'Une seule manche décide de tout — mêmes spéciaux, sans longue partie à accumuler.',
      facts: ['jusqu’à 1 manche', '~10 min', 'idéal en échauffement'],
    },
    chaos: {
      name: 'Chaos',
      tagline: 'Sans échange, sans pitié',
      description:
        'Directement de la donne au jeu — aucune phase d’échange à préparer. Tous les spéciaux au ' +
        'maximum : le 2 réinitialise, le 10 brûle, le 8 reste invisible, le carré embrase toujours la pile.',
      facts: ['jusqu’à 3 manches', 'sans phase d’échange', 'attendez-vous à des brûlages'],
    },
  },
  fields: {
    allowSwap: {
      label: 'Échange avant de jouer',
      help: 'La phase d’échange entre la donne et le premier coup.',
    },
    twosReset: {
      label: 'Le 2 réinitialise la pile',
      help: 'Se joue sur n’importe quoi et réinitialise le seuil de la pile.',
    },
    tensBurn: {
      label: 'Le 10 brûle la pile',
      help: 'Se joue sur n’importe quoi et brûle la pile ; le même joueur rejoue.',
    },
    eightsBlind: {
      label: 'Le 8 est toujours jouable',
      help: 'Toujours un coup légal, et ne change jamais le seuil de la pile.',
    },
    fourKindBurn: {
      label: 'Le carré brûle',
      help: 'Quatre cartes de même valeur en haut de la pile la brûlent ; le même joueur rejoue.',
    },
    winsTo: {
      label: 'Premier à (manches gagnées)',
      help: 'La partie se termine quand un joueur atteint ce nombre de manches gagnées.',
    },
  },
  presets: {
    classic: 'Palace classique',
    quick: 'Palace rapide',
    chaos: 'Palace chaotique',
  },
};
