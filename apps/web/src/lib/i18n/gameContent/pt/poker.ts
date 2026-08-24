import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for poker. Untranslated fields fall back to the pack's English. */
export const pokerPt: GameCopy = {
  name: 'Poker',
  subtitle: 'hold’em sem limite',
  tagline: 'A última pilha em pé',
  description:
    'Duas cartas só suas, cinco no meio da mesa e todas as suas fichas para dizer o quanto você acredita nelas. Os blinds sobem até alguém ficar com tudo.',
  facts: ['2–6 jogadores', 'hold’em sem limite', 'fichas só de brincadeira'],
  howToPlay: {
    summary:
      'Texas hold’em sem limite em formato sit-and-go — todo mundo começa igual, os blinds sobem e vence quem ficar com a última ficha.',
    objective:
      'Ganhe todas as fichas. A cada mão você recebe duas cartas só suas e divide cinco no meio da mesa; a melhor mão de cinco cartas leva o pote, e quem ficar sem fichas está fora da partida.',
    sections: [
      {
        heading: 'As fichas',
        body: [
          'As fichas são só o placar, não uma aposta — não há nada para comprar nem para sacar. Todo mundo começa com a mesma pilha, e a partida acaba quando um jogador tem todas elas.',
        ],
      },
      {
        heading: 'Uma mão',
        body: [
          'Duas cartas fechadas para cada lugar, depois uma rodada de apostas. Três cartas comunitárias (o flop), uma rodada. Uma quarta (o turn), uma rodada. Uma quinta (o river), a última rodada. Quem ainda estiver na mão mostra as cartas, e as melhores cinco entre as sete disponíveis vencem.',
        ],
        bullets: [
          { label: 'O botão', text: 'marca o dealer e anda um lugar para a esquerda a cada mão' },
          {
            label: 'Blinds',
            text: 'os dois lugares à esquerda do botão colocam fichas antes de saírem as cartas, para sempre haver algo em jogo',
          },
        ],
      },
      {
        heading: 'Sua vez',
        body: ['Quando a ação chega em você, só existem quatro coisas a fazer.'],
        bullets: [
          { label: 'Correr (fold)', text: 'desistir da mão e de tudo o que você já colocou' },
          {
            label: 'Mesa (check)',
            text: 'continuar sem colocar fichas — só quando não há nada a pagar',
          },
          { label: 'Pagar (call)', text: 'igualar a aposta atual' },
          {
            label: 'Apostar / aumentar',
            text: 'colocar mais, e todos os outros precisam igualar para continuar. Um aumento deve ser pelo menos do tamanho do último — a menos que você esteja apostando tudo o que resta',
          },
        ],
      },
      {
        heading: 'All in',
        body: [
          'Você nunca pode perder mais do que tem na sua frente. Apostar sua última ficha é ir de all in: você fica na mão até o fim, e qualquer aposta maior que a sua pilha forma um pote paralelo que você não pode ganhar nem perder.',
        ],
      },
      {
        heading: 'Valor das mãos',
        body: [
          'Da melhor para a pior. Empates são decididos pela próxima carta mais alta, e um empate de verdade divide o pote.',
        ],
        bullets: [
          {
            label: 'Straight flush',
            text: 'cinco em sequência, do mesmo naipe — com o ás no topo é um royal flush',
          },
          { label: 'Quadra', text: 'as quatro cartas do mesmo valor' },
          { label: 'Full house', text: 'três de um valor e duas de outro' },
          { label: 'Flush', text: 'cinco do mesmo naipe' },
          {
            label: 'Sequência',
            text: 'cinco em sequência — o ás vale como a mais alta ou a mais baixa',
          },
          { label: 'Trinca', text: 'três do mesmo valor' },
          { label: 'Dois pares', text: 'duas de um valor e duas de outro' },
          { label: 'Par', text: 'duas do mesmo valor' },
          { label: 'Carta alta', text: 'nada disso' },
        ],
      },
      {
        heading: 'A partida',
        body: [
          'Os blinds sobem num cronograma, então correr para sempre não é um plano — a partida sempre termina. Estourou, está fora; vence o último jogador com fichas, e todo o resto fica classificado na ordem em que caiu.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: [
          'As configurações da sala escolhem a pilha inicial, a velocidade com que os blinds sobem, se o big blind paga um ante pela mesa a partir do terceiro nível e se as mãos derrotadas são viradas no showdown ou descartadas fechadas.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'A mesa completa',
      description:
        'Três mil fichas para cada um e blinds que sobem a cada oito mãos. Espaço para jogar uma mão até o fim antes de alguém se comprometer.',
      facts: ['3.000 fichas', 'blinds a cada 8', '~25 min'],
    },
    turbo: {
      name: 'Turbo',
      tagline: 'All in ou vá para casa',
      description:
        'Pilhas curtas e blinds que dobram a cada quatro mãos. Ninguém pode ficar esperando por ases.',
      facts: ['1.500 fichas', 'blinds a cada 4', '~10 min'],
    },
    deep: {
      name: 'Deep Stack',
      tagline: 'Jogue o jogador',
      description:
        'Seis mil fichas e uma escada lenta, sem ante. O jogo longo, onde posição e paciência valem alguma coisa.',
      facts: ['6.000 fichas', 'blinds a cada 12', 'sem ante'],
    },
  },
  fields: {
    startingStack: {
      label: 'Pilha inicial',
      help: 'Fichas com que cada lugar começa. Pilhas mais fundas dão mais jogo depois do flop antes de alguém se comprometer.',
      group: 'Partida',
      options: {
        '1500': '1.500 — curta',
        '3000': '3.000 — padrão',
        '6000': '6.000 — funda',
      },
    },
    blindSpeed: {
      label: 'Blinds sobem',
      help: 'Os blinds sobem num cronograma para a partida sempre terminar. O turbo força a ação cedo.',
      group: 'Partida',
      options: {
        slow: 'Lento — a cada 12 mãos',
        standard: 'Padrão — a cada 8 mãos',
        turbo: 'Turbo — a cada 4 mãos',
      },
    },
    ante: {
      label: 'Ante da mesa',
      help: 'A partir do terceiro nível, o big blind paga um blind extra por toda a mesa, para sempre haver algo valendo a pena levar.',
      group: 'Apostas',
    },
    showMucked: {
      label: 'Mostrar mãos perdedoras',
      help: 'Desligado, uma mão derrotada é descartada fechada, como seria numa mesa de verdade. Ligado, todo mundo vê cada mão que chegou ao river.',
      group: 'Showdown',
    },
  },
  presets: {
    classic: 'Clássico',
    turbo: 'Turbo',
    deep: 'Deep Stack',
  },
};
