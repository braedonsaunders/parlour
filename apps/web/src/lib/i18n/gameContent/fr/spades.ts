import type { GameCopy } from '../types';

/** French copy for spades. Untranslated fields fall back to the pack's English. */
export const spadesFr: GameCopy = {
  name: 'Piques',
  subtitle: 'le jeu en équipe',
  tagline: 'Annonce tes plis',
  description:
    'Assieds-toi face à ton partenaire, annonce un nombre et fais autant de plis — ni plus, ni moins si tu peux l’éviter. Les piques sont toujours atout. Les sacs te retrouveront.',
  facts: ['4 joueurs · 2v2', 'annonce · atout · sacs', 'solo ou entre amis'],
  howToPlay: {
    summary:
      'Le classique américain en équipe — annonce tes plis, brise les piques et fonce vers les 500.',
    objective:
      'Assis face à ton partenaire, fais au moins autant de plis que vous en avez annoncés à deux. La première équipe à atteindre le score cible (500 par défaut) gagne ; en cas d’égalité sur la ligne ou au-dessus, on joue une manche de plus.',
    sections: [
      {
        heading: 'La table',
        body: [
          'Quatre joueurs, deux équipes : toi et le joueur en face de toi êtes partenaires. Chaque manche distribue tout le jeu de 52 cartes — treize cartes chacun. La donne comme la première annonce commencent à la gauche du donneur et tournent dans le sens des aiguilles d’une montre.',
        ],
      },
      {
        heading: 'Les annonces',
        body: [
          'Chaque place annonce un nombre, une seule fois. On ne passe pas et on ne surenchérit pas. Le contrat de ton équipe est la somme des deux annonces qui ne sont pas capot.',
        ],
        bullets: [
          { label: '1–13', text: 'combien de plis tu penses faire' },
          {
            label: 'Capot',
            text: 'une annonce à part — ne fais aucun pli pour +100, ou −100 si tu en fais un. Les plis d’un capot raté n’aident pas ton partenaire à remplir son contrat, mais chacun compte quand même comme un sac',
          },
        ],
      },
      {
        heading: 'Jouer les plis',
        body: [
          'Le joueur à la gauche du donneur entame le premier pli. Suis la couleur si tu peux ; le pique le plus haut l’emporte, sinon la carte la plus haute de la couleur entamée. Celui qui gagne le pli entame le suivant.',
        ],
        bullets: [
          {
            label: 'Briser les piques',
            text: 'on ne peut pas entamer un pique tant que personne n’en a défaussé un en étant à sec de la couleur — sauf s’il ne te reste que des piques en main',
          },
          {
            label: 'À sec',
            text: 'plus de la couleur entamée ? Joue ce que tu veux, y compris un atout',
          },
        ],
      },
      {
        heading: 'Compter une manche',
        body: [
          'Si les places de l’équipe qui n’ont pas annoncé capot font au moins le contrat, l’équipe marque 10 points par pli annoncé plus 1 par pli supplémentaire. Si vous tombez à court, le contrat coûte −10 par pli annoncé.',
        ],
        bullets: [
          {
            label: 'Sacs',
            text: 'les plis supplémentaires (et les plis d’un capot raté) sont des sacs. Ils s’accumulent de manche en manche ; chaque dizaine de sacs coûte 100 points et les sacs restants restent au compteur',
          },
          {
            label: 'Capot',
            text: 'compté à part, en plus du résultat du contrat du partenaire',
          },
        ],
      },
      {
        heading: 'La partie',
        body: [
          'Les manches s’enchaînent jusqu’à ce qu’une équipe atteigne la cible (250 / 500 / 750). Le score le plus haut gagne ; si les deux équipes arrivent au même total sur la ligne ou au-dessus, on redonne.',
        ],
      },
      {
        heading: 'Règles maison',
        body: [
          'Les réglages de la salle ne touchent que trois choses : le score cible, si le capot est permis et si les sacs comptent. Les tables classiques gardent les valeurs par défaut. Le capot à l’aveugle n’est pas proposé.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Classique',
      tagline: 'Dans les règles',
      description:
        'Piques en équipe jusqu’à 500, capot activé, sacs activés. Le jeu tel qu’on y joue à toutes les tables de cuisine.',
      facts: ['partie à 500', 'capot · sacs', '~25 min'],
    },
    quick: {
      name: 'Rapide',
      tagline: 'Premier à 250',
      description:
        'Mêmes règles, course plus courte — 250 points et c’est fini. Une partie entière le temps d’une pause déjeuner.',
      facts: ['partie à 250', 'capot · sacs', '~12 min'],
    },
    'clean-books': {
      name: 'Plis propres',
      tagline: 'Sans sacs',
      description:
        'Remplis ton annonce ou échoue — les plis supplémentaires ne sont pas des sacs et ne rapportent rien. La précision avant le remplissage.',
      facts: ['partie à 500', 'capot activé', 'sacs désactivés'],
    },
  },
  fields: {
    targetScore: {
      label: 'Partie à',
      help: 'Après chaque manche, l’équipe la plus haute sur la ligne ou au-dessus de ce score gagne. En cas d’égalité, on joue une manche de plus.',
      group: 'Partie',
      options: {
        '250': '250 — coupe rapide',
        '500': '500 — standard',
        '750': '750 — longue partie',
      },
    },
    nil: {
      label: 'Permettre le capot',
      help: 'Une annonce de zéro est un capot : ne fais aucun pli pour +100, ou −100 si tu en fais un. Les plis d’un capot raté n’aident pas le contrat du partenaire.',
      group: 'Annonces',
    },
    bags: {
      label: 'Compter les sacs',
      help: 'Les plis supplémentaires et les plis d’un capot raté sont des sacs. Chaque dizaine de sacs coûte 100 points ; les sacs restants restent au compteur.',
      group: 'Score',
    },
  },
  presets: {
    classic: 'Classique',
    quick: 'Rapide',
    'clean-books': 'Plis propres',
  },
};
