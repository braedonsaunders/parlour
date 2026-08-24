import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for scopa. Untranslated fields fall back to the pack's English. */
export const scopaPt: GameCopy = {
  name: 'Scopa',
  subtitle: 'o jogo da pescaria',
  tagline: 'Varra a mesa',
  description:
    'Capture cartas da mesa combinando ou somando valores, junte as moedas douradas e cace o settebello. Limpe a mesa inteira e grite scopa — a palavra mais doce dos salões de cartas italianos.',
  facts: ['2–6 jogadores', 'captura · somas', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'O clássico italiano da pescaria — capture cartas da mesa e varra tudo para fazer uma scopa.',
    objective:
      'Capture cartas da mesa combinando ou somando os valores delas. Mais cartas, mais ouros, o settebello, a primiera e cada scopa valem um ponto; o primeiro a chegar ao alvo (11 por padrão) vence a partida.',
    sections: [
      {
        heading: 'A mesa',
        body: [
          'Scopa se joga com um baralho italiano de 40 cartas: Denari (ouros), Coppe (copas), Spade (espadas) e Bastoni (paus), valores de 1 a 10. Podem jogar dois, três, quatro ou seis — com quatro e seis você joga em duplas fixas, com os lugares alternados ao redor da mesa.',
          'Cada distribuição dá três cartas a cada jogador e coloca quatro viradas para cima na mesa. Se três ou mais Reis aparecerem na mesa de abertura, o baralho é reembaralhado e distribuído de novo.',
        ],
      },
      {
        heading: 'Capturando',
        body: [
          'Na sua vez, jogue exatamente uma carta da sua mão. As cartas capturam só pelo número — o naipe nunca importa.',
        ],
        bullets: [
          {
            label: 'Combinar',
            text: 'sua carta leva uma única carta da mesa do mesmo valor: um 5 leva um 5',
          },
          {
            label: 'Escolher',
            text: 'se duas cartas da mesa tiverem esse valor, você escolhe qual levar — escolha bem, o que sobra importa',
          },
          {
            label: 'Somar',
            text: 'sua carta pode levar duas ou mais cartas da mesa que somem o valor dela: um 8 leva um 3 e um 5. Mas se existir uma combinação de uma carta só, você DEVE levá-la — somas são só para quando não há combinação na mesa',
          },
          {
            label: 'Largar',
            text: 'nada combina? Sua carta fica na mesa, virada para cima e à disposição de todos',
          },
        ],
      },
      {
        heading: 'Scopa',
        body: [
          'Varra todas as cartas restantes da mesa numa única captura e você fez uma scopa: um ponto, marcado na hora. Uma scopa na última carta da última distribuição não conta — essas cartas são varridas de qualquer jeito. Quando as mãos esvaziam, três cartas novas são distribuídas a cada jogador; a mesa nunca é reposta. Quando o baralho acaba, o último jogador que capturou varre as cartas que sobraram na mesa, e essa varredura não é scopa.',
        ],
      },
      {
        heading: 'Pontuando uma rodada',
        body: [
          'Depois da última distribuição, quatro pontos são divididos, mais as scope que foram feitas. Em mesas de duplas, as capturas dos times são somadas antes da pontuação.',
        ],
        bullets: [
          {
            label: 'Carte',
            text: 'mais cartas capturadas — 21 ou mais das 40 no jogo de dois; empate não pontua ninguém',
          },
          {
            label: 'Denari',
            text: 'mais ouros capturados — 6 ou mais dos 10; empate não pontua ninguém',
          },
          { label: 'Settebello', text: 'quem capturou o belo 7 de ouros marca 1, sempre' },
          {
            label: 'Primiera',
            text: 'a melhor carta de cada naipe somada — o 7 vale 21, o 6 vale 18, o Ás 16, 5→15, 4→14, 3→13, 2→12 e as figuras só 10. Sem nenhuma carta de algum naipe, você não pode vencer. O maior total leva 1 ponto; empates não pontuam ninguém',
          },
          { label: 'Scope', text: 'um ponto cada, já guardadas durante o jogo' },
        ],
      },
      {
        heading: 'A partida',
        body: [
          'As rodadas se repetem — o dealer anda para a esquerda a cada vez — até alguém cruzar a pontuação alvo. Se os dois lados chegarem empatados na linha, outra rodada decide.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: [
          'As configurações da sala expõem os botões clássicos: o alvo (11/16/21), Scopone (baralho inteiro distribuído, sem monte), Napola (bônus pela sequência de ouros), Re di denari (bônus pelo Rei de ouros) e a exibição com naipes franceses, que é puramente visual.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'Primeiro a 11',
      description:
        'Scopa como se joga em todo bar italiano: três cartas por vez, quatro pontos por rodada, primeiro a onze.',
      facts: ['partida a 11', 'distribuições de 3 cartas', '~20 min'],
    },
    lungo: {
      name: 'Lungo',
      tagline: 'O jogo longo',
      description:
        'As mesmas regras, corrida até vinte e um. Espaço para viradas, desafetos e scope lendárias.',
      facts: ['partida a 21', 'distribuições de 3 cartas', '~40 min'],
    },
    scopone: {
      name: 'Scopone',
      tagline: 'Baralho inteiro, sem piedade',
      description:
        'O clássico de quatro da velha guarda: dez cartas para cada um, distribuídas de uma vez, sem monte, nada escondido. Toda captura é um compromisso.',
      facts: ['4 jogadores · 2v2', 'baralho inteiro', '~30 min'],
    },
  },
  fields: {
    target: {
      label: 'Partida a',
      help: 'Depois de cada rodada, a maior pontuação na linha ou acima dela vence. Empate na linha distribui outra rodada.',
      group: 'Partida',
      options: {
        '11': '11 — clássico',
        '16': '16 — longo',
        '21': '21 — lungo',
      },
    },
    scopone: {
      label: 'Scopone',
      help: 'O clássico de quatro da velha guarda: o baralho inteiro é distribuído de uma vez e não há monte para puxar. Capturar fica bem mais apertado.',
      group: 'Distribuição',
    },
    napola: {
      label: 'Napola',
      help: 'Tenha o Ás, o 2 e o 3 de ouros para 3 pontos de bônus, mais 1 para cada carta de ouros que continuar a sequência (4, 5, …).',
      group: 'Pontuação',
    },
    reDenari: {
      label: 'Re di denari',
      help: 'Um ponto de bônus para quem capturar o Rei de ouros.',
      group: 'Pontuação',
    },
    frenchSuits: {
      label: 'Exibição com naipes franceses',
      help: 'Mostra denari/coppe/spade como ouros/copas/espadas para a arte de cartas padrão renderizar. Puramente visual — os ids e as regras continuam italianos.',
      group: 'Mesa',
    },
  },
  presets: {
    classic: 'Clássico',
    lungo: 'Lungo',
    'scopone-preset': 'Scopone',
  },
};
