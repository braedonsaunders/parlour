import type { GameCopy } from '../types';

/** Portuguese copy for spider. Untranslated fields fall back to the pack's English. */
export const spiderPt: GameCopy = {
  name: 'Spider',
  subtitle: 'o paciência de dois baralhos',
  tagline: 'Tira oito sequências do mesmo naipe',
  description:
    'Monta dez colunas em ordem decrescente, move só sequências do mesmo naipe e tira cada Rei-a-Ás da mesa. O mesmo baralho diário de dois naipes espera por todos.',
  facts: ['1 jogador', 'baralho diário com semente', 'offline'],
  howToPlay: {
    summary:
      'Spider ao estilo Microsoft com dois baralhos: dez colunas, cinco filas de reserva e oito naipes para limpar.',
    objective: 'Leva oito sequências do mesmo naipe, do Rei ao Ás, para as bases.',
    sections: [
      {
        heading: 'O baralho',
        body: [
          'Dez colunas são dadas: as quatro primeiras têm seis cartas e as outras cinco. Só a carta de cima de cada coluna começa virada. Restam cinquenta cartas no estoque em cinco filas de dez.',
        ],
      },
      {
        heading: 'Monta o tabuleiro',
        body: [
          'Coloca as cartas em ordem decrescente, qualquer naipe. Só uma sequência descendente do mesmo naipe pode mover-se em bloco. Uma coluna vazia aceita qualquer carta ou sequência.',
        ],
      },
      {
        heading: 'Dá uma fila',
        body: [
          'Clica no estoque para dar uma carta virada a cada coluna. Não podes dar enquanto alguma coluna estiver vazia, nem quando restarem menos de dez cartas.',
        ],
      },
      {
        heading: 'Limpa um naipe',
        body: [
          'Quando uma sequência do mesmo naipe de Rei a Ás fica completa numa coluna, ela vai para uma base no mesmo lance. Uma carta tapada que fique descoberta vira sozinha.',
        ],
      },
      {
        heading: 'Os naipes',
        body: [
          'Relaxado pinta as 104 cartas como espadas. Clássico (o diário) usa espadas e copas. Difícil usa todos os naipes, por isso as sequências empacotadas são mais raras.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diário',
      tagline: 'Uma mesa para todos',
      description:
        'Um baralho de dois naipes com semente da data. Rejoga, partilha, ou volta amanhã a uma mesa nova.',
      facts: ['dois naipes', 'mesmo baralho diário', 'cinco filas de estoque'],
    },
    relaxed: {
      name: 'Relaxado',
      tagline: 'Só espadas',
      description:
        'Um baralho novo mais suave: cada carta é uma espada, e as sequências juntam-se com facilidade.',
      facts: ['um naipe', 'baralho novo', 'cinco filas de estoque'],
    },
    classic: {
      name: 'Clássico',
      tagline: 'Dois naipes',
      description:
        'Um baralho novo com semente pintado em espadas e copas — o padrão da Microsoft.',
      facts: ['dois naipes', 'baralho novo', 'cinco filas de estoque'],
    },
    hard: {
      name: 'Difícil',
      tagline: 'Quatro naipes',
      description:
        'O baralho completo de dois maços. Sequências do mesmo naipe são raras e cada limpeza é ganha.',
      facts: ['quatro naipes', 'baralho novo', 'cinco filas de estoque'],
    },
  },
  fields: {
    suitCount: {
      label: 'Naipes',
      group: 'Baralho',
      options: {
        '1': 'Um naipe — relaxado',
        '2': 'Dois naipes — clássico',
        '4': 'Quatro naipes — difícil',
      },
      help: 'Os baralhos de um naipe são todos espadas. O clássico usa espadas e copas. O difícil usa todos os naipes.',
    },
  },
  presets: {
    relaxed: 'Relaxado',
    classic: 'Clássico',
    hard: 'Difícil',
  },
};
