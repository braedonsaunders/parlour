import type { GameCopy } from '../types';

/** French copy for durak. Untranslated fields fall back to the pack's English. */
export const durakFr: GameCopy = {
  name: 'Durak',
  subtitle: 'le fou que personne ne veut être',
  tagline: 'Ne soyez jamais le dernier avec des cartes en main',
  description:
    'Un jeu court, une couleur d’atout, et une table d’attaques et de défenses. Battez chaque ' +
    'carte qu’on vous lance ou ramassez tout — le dernier siège encore muni de cartes porte le ' +
    'bonnet du fou.',
  facts: ['2 à 6 joueurs', 'jeu de 36 cartes', 'seul ou entre amis'],
  howToPlay: {
    summary:
      'Un jeu court, une couleur d’atout, et une seule mission : ne jamais être le dernier siège ' +
      'encore muni de cartes.',
    objective:
      'Videz votre main et restez dehors pour de bon. Une fois la pioche épuisée, le dernier siège ' +
      'encore muni de cartes est le Durak.',
    sections: [
      {
        heading: 'La donne',
        body: [
          'Chaque siège reçoit six cartes d’un jeu de 36 : du six à l’as, quatre couleurs, sans ' +
            'deux, trois, quatre ni cinq.',
          'La carte suivante de la pioche est retournée : sa couleur est l’atout pour toute la ' +
            'donne, et elle reste face visible jusqu’à ce que la pioche soit épuisée.',
          'Qui détient l’atout le plus bas attaque en premier. Personne n’en a ? Le siège un ouvre.',
        ],
      },
      {
        heading: 'Attaquer et défendre',
        body: [
          'L’attaquant joue une carte. Le défenseur doit la battre : une carte plus forte de la ' +
            'même couleur, ou n’importe quel atout si l’attaque n’en était pas un.',
          'Les autres sièges peuvent ajouter d’autres cartes, tant que la valeur est déjà apparue ' +
            'sur la table — gagnée ou perdue, cette valeur reste valable jusqu’à la fin de la manche.',
          'Battez toutes les cartes et toute la table est écartée, hors jeu pour de bon — vous ' +
            'attaquez ensuite.',
          'Impossible d’en battre une ? Ramassez toute la table dans votre main. Le jeu passe au ' +
            'siège suivant après vous.',
        ],
        bullets: [
          {
            label: 'Limite d’attaque',
            text: 'un défenseur ne voit jamais plus de cartes qu’il n’en avait au début de la manche',
          },
          {
            label: 'Réapprovisionnement',
            text: 'après chaque manche, les mains remontent à six — l’attaquant d’abord, puis les autres, le défenseur en dernier',
          },
        ],
      },
      {
        heading: 'Perevodnoy (transfert)',
        body: [
          'Quand cette règle de maison est activée, un défenseur qui n’a encore rien battu peut ' +
            'transférer à la place : il joue une carte de même valeur, et le siège suivant hérite ' +
            'de toute l’attaque.',
        ],
      },
      {
        heading: 'La fin de la donne',
        body: [
          'Une fois la pioche épuisée, vider sa main vous met hors jeu pour de bon — définitivement, ' +
            'dans l’ordre où cela arrive.',
          'Le dernier siège encore muni de cartes est le Durak. Tous les autres sont classés selon ' +
            'la rapidité de leur sortie.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Podkidnoy — le jeu traditionnel avec relances',
      description:
        'Attaquez, défendez, et ajoutez toute carte dont la valeur est déjà sur la table. Pas de ' +
        'transfert : on bat la carte ou on ramasse la table.',
      facts: ['relances activées', 'pas de transfert', 'mains de 6 cartes'],
    },
    transfer: {
      name: 'Perevodnoy',
      tagline: 'Transmettez toute l’attaque',
      description:
        'Tout ce qu’offre le mode Classique, plus une échappatoire : un défenseur qui n’a encore ' +
        'rien battu peut transférer une valeur identique directement au siège suivant.',
      facts: ['transferts activés', 'relances activées', 'mains de 6 cartes'],
    },
    'heads-up': {
      name: 'Tête-à-tête',
      tagline: 'Un contre un, fin rapide',
      description:
        'Conçu pour deux joueurs. La première main vidée gagne aussitôt, pioche ou non — sans ' +
        'attendre que le jeu s’épuise.',
      facts: ['2 joueurs', 'victoire instantanée', 'rapide'],
    },
  },
  fields: {
    transfer: {
      label: 'Transfert (perevodnoy)',
      help: 'Un défenseur qui détient une valeur identique peut transmettre toute l’attaque au siège suivant plutôt que de la battre.',
      group: 'La manche',
    },
    throwIns: {
      label: 'Relances (podkidnoy)',
      help: 'N’importe quel siège attaquant peut ajouter d’autres cartes dont la valeur est déjà sur la table.',
      group: 'La manche',
    },
    maxAttacks: {
      label: 'Limite d’attaque',
      help: 'Le plus grand nombre de cartes d’attaque qu’un défenseur peut voir en une manche.',
      group: 'La manche',
    },
    refillTo: {
      label: 'Taille de la main',
      help: 'Cartes distribuées au départ, et la taille à laquelle chaque main remonte après une manche.',
      group: 'La donne',
    },
    instantWin: {
      label: 'Victoire instantanée',
      help: 'La première main vidée gagne aussitôt, même si la pioche contient encore des cartes.',
      group: 'Règles maison',
    },
  },
  presets: {
    classic: 'Durak classique',
    transfer: 'Perevodnoy',
    'heads-up': 'Tête-à-tête',
  },
};
