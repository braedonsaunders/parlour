import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for hearts. Untranslated fields fall back to the pack's English. */
export const heartsPt: GameCopy = {
  name: 'Copas',
  subtitle: 'o jogo de desviar',
  tagline: 'Não pegue nenhuma copa',
  description:
    'Desvie de cada copa, fuja da Dama Negra e empurre os pontos para outra pessoa. Passes que giram, escolhas secretas e uma dama bem afiada.',
  facts: ['4 jogadores', 'passar · vaza · desviar', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'O clássico jogo de desviar — não pegue nenhuma copa, fuja da Dama Negra e deixe os pontos para os outros.',
    objective:
      'Termine a partida com a menor pontuação. Cada copa que você captura custa 1 ponto e a dama de espadas custa 13; quando um jogador passa do limite de fim de jogo (100 por padrão), o menor total vence.',
    sections: [
      {
        heading: 'O passe',
        body: [
          'Antes de cada mão, você escolhe três cartas e desliza para um vizinho — todos escolhem em segredo, e os quatro passes chegam juntos.',
          'A direção gira a cada mão: esquerda, direita, em frente, e depois uma mão de segurar, sem passe nenhum.',
        ],
      },
      {
        heading: 'Jogando as vazas',
        body: [
          'O dois de paus puxa a primeira vaza. Siga o naipe se puder; a carta mais alta do naipe puxado leva a vaza, e quem vence puxa a próxima.',
        ],
        bullets: [
          {
            label: 'Primeira vaza',
            text: 'nenhuma carta de penalidade pode ser jogada nela (ajuste opcional da casa)',
          },
          {
            label: 'Quebrar copas',
            text: 'copas não podem puxar até que uma tenha sido descartada numa vaza anterior — a menos que a sua mão seja só de copas',
          },
          {
            label: 'Sem o naipe',
            text: 'ficou sem o naipe puxado? Jogue qualquer coisa — é aqui que a dama cai em cima de alguém',
          },
        ],
      },
      {
        heading: 'Pontuando uma mão',
        body: [
          'Quando as treze vazas terminam, cada copa que você capturou vale 1 ponto e a dama de espadas vale 13.',
        ],
        bullets: [
          {
            label: 'Valete de ouros',
            text: 'regra opcional da casa — vale −10 para quem o capturar',
          },
          {
            label: 'Dar a volta na lua',
            text: 'capture TODAS as treze copas mais a dama e você marca zero enquanto todo mundo leva +26 — ou, com a outra regra da casa, a sua própria pontuação cai 26',
          },
        ],
      },
      {
        heading: 'A partida',
        body: [
          'As mãos se acumulam até alguém cruzar a linha de fim de jogo (50 / 75 / 100). O menor total vence a partida; empates dividem a coroa.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: [
          'As configurações da sala ajustam tudo: direção do passe, mãos de segurar, proteção da primeira vaza, o valete de ouros, o limite de fim de jogo e a virada da lua. Mesas clássicas mantêm os padrões.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'À risca',
      description:
        'Passes girando esquerda-direita-em frente, uma mão de segurar a cada quatro distribuições, sem pontos na primeira vaza. Partida até 100.',
      facts: ['partida até 100', 'mãos de segurar ligadas', '~15 min'],
    },
    quickcut: {
      name: 'Corte Rápido',
      tagline: 'As mesmas copas, mais rápido',
      description:
        'Regras idênticas, teto mais baixo — o primeiro a passar de 50 encerra. Uma partida inteira no cafezinho.',
      facts: ['partida até 50', 'mãos de segurar ligadas', '~8 min'],
    },
    cutthroat: {
      name: 'Vale-Tudo',
      tagline: 'O valete está solto',
      description:
        'O valete de ouros vale −10 para quem o capturar, e cartas de penalidade voam já na primeira vaza. Ninguém está seguro.',
      facts: ['J♦ −10', 'pontos na primeira vaza', 'partida até 100'],
    },
  },
  fields: {
    passDirection: {
      label: 'Passe',
      options: {
        left: 'Esquerda',
        right: 'Direita',
        across: 'Em frente',
        hold: 'Segurar (sem passe)',
      },
    },
    holdHand: {
      label: 'Mão de segurar a cada quatro distribuições',
    },
    noPointsFirstTrick: {
      label: 'Sem cartas de penalidade na primeira vaza',
    },
    jackDiamonds: {
      label: 'Valete de ouros vale −10',
    },
    gameOver: {
      label: 'O jogo termina em',
      options: {
        '50': '50 pontos',
        '75': '75 pontos',
        '100': '100 pontos',
      },
    },
    moonShift: {
      label: 'Dar a volta na lua',
      options: {
        opponents: '+26 para todo mundo',
        self: '−26 da sua própria pontuação',
      },
    },
  },
  presets: {
    classic: 'Copas Clássico',
    quickcut: 'Corte Rápido',
    cutthroat: 'Vale-Tudo',
  },
};
