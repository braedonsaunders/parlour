import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for eights. Untranslated fields fall back to the pack's English. */
export const eightsPt: GameCopy = {
  name: 'Oitos Loucos',
  subtitle: 'o clássico de esvaziar a mão',
  tagline: 'Oitos valem em qualquer lugar',
  description:
    'Um baralho comum, uma pilha que só cresce. Siga o naipe ou o valor, jogue um oito para virar a mesa para o naipe que você quiser e cobre de todo mundo o que sobrar na mão deles.',
  facts: ['2–6 jogadores', 'partida por pontos', 'sozinho ou com amigos'],
  howToPlay: {
    summary:
      'Um baralho comum, uma pilha e oitos que valem em cima de qualquer coisa. Esvazie a sua mão e cobre da mesa o que ela ainda estiver segurando.',
    objective:
      'Esvazie a mão para encerrar a rodada e embolsar todas as cartas que sobrarem na mão dos outros. O primeiro a passar da pontuação alvo leva a partida.',
    sections: [
      {
        heading: 'Jogando uma carta',
        body: [
          'No seu turno, jogue uma carta que combine com a pilha em naipe ou em valor — um 7♦ vai em cima de qualquer ouro e de qualquer outro sete.',
          'Um oito é curinga. Ele vale em cima de qualquer coisa, e você escolhe o naipe que vem a seguir.',
          'Nada para jogar? Compre. A pilha continua pedindo o mesmo naipe até alguém mudá-lo.',
        ],
      },
      {
        heading: 'Cartas de ação',
        body: [
          'Cada uma delas é um ajuste da mesa, então a casa pode jogar do jeito mais simples ou mais caótico que quiser.',
        ],
        bullets: [
          {
            label: '8 — curinga',
            text: 'sempre pode ser jogado; você escolhe o naipe que segue (sempre ativo)',
          },
          { label: '2 — compre dois', text: 'o próximo lugar compra duas cartas e perde a vez' },
          { label: 'Q — pula', text: 'a vez passa direto pelo próximo lugar' },
          {
            label: 'A — inverte',
            text: 'a mesa gira ao contrário; um contra um, ela te dá outra vez',
          },
        ],
      },
      {
        heading: 'Comprando',
        body: [
          'Pela tradição, você compra até aparecer algo que possa jogar. Desligue isso e um turno rende exatamente uma carta.',
          'Uma carta comprada que pode ser jogada é sua para jogar na hora ou guardar — a menos que a mesa obrigue a jogada.',
          'Quando o monte acaba, tudo o que está embaixo da carta virada para cima é embaralhado de volta em um monte novo.',
        ],
      },
      {
        heading: 'Pontuando a rodada',
        body: [
          'No momento em que uma mão esvazia, todo mundo conta o que ainda está segurando e quem esvaziou embolsa tudo.',
        ],
        bullets: [
          { label: 'Cada oito', text: '50 pontos' },
          { label: 'Qualquer 10, J, Q ou K', text: '10 pontos' },
          { label: 'Qualquer ás', text: '1 ponto' },
          { label: 'Todo o resto', text: 'seu valor de face' },
          {
            label: 'Rodada travada',
            text: 'monte esgotado e ninguém consegue jogar — a mão mais leve vence e embolsa a diferença',
          },
        ],
      },
      {
        heading: 'Vencendo a partida',
        body: [
          'As rodadas continuam, com a distribuição passando um lugar a cada vez, até alguém cruzar a pontuação alvo. Vence a maior pontuação.',
          'Um empate no topo distribui outra rodada em vez de dividir a coroa.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Direto',
      tagline: 'Oitos e mais nada',
      description:
        'O jogo como a sua avó distribuía. Combine o naipe ou o valor, jogue um oito para chamar um naipe, compre até algo servir. Primeiro a 100.',
      facts: ['só os 8 são curingas', 'compre até poder jogar', 'até 100'],
    },
    house: {
      name: 'Da casa',
      tagline: 'Dois, damas e ases',
      description:
        'As regras que quase todo mundo joga de verdade: os dois mandam comprar, as damas pulam o próximo lugar, os ases viram a mesa ao contrário. Primeiro a 100.',
      facts: ['2 · Q · A ativos', 'sem acumular', 'até 100'],
    },
    chaos: {
      name: 'Louco',
      tagline: 'Empilhe tudo',
      description:
        'Dois em cima de dois até alguém engolir o bolo inteiro, a carta que você comprou tem que ser jogada e só vale uma compra por turno. Partida longa, mesa barulhenta.',
      facts: ['acumular ativo', 'jogada obrigatória', 'até 150'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartas distribuídas',
      help: 'Quantas cartas cada lugar começa a rodada com.',
      group: 'A distribuição',
    },
    targetScore: {
      label: 'Jogar até',
      help: 'As rodadas continuam até alguém cruzar esta pontuação.',
      group: 'A distribuição',
    },
    twosDrawTwo: {
      label: 'Dois mandam comprar dois',
      help: 'O próximo lugar compra duas cartas e perde a vez.',
      group: 'Cartas de ação',
    },
    queensSkip: {
      label: 'Damas pulam',
      help: 'A vez passa direto pelo próximo lugar.',
      group: 'Cartas de ação',
    },
    acesReverse: {
      label: 'Ases invertem',
      help: 'Vira a mesa ao contrário. Com dois jogadores, funciona como um pulo.',
      group: 'Cartas de ação',
    },
    stackDrawTwo: {
      label: 'Acumular dois',
      help: 'Responda um dois com o seu e passe a compra acumulada adiante.',
      group: 'Regras da casa',
    },
    drawUntilPlayable: {
      label: 'Comprar até poder jogar',
      help: 'A regra tradicional. Desligue para comprar exatamente uma carta por turno.',
      group: 'Regras da casa',
    },
    forcePlay: {
      label: 'Jogada obrigatória',
      help: 'Uma carta que você comprou e que pode ser jogada tem que ser jogada.',
      group: 'Regras da casa',
    },
  },
  presets: {
    classic: 'Oitos Direto',
    house: 'Oitos da Casa',
    chaos: 'Oitos Loucos',
  },
};
