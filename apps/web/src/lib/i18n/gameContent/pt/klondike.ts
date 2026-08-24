import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for klondike. Untranslated fields fall back to the pack's English. */
export const klondikePt: GameCopy = {
  name: 'Klondike',
  subtitle: 'o clássico do solitário',
  tagline: 'Limpe a mesa do dia',
  description:
    'Monte sete colunas em ordem decrescente alternando as cores, vire o monte e mande cada naipe para casa do ás ao rei. A mesma distribuição do dia espera por todo mundo.',
  facts: ['1 jogador', 'distribuição diária fixa', 'offline'],
  howToPlay: {
    summary:
      'O clássico solitário de sete colunas, distribuído de forma determinística para uma mesa nova ou para o desafio do dia.',
    objective: 'Monte as quatro fundações do ás ao rei, um naipe por pilha.',
    sections: [
      {
        heading: 'A distribuição',
        body: [
          'Sete colunas guardam de uma a sete cartas. Só a carta do topo de cada coluna começa virada para cima; as outras vinte e quatro formam o monte.',
        ],
      },
      {
        heading: 'Monte as colunas',
        body: [
          'Coloque as cartas em ordem decrescente e alternando as cores. Uma sequência virada para cima se move inteira junta. Só um rei — sozinho ou liderando uma sequência — pode entrar em uma coluna vazia.',
        ],
      },
      {
        heading: 'Vire e recicle',
        body: [
          'No Clássico, viram-se três cartas do monte por vez; no Tranquilo, uma. Só a carta do topo do descarte pode se mover. Quando o monte acabar, vire o descarte de volta sem embaralhar. Não há limite de passadas.',
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
        body: [
          'Ao mover a última carta virada para cima de uma coluna, a carta recém-exposta vira automaticamente. Complete as quatro fundações para vencer.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diário',
      tagline: 'Uma mesa para todo mundo',
      description:
        'Uma distribuição de Tirar Três fixada na data. Jogue de novo, compartilhe ou volte amanhã para uma mesa nova.',
      facts: ['tirar três', 'mesma distribuição do dia', 'passadas ilimitadas'],
    },
    classic: {
      name: 'Clássico',
      tagline: 'Tirar três',
      description: 'Uma distribuição nova em que o monte vira três cartas por vez.',
      facts: ['tirar três', 'distribuição nova', 'passadas ilimitadas'],
    },
    relaxed: {
      name: 'Tranquilo',
      tagline: 'Tirar uma',
      description: 'Uma distribuição nova e mais leve: cada carta do monte chega uma de cada vez.',
      facts: ['tirar uma', 'distribuição nova', 'passadas ilimitadas'],
    },
  },
  fields: {
    drawCount: {
      label: 'Tirada do monte',
      help: 'Vire uma ou três cartas por vez. O descarte pode ser reciclado sem limite de passadas.',
      group: 'Distribuição',
      options: {
        '3': 'Tirar três — clássico',
        '1': 'Tirar uma — tranquilo',
      },
    },
  },
  presets: {
    classic: 'Clássico',
    relaxed: 'Tranquilo',
  },
};
