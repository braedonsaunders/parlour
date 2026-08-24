import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for spades. Untranslated fields fall back to the pack's English. */
export const spadesPt: GameCopy = {
  name: 'Espadas',
  subtitle: 'o jogo de duplas',
  tagline: 'Aposte suas vazas',
  description:
    'Sente de frente para o seu parceiro, diga um número e ganhe essa quantidade de vazas — nem a mais, nem a menos se puder evitar. Espadas são sempre trunfo. As sobras vão te achar.',
  facts: ['4 jogadores · 2v2', 'aposta · trunfo · sobras', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'O clássico americano de duplas — aposte suas vazas, corte com espadas e corra até os 500.',
    objective:
      'Sentado de frente para o seu parceiro, ganhe pelo menos tantas vazas quanto vocês apostarem juntos. O primeiro time a chegar na pontuação alvo (500 por padrão) vence; um empate na linha ou acima dela joga mais uma mão.',
    sections: [
      {
        heading: 'A mesa',
        body: [
          'Quatro jogadores, dois times: você e o jogador à sua frente são parceiros. Cada mão distribui o baralho inteiro de 52 cartas — treze cartas para cada um. Tanto a distribuição quanto a primeira aposta começam à esquerda de quem dá as cartas e seguem no sentido horário.',
        ],
      },
      {
        heading: 'As apostas',
        body: [
          'Cada lugar diz um número, uma única vez. Não existe passar nem apostar de novo. O contrato do seu time é a soma das duas apostas que não são nulo.',
        ],
        bullets: [
          { label: '1–13', text: 'quantas vazas você espera ganhar' },
          {
            label: 'Nulo',
            text: 'uma aposta à parte — não ganhe nenhuma vaza e leve +100, ou −100 se ganhar alguma. As vazas de um nulo furado não ajudam o seu parceiro a cumprir o contrato, mas cada uma ainda conta como sobra',
          },
        ],
      },
      {
        heading: 'Jogando as vazas',
        body: [
          'O jogador à esquerda de quem deu as cartas puxa a primeira vaza. Siga o naipe se puder; vence a espada mais alta, ou, se não houver, a carta mais alta do naipe puxado. Quem vence a vaza puxa a próxima.',
        ],
        bullets: [
          {
            label: 'Quebrando espadas',
            text: 'não se pode puxar com espada até que alguém tenha descartado uma por estar sem o naipe — a não ser que só sobrem espadas na sua mão',
          },
          {
            label: 'Sem o naipe',
            text: 'acabou o naipe puxado? Jogue o que quiser, inclusive um trunfo',
          },
        ],
      },
      {
        heading: 'Pontuando uma mão',
        body: [
          'Se os lugares do time que não apostaram nulo ganharem pelo menos o contrato, o time marca 10 pontos por vaza apostada mais 1 por cada vaza a mais. Se vocês ficarem abaixo, o contrato custa −10 por vaza apostada.',
        ],
        bullets: [
          {
            label: 'Sobras',
            text: 'as vazas a mais (e as vazas de um nulo furado) são sobras. Elas acumulam de mão em mão; a cada dez sobras você perde 100 pontos e o que restar fica na conta',
          },
          {
            label: 'Nulo',
            text: 'pontuado à parte, somado ao resultado do contrato do parceiro',
          },
        ],
      },
      {
        heading: 'A partida',
        body: [
          'As mãos se acumulam até um time alcançar o alvo (250 / 500 / 750). Vence a maior pontuação; se os dois times terminarem com o mesmo total na linha ou acima dela, distribui-se mais uma mão.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: [
          'As configurações da sala mexem em apenas três coisas: a pontuação alvo, se o nulo é permitido e se as sobras contam. As mesas clássicas mantêm os padrões. Nulo às cegas não é oferecido.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'Pela cartilha',
      description:
        'Espadas de duplas até 500, com nulo e com sobras. O jogo como se joga em qualquer mesa de cozinha.',
      facts: ['partida até 500', 'nulo · sobras', '~25 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Primeiro a 250',
      description:
        'As mesmas regras, corrida mais curta — 250 pontos e acabou. Uma partida inteira na hora do almoço.',
      facts: ['partida até 250', 'nulo · sobras', '~12 min'],
    },
    'clean-books': {
      name: 'Vazas limpas',
      tagline: 'Sem sobras',
      description:
        'Cumpra sua aposta ou estoure — as vazas a mais não são sobras e não valem ponto. Precisão acima de volume.',
      facts: ['partida até 500', 'nulo ativado', 'sobras desativadas'],
    },
  },
  fields: {
    targetScore: {
      label: 'Partida até',
      help: 'Depois de cada mão, o time mais alto na linha ou acima desta pontuação vence. Se empatar, joga-se mais uma mão.',
      group: 'Partida',
      options: {
        '250': '250 — corte rápido',
        '500': '500 — padrão',
        '750': '750 — partida longa',
      },
    },
    nil: {
      label: 'Permitir nulo',
      help: 'Uma aposta de zero é nulo: não ganhe nenhuma vaza e leve +100, ou −100 se ganhar alguma. As vazas de um nulo furado não ajudam no contrato do parceiro.',
      group: 'Apostas',
    },
    bags: {
      label: 'Contar sobras',
      help: 'As vazas a mais e as vazas de um nulo furado são sobras. A cada dez sobras você perde 100 pontos; o que sobrar fica na conta.',
      group: 'Pontuação',
    },
  },
  presets: {
    classic: 'Clássico',
    quick: 'Rápida',
    'clean-books': 'Vazas limpas',
  },
};
