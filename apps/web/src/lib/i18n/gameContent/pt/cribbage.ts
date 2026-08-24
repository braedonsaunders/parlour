import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for cribbage. Untranslated fields fall back to the pack's English. */
export const cribbagePt: GameCopy = {
  name: 'Cribbage',
  subtitle: 'a corrida dos pinos',
  tagline: 'Avance até 121',
  description:
    'A clássica corrida de pub — monte quinzes, sequências e pares na sua mão, marque-os com os pinos no tabuleiro e reze para ninguém cortar um valete atrás de você.',
  facts: ['2 jogadores', 'clássico · sem piedade', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'A clássica corrida de pub — monte combinações que pontuam na sua mão e avance com os pinos até 121.',
    objective:
      'Seja o primeiro a marcar 121 pontos no tabuleiro. Os pontos vêm duas vezes: das cartas jogadas na mesa (a contagem) e da contagem da sua mão e do crib na hora de mostrar.',
    sections: [
      {
        heading: 'A distribuição',
        body: [
          'Você recebe seis cartas. Fique com quatro e deslize duas, viradas para baixo, para o CRIB — uma mão bônus que pontua para quem está dando as cartas nesta rodada.',
          'Descarte com generosidade quando o crib é seu, e com cautela quando é do adversário.',
        ],
      },
      {
        heading: 'O corte',
        body: [
          'Quem dá as cartas corta o baralho para revelar a carta inicial, compartilhada por todas as mãos.',
          'Cortar um valete marca HIS HEELS — dois pontos na hora para quem deu as cartas.',
        ],
      },
      {
        heading: 'A contagem',
        body: [
          'Começando à esquerda de quem deu as cartas, os jogadores alternam baixando uma carta, mantendo uma soma corrente dos valores (figuras valem 10). A soma nunca pode passar de 31.',
          'Pontue enquanto joga:',
        ],
        bullets: [
          { label: 'Quinze', text: 'sua carta faz a soma corrente bater exatamente 15 — 2 pontos' },
          {
            label: 'Par / trinca / quadra',
            text: 'igualar o valor da carta anterior — 2 / 6 / 12 pontos',
          },
          {
            label: 'Sequência',
            text: 'três ou mais cartas em ordem, em qualquer sequência de jogo — 1 ponto por carta',
          },
          { label: 'Trinta e um', text: 'sua carta faz a soma bater exatamente 31 — 2 pontos' },
          {
            label: 'Go e última carta',
            text: 'se ninguém puder jogar sem passar de 31, o último a baixar uma carta marca 1 ponto e a soma zera',
          },
        ],
      },
      {
        heading: 'A mostra',
        body: [
          'Depois da contagem, todos contam em voz alta: primeiro a mão de quem não deu as cartas, depois a de quem deu, e por fim o crib. A carta inicial conta como quinta carta.',
        ],
        bullets: [
          {
            label: 'Quinzes',
            text: 'cada combinação de cartas que soma 15 — 2 pontos cada',
          },
          { label: 'Pares', text: 'um par vale 2, trinca 6, quadra 12' },
          {
            label: 'Sequências',
            text: 'sequências pontuam por carta; sequências duplas multiplicam (7-7-8-9 = 12)',
          },
          {
            label: 'Flush',
            text: 'quatro cartas do mesmo naipe na sua MÃO valem 4, cinco com a carta inicial combinando. No CRIB só vale o flush das cinco cartas.',
          },
          { label: 'His nobs', text: 'um valete do naipe da carta inicial — 1 ponto' },
        ],
      },
      {
        heading: 'Vitória e vexames',
        body: [
          'O primeiro a chegar a 121 vence, mesmo no meio da contagem. A vez de dar as cartas alterna a cada rodada.',
          'Com a regra do vexame ligada, quem perde terminando abaixo de 90 leva um SKUNK — uma humilhação daquelas para saborear.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: ['As configurações da sala carregam as discussões de pub:'],
        bullets: [
          { label: 'Vexames', text: 'marque os perdedores abaixo de 90 (ligado por padrão)' },
          {
            label: 'Muggins',
            text: 'se você não marcar pontos que ganhou na mesa, o adversário pode roubá-los (desligado por padrão) — marque rápido!',
          },
        ],
      },
    ],
  },
  modes: {
    'classic-pub': {
      name: 'Pub Clássico',
      tagline: 'O jogo de verdade',
      description:
        'Seis cartas, duas para o crib e uma longa corrida de pinos até 121. Vexames contam — termine abaixo de 90 e ouça sobre isso para sempre.',
      facts: ['corrida até 121', 'linha do vexame aos 90', '~10–15 min'],
    },
    cutthroat: {
      name: 'Sem Piedade',
      tagline: 'O muggins está de olho',
      description:
        'A mesma corrida, com garras mais afiadas: deixe de marcar seus pontos na mesa e o adversário fica com eles.',
      facts: ['muggins ativo', 'roube pontos não marcados', 'sem piedade'],
    },
    'match-play': {
      name: 'Disputa de Partidas',
      tagline: 'Melhor de três tabuleiros',
      description:
        'Uma noite longa como manda o figurino: corra até 121, zere os pinos e corra de novo. O primeiro a vencer dois jogos completos leva a partida.',
      facts: ['primeiro a 2 jogos', 'distribuidor alterna', '~25–40 min'],
    },
  },
  fields: {
    skunks: {
      label: 'Linha do vexame aos 90',
    },
    muggins: {
      label: 'Muggins (roube pontos não marcados)',
    },
    gamesToWin: {
      label: 'Jogos para vencer',
    },
  },
  presets: {
    'classic-pub': 'Pub Clássico',
    cutthroat: 'Sem Piedade',
    'match-play': 'Disputa de Partidas',
    friendly: 'Amistoso',
  },
};
