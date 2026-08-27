import type { GameCopy } from '../types';

/** Portuguese copy for tripeaks. Untranslated fields fall back to the pack's English. */
export const tripeaksPt: GameCopy = {
  name: 'TriPeaks',
  subtitle: 'limpe os três picos',
  tagline: 'Jogue ±1 sobre o buraco',
  description:
    'Dezoito cartas em três picos, todas viradas para cima. Libere uma carta limpando o que a cobre, encadeie jogadas sobre o buraco e limpe os picos.',
  facts: ['1 jogador', 'picos diários com semente', 'offline'],
  howToPlay: {
    summary:
      'Um paciência de um jogador: três picos de dezoito cartas, todas viradas para cima, e um monte que você vira sobre um único buraco.',
    objective:
      'Limpe todas as cartas dos picos. As cartas que sobrarem são sua pontuação — quanto menos, melhor.',
    sections: [
      {
        heading: 'O baralho',
        body: [
          'Três picos de dezoito cartas ficam viradas para cima em quatro fileiras. A fileira base de nove está sempre livre. As trinta e quatro cartas restantes formam o monte, e a primeira abre o buraco.',
        ],
      },
      {
        heading: 'Cartas livres',
        body: [
          'Uma carta fica livre quando as duas cartas que a cobrem desaparecem. Só cartas livres podem se mover — as que ainda estão cobertas ficam presas até que suas filhas se libertem.',
        ],
      },
      {
        heading: 'Jogue sobre o buraco',
        body: [
          'Jogue uma carta livre sobre o buraco quando ela estiver a um valor de distância — um 8 aceita um 7 ou um 9. Naipes e cores não importam. Encadeie o máximo de jogadas que conseguir.',
        ],
      },
      {
        heading: 'Vire o monte',
        body: [
          'Se nada nos picos encaixar, vire a próxima carta do monte sobre o buraco. A carta anterior do buraco fica enterrada por baixo.',
        ],
      },
      {
        heading: 'Ás, Rei e o monte',
        body: [
          'O TriPeaks Clássico trata o Ás e o Rei como becos sem saída, e o monte nunca volta. Relaxado deixa o Ás e o Rei se conectarem, e permite embaralhar o buraco de volta ao monte uma vez que ele acabe.',
        ],
      },
      {
        heading: 'A pontuação',
        body: [
          'A partida termina quando os picos ficam limpos, ou quando nada joga e o monte não pode voltar. As cartas que restarem nos picos são sua pontuação. Zero é uma limpeza total.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diário',
      tagline: 'Um baralho para todos',
      description:
        'Um baralho Clássico com semente da data. Repita, compartilhe ou volte amanhã para picos novos.',
      facts: ['sem conexão A–K', 'mesmo baralho diário', 'menor sobra vence'],
    },
    classic: {
      name: 'Clássico',
      tagline: 'Ás e Rei te param',
      description:
        'Um baralho novo com semente. O Ás e o Rei são becos sem saída; o monte nunca volta.',
      facts: ['sem conexão A–K', 'baralho novo', 'sem reciclagem'],
    },
    relaxed: {
      name: 'Relaxado',
      tagline: 'O Ás conecta com o Rei',
      description:
        'Os mesmos três picos, mas o Ás e o Rei se jogam um sobre o outro e o buraco pode ser reciclado uma vez.',
      facts: ['conecta A–K', 'baralho novo', 'uma reciclagem'],
    },
  },
  fields: {
    wrap: {
      label: 'O Ás conecta com o Rei',
      group: 'Buraco',
      help: 'O TriPeaks Clássico para no Ás e no Rei. Relaxado deixa A e K se jogarem um sobre o outro.',
    },
    recycle: {
      label: 'Reciclar o buraco',
      group: 'Monte',
      help: 'Quando o monte acaba, embaralhe o buraco (menos sua carta do topo) de volta ao monte uma vez.',
    },
  },
  presets: {
    classic: 'Clássico',
    relaxed: 'Relaxado',
  },
};
