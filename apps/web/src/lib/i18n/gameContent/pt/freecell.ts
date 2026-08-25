import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for freecell. Untranslated fields fall back to the pack's English. */
export const freecellPt: GameCopy = {
  name: 'FreeCell',
  subtitle: 'o solitário aberto',
  tagline: 'Limpe a mesa do dia',
  description:
    'Oito colunas, todas as cartas viradas para cima. Estacione extras nas células livres e mande cada naipe para casa do ás ao rei. A mesma distribuição do dia espera por todo mundo.',
  facts: ['1 jogador', 'distribuição diária fixa', 'offline'],
  howToPlay: {
    summary:
      'O clássico solitário de cartas abertas, distribuído de forma determinística para uma mesa nova ou para o desafio do dia.',
    objective: 'Monte as quatro fundações do ás ao rei, um naipe por pilha.',
    sections: [
      {
        heading: 'A distribuição',
        body: [
          'Oito colunas mostram todas as cartas viradas para cima. As quatro primeiras recebem sete cartas; as quatro últimas recebem seis.',
        ],
      },
      {
        heading: 'Células livres',
        body: [
          'Estacione uma carta em cada célula livre. O Clássico tem quatro células; o Tranquilo tem seis. Cada célula guarda uma carta, que pode ir para a mesa ou para uma fundação.',
        ],
      },
      {
        heading: 'Monte as colunas',
        body: [
          'Coloque as cartas em ordem decrescente e alternando as cores. Uma sequência compacta se move junta se o limite de supermovimento permitir. Qualquer carta — não só um rei — pode entrar numa coluna vazia.',
        ],
      },
      {
        heading: 'Fundações',
        body: [
          'Comece cada naipe com o ás e suba até o rei. Uma carta da fundação pode voltar para a mesa se você precisar desfazer uma linha.',
        ],
      },
      {
        heading: 'Limpe a mesa',
        body: ['Mande todas as cartas para casa. Complete as quatro fundações para vencer.'],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diário',
      tagline: 'Uma mesa para todo mundo',
      description:
        'Uma distribuição Clássica fixada na data. Jogue de novo, compartilhe ou volte amanhã para uma mesa nova.',
      facts: ['quatro células', 'mesma distribuição do dia', 'qualquer carta no vazio'],
    },
    classic: {
      name: 'Clássico',
      tagline: 'Quatro células livres',
      description: 'Uma distribuição nova com quatro células de uma carta.',
      facts: ['quatro células', 'distribuição nova', 'qualquer carta no vazio'],
    },
    relaxed: {
      name: 'Tranquilo',
      tagline: 'Seis células livres',
      description:
        'Uma distribuição nova e mais leve: duas células a mais facilitam sequências longas.',
      facts: ['seis células', 'distribuição nova', 'qualquer carta no vazio'],
    },
  },
  fields: {
    freeCells: {
      label: 'Células livres',
      group: 'Distribuição',
      options: {
        '4': 'Quatro células — clássico',
        '6': 'Seis células — tranquilo',
      },
      help: 'Estacione uma carta em cada célula. O Tranquilo adiciona duas células extras.',
    },
  },
  presets: {
    classic: 'Clássico',
    relaxed: 'Tranquilo',
  },
};
