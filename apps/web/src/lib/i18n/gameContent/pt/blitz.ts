import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for blitz. Untranslated fields fall back to the pack's English. */
export const blitzPt: GameCopy = {
  name: 'Blitz',
  subtitle: 'o jogo do 31',
  tagline: 'Corra atrás do 31',
  description:
    'Compre, troque e bata na mesa rumo ao 31 num naipe só. Três formatos de partida, bots espertos e uma comemoração bem barulhenta.',
  facts: ['2–4 jogadores', 'clássico · rápido · cronometrado', 'solo ou com amigos'],
  howToPlay: {
    summary: 'O clássico de boteco 31 — compre, troque e bata até ter um naipe valendo 31.',
    objective:
      'Termine a rodada com a mão mais valiosa da mesa. A mão pontua pelo melhor naipe: A=11, figuras=10, números pelo valor de face. 31 num naipe só é BLITZ e vence na hora.',
    sections: [
      {
        heading: 'Sua vez',
        body: ['Você tem duas ações:'],
        bullets: [
          {
            label: 'Comprar',
            text: 'pegue a carta do topo do monte, ou roube o topo da pilha de descarte',
          },
          {
            label: 'Descartar',
            text: 'deslize uma carta da sua mão, virada para cima, para a pilha',
          },
        ],
      },
      {
        heading: 'Pontuando a mão',
        body: [
          'Só conta o seu melhor naipe. Três copas somando 27 vencem três cartas misturadas somando 30.',
          'Trinca é uma mão especial que vale 30½ (ajuste opcional da casa).',
        ],
      },
      {
        heading: 'Bater',
        body: [
          'Em vez de comprar, você pode BATER para encerrar a rodada. Todo mundo tem direito a exatamente mais uma vez, e aí as mãos viram para o confronto.',
          'A mão mais baixa perde uma vida. Se FOI VOCÊ quem bateu e empatou ou ficou por último, a penalidade é sua — bata com confiança.',
        ],
      },
      {
        heading: 'Blitz!',
        body: [
          'Com 31 num naipe só, a rodada explode na hora — todos os outros jogadores perdem uma vida, sem confronto.',
          'Recebeu um Blitz antes da sua primeira vez? Conta. Pode se gabar à vontade.',
        ],
      },
      {
        heading: 'Formatos de partida',
        bullets: [
          {
            label: 'Clássico',
            text: 'perca uma vida a cada rodada perdida; vence o último com vidas',
          },
          {
            label: 'Rápido',
            text: 'rodadas avulsas, contador de vitórias até N, redistribuição instantânea',
          },
          {
            label: 'Cronometrado',
            text: 'relógio de partida, tempos de vez forçados, quem tiver mais rodadas vencidas na buzina leva',
          },
        ],
      },
      {
        heading: 'Regras da casa',
        body: [
          'Cada mesa pode ser ajustada nas configurações da sala — vidas, penalidades de batida, empates, trinca, trava de descarte e tempos de vez ficam todos lá.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'Vidas em jogo',
      description:
        'Perdeu a rodada, perdeu uma vida. Bata cedo ou corra atrás do 31 perfeito — o último jogador com fichas leva a partida.',
      facts: ['3 vidas cada', 'o último de pé', '~5–10 min'],
    },
    fast: {
      name: 'Rápido',
      tagline: 'Uma rodada por vez',
      description:
        'Rodadas independentes, redistribuição instantânea. A mão mais alta leva o pote — o primeiro a três leva a partida.',
      facts: ['primeiro a 3 vitórias', 'sem eliminações', '~2–4 min'],
    },
    timed: {
      name: 'Cronometrado',
      tagline: 'Corra contra a buzina',
      description:
        'Um relógio de partida de três minutos e tempos de vez curtos. Quem tiver mais rodadas vencidas quando a campainha tocar leva.',
      facts: ['relógio de 3:00', '7 s por vez', 'empates em morte súbita'],
    },
  },
  fields: {
    threeOfAKind: {
      label: 'Trinca',
      options: {
        '30.5': 'Vale 30,5',
        '30': 'Vale 30',
        off: 'Desligado',
      },
    },
    tieLowest: {
      label: 'Empate na lanterna',
      options: {
        both: 'Os dois perdem',
        nobody: 'Ninguém perde',
        redeal: 'Redistribuir entre os empatados',
      },
    },
    discardLock: {
      label: 'Travar o descarte que você acabou de pegar',
    },
  },
  presets: {
    'classic-pub': 'Boteco Clássico',
    cutthroat: 'Vale-Tudo',
    friendly: 'Amistoso',
  },
};
