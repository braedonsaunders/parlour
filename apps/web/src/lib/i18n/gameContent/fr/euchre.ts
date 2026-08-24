import type { GameCopy } from '../types';

/** French copy for euchre. Untranslated fields fall back to the pack's English. */
export const euchreFr: GameCopy = {
  name: 'Euchre',
  subtitle: 'le jeu en équipe',
  tagline: 'Fais des plis pour ton équipe',
  description:
    'Prends la carte retournée, nomme ton atout et cours après les volets avec le joueur d’en face. La première équipe à dix remporte la partie.',
  facts: ['4 joueurs · 2v2', 'jeu de plis', 'solo ou entre amis'],
  howToPlay: {
    summary: 'Le classique du Midwest — fais équipe, nomme l’atout et mène ton équipe à 10 points.',
    objective:
      'Assis face à ton partenaire, gagne au moins trois des cinq plis de chaque manche en faisant de ta couleur annoncée la reine de la table. La première équipe à atteindre le score cible remporte la partie.',
    sections: [
      {
        heading: 'La table',
        body: [
          'Quatre joueurs, deux équipes : toi et le joueur en face de toi êtes partenaires. Cinq cartes chacun ; les quatre dernières forment le talon, dont la carte du dessus est retournée face visible.',
        ],
      },
      {
        heading: 'Prendre ou passer — premier tour d’annonce',
        body: ['En commençant à la gauche du donneur, chacun prend la carte retournée ou passe :'],
        bullets: [
          {
            label: 'Prendre',
            text: 'cette couleur devient atout, le donneur ramasse la carte dans sa main et en écarte une face cachée',
          },
          {
            label: 'Jouer seul',
            text: 'prends l’atout et envoie ton partenaire sur le banc pour cette manche',
          },
          { label: 'Passer', text: 'la décision passe à gauche' },
        ],
      },
      {
        heading: 'Nommer l’atout — deuxième tour',
        body: [
          'Si les quatre passent, la carte retournée est écartée et chaque place peut nommer n’importe quelle autre couleur comme atout. La couleur refusée est hors jeu.',
          'Donneur pris au piège (par défaut) : si tout le monde passe au deuxième tour, le donneur doit annoncer une couleur.',
        ],
      },
      {
        heading: 'Les volets',
        body: [
          'Quand une couleur est nommée, son valet est le GROS volet — la carte la plus forte en jeu. Le valet de la couleur de même teinte est le PETIT volet, juste derrière le gros, et compte comme atout. Avec cœur atout, le V♥ puis le V♦ sont donc les deux cartes maîtresses.',
        ],
      },
      {
        heading: 'Jouer les plis',
        body: [
          'Le joueur à la gauche du donneur entame. Tu dois suivre la couleur entamée si tu peux — souviens-toi que le petit volet appartient à l’atout, pas à sa couleur imprimée. La carte la plus haute de la couleur entamée gagne le pli, sauf si quelqu’un coupe ; l’atout le plus haut bat tout. Le gagnant entame le pli suivant.',
        ],
      },
      {
        heading: 'Compter une manche',
        body: ['L’équipe qui a annoncé est l’équipe PRENEUSE. Après cinq plis :'],
        bullets: [
          { label: '3 ou 4 plis', text: 'les preneurs marquent 1 point' },
          { label: '5 plis', text: 'une razzia — les preneurs marquent 2' },
          {
            label: 'Razzia en solo',
            text: 'les cinq plis en jouant seul — les preneurs marquent 4',
          },
          {
            label: 'Euchré !',
            text: 'les preneurs font moins de trois plis — les défenseurs marquent 2',
          },
        ],
      },
      {
        heading: 'Jouer seul',
        body: [
          'Un preneur assez confiant peut jouer sans son partenaire, qui reste complètement à l’écart de la manche. Gagne les cinq plis seul et ça vaut 4 points — mais fais-en moins de trois et la défense t’euchre quand même pour 2.',
        ],
      },
      {
        heading: 'Règles maison',
        body: [
          'Les réglages de la salle ajustent la partie : jeu en 5/10/15, donneur pris au piège ou non, et si l’on peut jouer seul. Quand toutes les mains sont jetées sans annonce d’atout, la donne passe simplement à gauche.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Pub classique',
      tagline: 'Le vrai jeu',
      description:
        'Dix points, donneur pris au piège, jeu en solo. Le jeu tel qu’on y joue dans chaque caserne et à chaque table de cuisine.',
      facts: ['partie à 10', 'donneur pris au piège', '~20 min'],
    },
    'quick-cut': {
      name: 'Coupe rapide',
      tagline: 'Premier à cinq',
      description:
        'Mêmes règles, course plus courte — cinq points et c’est fini. Parfait pendant que la bouilloire chauffe encore.',
      facts: ['partie à 5', '~10 min'],
    },
    'long-game': {
      name: 'Longue partie',
      tagline: 'Installe-toi',
      description: 'Quinze points pour une vraie soirée de jeu. Les rancunes sont les bienvenues.',
      facts: ['partie à 15', '~30 min'],
    },
    'old-school': {
      name: 'À l’ancienne',
      tagline: 'Le donneur peut passer',
      description:
        'Pas de donneur pris au piège — tout le monde peut passer et la donne tourne. Comme certains grands-pères l’exigent.',
      facts: ['partie à 10', 'sans piège', '~20 min'],
    },
  },
  fields: {
    targetScore: {
      label: 'Partie à',
      help: 'La première équipe à atteindre ce score remporte la partie.',
      group: 'Partie',
      options: {
        '5': '5 — coupe rapide',
        '10': '10 — standard',
        '15': '15 — longue partie',
      },
    },
    stickDealer: {
      label: 'Donneur pris au piège',
      help: 'Au deuxième tour d’annonce, le donneur doit nommer une couleur quand tout le monde a passé.',
      group: 'Annonces',
    },
    goingAlone: {
      label: 'Permettre de jouer seul',
      help: 'Un preneur avec une main monstrueuse peut envoyer son partenaire sur le banc pour la manche.',
      group: 'Annonces',
    },
  },
  presets: {
    classic: 'Pub classique',
    'quick-cut': 'Coupe rapide',
    'long-game': 'Longue partie',
    'old-school': 'À l’ancienne',
  },
};
