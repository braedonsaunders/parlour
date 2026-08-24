import type { GameCopy } from '../types';

/** French copy for scopa. Untranslated fields fall back to the pack's English. */
export const scopaFr: GameCopy = {
  name: 'Scopa',
  subtitle: 'le jeu de pêche',
  tagline: 'Balaye la table',
  description:
    'Capture les cartes de la table par paire ou par somme, thésaurise les deniers dorés et chasse le settebello. Vide toute la table et crie scopa — le plus beau mot des cafés italiens.',
  facts: ['2–6 joueurs', 'capture · sommes', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Le classique italien de la pêche — capture les cartes de la table, et balaie-la entièrement pour une scopa.',
    objective:
      'Capture les cartes de la table en égalant ou en additionnant leurs valeurs. Le plus de cartes, le plus de deniers, le settebello, la primiera et chaque scopa valent un point ; le premier à l’objectif (11 par défaut) gagne la partie.',
    sections: [
      {
        heading: 'La table',
        body: [
          'La scopa se joue avec un paquet italien de 40 cartes : Denari (deniers), Coppe (coupes), Spade (épées) et Bastoni (bâtons), hauteurs de 1 à 10. On peut jouer à deux, trois, quatre ou six — à quatre et à six, on joue en équipes fixes, les places alternant autour de la table.',
          'Chaque donne distribue trois cartes à chaque joueur et en pose quatre faces visibles sur la table. Si trois Rois ou plus apparaissent sur le tapis de départ, on rebat et on redonne.',
        ],
      },
      {
        heading: 'Capturer',
        body: [
          'À ton tour, joue exactement une carte de ta main. Les captures se font au nombre uniquement — la couleur ne compte jamais.',
        ],
        bullets: [
          {
            label: 'Paire',
            text: 'ta carte prend une seule carte de la table de même valeur : un 5 prend un 5',
          },
          {
            label: 'Choix',
            text: 'si deux cartes de la table partagent cette valeur, tu choisis laquelle prendre — choisis bien, ce qui reste compte',
          },
          {
            label: 'Somme',
            text: 'ta carte peut prendre deux cartes de la table ou plus dont la somme égale sa valeur : un 8 prend un 3 et un 5. Mais si une paire à une carte existe, tu DOIS la prendre — les combinaisons ne servent que quand aucune paire ne se montre',
          },
          {
            label: 'Pose',
            text: 'rien ne correspond ? Ta carte reste sur la table, face visible et à la merci de tous',
          },
        ],
      },
      {
        heading: 'Scopa',
        body: [
          'Balaye toutes les cartes restantes de la table en une seule capture et tu as fait une scopa : un point, marqué aussitôt. Une scopa sur la toute dernière carte de la dernière donne ne compte pas — ces cartes sont balayées de toute façon. Quand les mains se vident, trois nouvelles cartes sont distribuées à chacun ; la table n’est jamais réapprovisionnée. Quand le paquet est épuisé, le dernier joueur à avoir capturé balaie les cartes restantes, et ce balayage n’est pas une scopa.',
        ],
      },
      {
        heading: 'Marquer une manche',
        body: [
          'Après la dernière donne, quatre points sont répartis, plus toutes les scope gagnées en route. Aux tables en équipes, les captures des partenaires sont mises en commun avant le décompte.',
        ],
        bullets: [
          {
            label: 'Carte',
            text: 'le plus de cartes capturées — 21 ou plus sur les 40 à deux joueurs ; en cas d’égalité, personne ne marque',
          },
          {
            label: 'Denari',
            text: 'le plus de deniers capturés — 6 ou plus sur les 10 ; en cas d’égalité, personne ne marque',
          },
          {
            label: 'Settebello',
            text: 'celui qui a capturé le beau 7 de deniers marque 1, toujours',
          },
          {
            label: 'Primiera',
            text: 'la meilleure carte de chaque couleur, additionnées — le 7 vaut 21, le 6 vaut 18, l’As 16, le 5→15, le 4→14, le 3→13, le 2→12, et les figures seulement 10. Sans carte d’une couleur, tu ne peux pas la gagner. Le total le plus haut prend 1 point ; en cas d’égalité, personne ne marque',
          },
          { label: 'Scope', text: 'un point chacune, déjà empochées pendant le jeu' },
        ],
      },
      {
        heading: 'La partie',
        body: [
          'Les manches s’enchaînent — le donneur avance vers la gauche à chaque fois — jusqu’à ce que quelqu’un franchisse le score cible. Si deux camps arrivent à égalité sur la ligne, une manche de plus les départage.',
        ],
      },
      {
        heading: 'Règles de la maison',
        body: [
          'Les réglages de la salle exposent les boutons classiques : l’objectif (11/16/21), le Scopone (tout le paquet distribué, pas de talon), la Napola (un bonus de série de deniers), le Re di denari (un bonus pour le Roi de deniers) et l’affichage aux couleurs françaises, qui est purement visuel.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Premier à 11',
      description:
        'La scopa comme dans tous les bars d’Italie : trois cartes à la fois, quatre points par manche, premier à onze.',
      facts: ['partie en 11', 'donnes de 3 cartes', '~20 min'],
    },
    lungo: {
      name: 'Lungo',
      tagline: 'Le jeu long',
      description:
        'Mêmes règles, course jusqu’à vingt et un. De la place pour les remontées, les rancunes et les scope légendaires.',
      facts: ['partie en 21', 'donnes de 3 cartes', '~40 min'],
    },
    scopone: {
      name: 'Scopone',
      tagline: 'Tout le paquet, sans pitié',
      description:
        'Le quatre-joueurs à l’ancienne : dix cartes chacun distribuées d’un coup, pas de talon, rien de caché. Chaque capture est un engagement.',
      facts: ['4 joueurs · 2v2', 'tout le paquet', '~30 min'],
    },
  },
  fields: {
    target: {
      label: 'Partie en',
      help: 'Après chaque manche, le score le plus haut au niveau de cette ligne ou au-dessus gagne. Une égalité sur la ligne donne une manche de plus.',
      group: 'Partie',
      options: {
        '11': '11 — classique',
        '16': '16 — long',
        '21': '21 — lungo',
      },
    },
    scopone: {
      label: 'Scopone',
      help: 'Le quatre-joueurs à l’ancienne : tout le paquet est distribué d’un coup et il n’y a pas de talon où piocher. Les captures deviennent bien plus serrées.',
      group: 'Donne',
    },
    napola: {
      label: 'Napola',
      help: 'Tiens l’As, le 2 et le 3 de deniers pour 3 points bonus, plus 1 de plus pour chaque carte de deniers qui prolonge la série (4, 5, …).',
      group: 'Score',
    },
    reDenari: {
      label: 'Re di denari',
      help: 'Un point bonus pour celui qui capture le Roi de deniers.',
      group: 'Score',
    },
    frenchSuits: {
      label: 'Affichage aux couleurs françaises',
      help: 'Affiche deniers/coupes/épées comme carreaux/cœurs/piques pour que les illustrations classiques passent. Purement visuel — les identifiants et les règles restent italiens.',
      group: 'Table',
    },
  },
  presets: {
    classic: 'Classique',
    lungo: 'Lungo',
    'scopone-preset': 'Scopone',
  },
};
