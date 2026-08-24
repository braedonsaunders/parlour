import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for gin. Untranslated fields fall back to the pack's English. */
export const ginPt: GameCopy = {
  name: 'Gin',
  subtitle: 'o clássico do rummy',
  tagline: 'Combine, bata, vença a noite',
  description:
    'Dez cartas, duas cadeiras. Monte trincas e sequências, livre-se das cartas mortas e bata na mesa antes do seu adversário.',
  facts: ['2 jogadores', 'bater · gin · big gin', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'O clássico para dois — compre, descarte e combine até chegar numa mão digna de batida.',
    objective:
      'Transforme suas dez cartas em trincas e sequências para que quase nada sobre, e bata antes do seu adversário. O primeiro a passar do alvo da partida vence.',
    sections: [
      {
        heading: 'Combinações e cartas mortas',
        body: [
          'Uma combinação é uma trinca ou quadra de mesmo valor, ou três ou mais cartas do mesmo naipe em sequência. O ás vale só como baixo (A-2-3, nunca Q-K-A).',
          'Tudo que não está numa combinação é carta morta, contada pelo valor de face, com as figuras valendo dez e os ases um. Quanto menos, melhor.',
        ],
      },
      {
        heading: 'Seu turno',
        body: ['Dois passos, todo turno:'],
        bullets: [
          { label: 'Comprar', text: 'pegue a carta do topo do monte, ou a do topo do descarte' },
          {
            label: 'Descartar',
            text: 'deslize uma carta virada para cima sobre o descarte — nunca a carta que você comprou neste turno, de nenhum dos montes',
          },
        ],
      },
      {
        heading: 'A carta virada inicial',
        body: [
          'Depois da distribuição, uma carta fica virada para cima. Quem não deu as cartas pode pegá-la para a mão ou passar; depois, quem deu tem a mesma escolha. Se os dois passarem, quem não deu compra do monte e o jogo começa.',
        ],
      },
      {
        heading: 'Bater',
        body: [
          'Em vez de descartar, você pode bater quando suas cartas mortas estiverem no limite de batida ou abaixo dele (10 por padrão). Isso encerra a mão na hora — sem descarte. Comprar uma décima primeira carta antes abre a linha do big gin, se tudo combinar.',
        ],
      },
      {
        heading: 'Gin e encaixes',
        body: [
          'Zero cartas mortas é gin — o defensor não pode encaixar nada e paga todas as suas cartas mortas mais o bônus de gin.',
          'Numa batida simples, o defensor encaixa primeiro: qualquer carta morta dele que estenda uma trinca do batedor para uma quadra ou alongue uma sequência nas duas pontas sai da conta antes da comparação.',
          'Se as cartas mortas do defensor terminarem iguais ou menores que as suas, isso é um undercut — ele leva a diferença mais um bônus no seu lugar.',
        ],
      },
      {
        heading: 'Pontuação e a partida',
        body: [
          'As mãos continuam até alguém passar do alvo da partida (100 por padrão), alternando quem dá as cartas a cada mão.',
        ],
        bullets: [
          { label: 'Batida', text: 'diferença entre as cartas mortas' },
          { label: 'Undercut', text: 'diferença + 25 para o defensor' },
          { label: 'Gin', text: 'todas as cartas mortas do defensor + 25' },
          {
            label: 'Big gin',
            text: 'onze cartas todas combinadas — cartas mortas do defensor + 31 (opcional)',
          },
          {
            label: 'Bônus de caixa',
            text: 'opcional: +25 por mão vencida, somado no final (opcional)',
          },
        ],
      },
      {
        heading: 'Regras da casa',
        body: ['Toda mesa pode ser ajustada nas configurações da sala:'],
        bullets: [
          {
            label: 'Limite de batida',
            text: 'o quão baixo você precisa estar para bater — limites mais apertados fazem as mãos durarem mais',
          },
          {
            label: 'Alvo da partida',
            text: '50 para um jogo rápido, 100 clássico, mais para os maratonistas',
          },
          { label: 'Big gin / bônus / bônus de caixa', text: 'os botões do prêmio' },
        ],
      },
      {
        heading: 'Mãos mortas',
        body: [
          'Se o monte chegar a duas cartas, a mão morre — sem pontos, quem deu as cartas distribui de novo. Bata mais cedo.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'Direto até 100',
      description:
        'O padrão de boteco — bata com dez cartas mortas ou menos, gin paga 25, big gin paga 31. O primeiro a passar de 100 leva.',
      facts: ['batida até 10', 'partida até 100', '~15 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Corrida até 50',
      description: 'As mesmas regras, escada mais curta. Um duelo rapidinho para o café.',
      facts: ['partida até 50', '~8 min'],
    },
    purist: {
      name: 'Purista',
      tagline: 'Sem frescura',
      description:
        'Big gin fora e bônus de caixa em casa. Batidas puras, cartas mortas puras, sem rede de proteção.',
      facts: ['sem big gin', 'sem bônus de caixa'],
    },
  },
  fields: {
    knockCap: {
      label: 'Limite de batida',
      help: 'O máximo de cartas mortas com que você pode bater',
      group: 'Mesa',
    },
    matchTarget: {
      label: 'Partida até',
      help: 'O primeiro a passar desta pontuação vence a partida',
      group: 'Mesa',
    },
    ginBonus: {
      label: 'Bônus de gin',
      group: 'Bônus',
    },
    bigGin: {
      label: 'Big gin',
      help: 'Compre uma décima primeira carta que combine por completo',
      group: 'Bônus',
    },
    bigGinBonus: {
      label: 'Bônus de big gin',
      group: 'Bônus',
    },
    boxBonus: {
      label: 'Bônus de caixa',
      help: '+25 por mão vencida, somado ao total final',
      group: 'Bônus',
    },
  },
  presets: {
    classic: 'Clássico',
    quick: 'Rápida',
    purist: 'Purista',
  },
};
