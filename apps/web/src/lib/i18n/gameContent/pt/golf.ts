import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for golf. Untranslated fields fall back to the pack's English. */
export const golfPt: GameCopy = {
  name: 'Golfe',
  subtitle: 'o paciência rápido',
  tagline: 'Jogue ±1 no buraco',
  description:
    'Sete colunas de cinco, todas as cartas viradas. Jogue um valor vizinho do buraco, encadeie o quanto puder e deixe o mínimo possível na grama.',
  facts: ['1 jogador', 'buraco diário com semente', 'offline'],
  howToPlay: {
    summary:
      'Um paciência rápido para uma pessoa: sete colunas de cinco, todas as cartas à mostra e um só buraco.',
    objective:
      'Limpe todas as cartas da grama. As que restarem são a sua pontuação — quanto menor, melhor.',
    sections: [
      {
        heading: 'A distribuição',
        body: [
          'Sete colunas recebem cinco cartas viradas cada. As dezessete restantes formam o estoque. A primeira carta do estoque abre o buraco.',
        ],
      },
      {
        heading: 'Jogue no buraco',
        body: [
          'Só a carta mais baixa de cada coluna pode sair. Jogue-a no buraco quando estiver a um valor de distância — um 8 aceita 7 ou 9. Naipes e cores não importam.',
        ],
      },
      {
        heading: 'Vire o estoque',
        body: [
          'Se nada na grama encaixa, vire a próxima carta do estoque sobre o buraco. A carta antiga fica enterrada e não volta. Não há reciclagem.',
        ],
      },
      {
        heading: 'Ás e Rei',
        body: [
          'O Golfe clássico trata Ás e Rei como beco sem saída. Fairway deixa os dois se conectarem para a sequência continuar.',
        ],
      },
      {
        heading: 'A pontuação',
        body: [
          'O buraco acaba quando a grama está limpa ou o estoque acaba e não há mais jogadas. As cartas que restam no tableau são a sua pontuação. Zero é um clear.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diário',
      tagline: 'Um buraco para todos',
      description:
        'Um buraco Clássico com semente da data. Rejogue, compartilhe ou volte amanhã para uma mesa nova.',
      facts: ['sem volta', 'mesmo deal diário', 'ganha quem deixa menos'],
    },
    classic: {
      name: 'Clássico',
      tagline: 'Ás e Rei te param',
      description:
        'Um buraco novo com semente. Ás e Rei são becos sem saída; o estoque nunca volta.',
      facts: ['sem volta', 'deal novo', 'sem reciclagem'],
    },
    fairway: {
      name: 'Fairway',
      tagline: 'Ás envolve o Rei',
      description:
        'O mesmo buraco rápido, mas Ás e Rei jogam um no outro para as sequências durarem mais.',
      facts: ['envolve A–K', 'deal novo', 'sem reciclagem'],
    },
  },
  fields: {
    wrap: {
      label: 'Ás envolve o Rei',
      group: 'Buraco',
      help: 'O Golfe clássico para no Ás e no Rei. Fairway deixa A e K jogarem um no outro.',
    },
  },
  presets: {
    classic: 'Clássico',
    fairway: 'Fairway',
  },
};
