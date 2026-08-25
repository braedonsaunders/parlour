import type { GameCopy } from '../types';

/** Portuguese copy for pyramid. Untranslated fields fall back to the pack's English. */
export const pyramidPt: GameCopy = {
  name: 'Pirâmide',
  subtitle: 'some até treze',
  tagline: 'Limpe a pirâmide diária',
  description:
    'Vinte e oito cartas em um triângulo. Emparelhe valores livres que somam 13, vire o estoque e deixe o mínimo possível.',
  facts: ['1 jogador', 'pirâmide diária com semente', 'offline'],
  howToPlay: {
    summary:
      'Um paciência para uma pessoa: vinte e oito cartas em pirâmide e um estoque que você vira sobre um único descarte.',
    objective:
      'Emparelhe cartas livres que somam treze e limpe a mesa. As que restarem são a sua pontuação — quanto menor, melhor.',
    sections: [
      {
        heading: 'A distribuição',
        body: [
          'Sete fileiras formam uma pirâmide de vinte e oito cartas viradas. Uma carta está livre quando as duas que a cobrem saem — ou quando ela está na última fileira. As vinte e quatro restantes formam o estoque. O descarte começa vazio.',
        ],
      },
      {
        heading: 'Some até treze',
        body: [
          'O Ás vale 1 e o Rei vale 13. Qualquer par de cartas livres cujos valores somam 13 pode ser emparelhado — Dama e Ás, Valete e 2, e assim por diante. Um Rei já vale 13 e sai sozinho. Os naipes não importam.',
        ],
      },
      {
        heading: 'O descarte',
        body: [
          'Vire uma carta do estoque para o descarte de cada vez. Só a carta de cima está viva: emparelhe-a com uma carta livre da pirâmide, ou retire-a se for um Rei. Cartas enterradas do descarte não se emparelham entre si.',
        ],
      },
      {
        heading: 'Reciclar',
        body: [
          'Quando o estoque acaba, vire o descarte de volta sem embaralhar. Clássico permite duas reciclagem — três passagens. Relaxado nunca acaba.',
        ],
      },
      {
        heading: 'A pontuação',
        body: [
          'A partida termina quando não resta nenhuma carta, ou quando nada emparelha e o estoque não pode voltar. Cada carta ainda na pirâmide, no estoque ou no descarte conta. Zero é um clear.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diário',
      tagline: 'Uma pirâmide para todos',
      description:
        'Uma pirâmide Clássica com semente da data. Repita, compartilhe ou volte amanhã para uma mesa nova.',
      facts: ['duas reciclagem', 'mesmo baralho diário', 'ganha quem deixa menos'],
    },
    classic: {
      name: 'Clássico',
      tagline: 'Três passagens',
      description:
        'Uma pirâmide nova com semente. O descarte pode ser reciclado duas vezes — três viagens pelo estoque.',
      facts: ['duas reciclagem', 'baralho novo', 'três passagens'],
    },
    relaxed: {
      name: 'Relaxado',
      tagline: 'Passagens ilimitadas',
      description:
        'A mesma mesa de emparelhar, mas o descarte pode ser virado de volta quantas vezes você quiser.',
      facts: ['reciclagem ilimitada', 'baralho novo', 'sem limite de passagens'],
    },
  },
  fields: {
    recyclesLimit: {
      label: 'Reciclagens do descarte',
      group: 'Estoque',
      options: {
        '2': 'Duas reciclagens — clássico',
        '-1': 'Ilimitadas — relaxado',
      },
      help: 'Clássico permite duas reciclagens, três passagens pelo estoque. Relaxado nunca acaba.',
    },
  },
  presets: {
    classic: 'Clássico',
    relaxed: 'Relaxado',
  },
};
