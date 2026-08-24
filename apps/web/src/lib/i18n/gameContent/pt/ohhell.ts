import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for ohhell. Untranslated fields fall back to the pack's English. */
export const ohhellPt: GameCopy = {
  name: 'Oh Hell',
  subtitle: 'o jogo das apostas',
  tagline: 'Diga suas vazas. Faça exatamente isso.',
  description:
    'As mãos crescem e encolhem a cada rodada enquanto você aposta o número exato de vazas que vai fazer. A regra do gancho garante que alguém vai errar — garanta que não seja você.',
  facts: ['3–7 jogadores', 'aposta · trunfo · exato', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'Aposte o número exato de vazas que você vai fazer — nem mais, nem menos. O baralho encolhe e cresce a cada rodada até alguém superar a mesa nas apostas.',
    objective:
      'Ao longo de uma partida de mãos que crescem e depois encolhem, pontue mais que todo mundo acertando sua aposta em cheio. Um jogador está matematicamente condenado a cada rodada — tente não ser esse jogador.',
    sections: [
      {
        heading: 'A mesa',
        body: [
          'De três a sete jogadores, cada um por si. Uma partida é uma sequência de rodadas; a primeira distribui uma carta para cada um, depois as mãos crescem até um pico (limitado para sempre sobrar uma carta de trunfo) e voltam até uma. A distribuição gira no sentido horário a cada rodada.',
        ],
      },
      {
        heading: 'A virada',
        body: [
          'Depois da distribuição, a próxima carta do monte é virada para cima — o naipe dela é o trunfo da rodada.',
        ],
        bullets: [
          {
            label: 'Sem carta sobrando',
            text: 'quando a distribuição usa o baralho inteiro não há o que virar, e a rodada é jogada sem trunfo',
          },
          {
            label: 'Cortar o trunfo',
            text: 'mesas com “cortar o trunfo” ativado encolhem a rodada de baralho cheio em uma carta, para ainda dar para cortar um trunfo do fundo',
          },
        ],
      },
      {
        heading: 'As apostas',
        body: [
          'Começando à esquerda do dealer e seguindo no sentido horário, cada lugar diz um número de 0 até o tamanho da sua mão: exatamente quantas vazas afirma que vai fazer. Não existe passar nem pedir de novo.',
        ],
        bullets: [
          {
            label: 'A regra do gancho',
            text: 'o dealer aposta por ÚLTIMO e não pode fazer o total das apostas igualar as vazas disponíveis — um jogador nesta mesa tem certeza de que vai errar. A aposta proibida simplesmente não aparece no seu seletor',
          },
          { label: 'Zero', text: 'uma aposta válida como qualquer outra: não fazer vaza nenhuma' },
        ],
      },
      {
        heading: 'Jogando as vazas',
        body: [
          'Quem está à esquerda do dealer puxa a primeira vaza. Siga o naipe se puder; vence o trunfo mais alto, senão a carta mais alta do naipe puxado. Quem ganha a vaza puxa a próxima.',
        ],
      },
      {
        heading: 'Pontuando uma rodada',
        body: [
          'Acerte sua aposta EXATAMENTE ou não pontue nada (padrão). Os pontos da rodada de cada lugar entram no total acumulado; depois da última rodada do arco, o maior total vence.',
        ],
        bullets: [
          {
            label: 'Só exato',
            text: 'acertar em cheio vale 10 + a aposta; qualquer outra coisa vale 0',
          },
          {
            label: 'Penalidade',
            text: 'acertar em cheio vale 10 + a aposta; errar custa menos o tamanho do seu erro',
          },
          {
            label: 'Mais um',
            text: 'acertar em cheio vale o dobro da aposta; qualquer outra coisa vale 0',
          },
        ],
      },
      {
        heading: 'Variante Wizard',
        body: [
          'Com Magos e Bobos ativados, quatro Magos e quatro Bobos entram no baralho (60 cartas) e entortam a ordem normal das coisas.',
        ],
        bullets: [
          {
            label: 'Mago',
            text: 'ganha de tudo; o PRIMEIRO Mago jogado leva a vaza. Puxar com um deixa a vaza sem naipe puxado — qualquer um pode jogar qualquer coisa',
          },
          {
            label: 'Bobo',
            text: 'perde para tudo; se todas as cartas da vaza forem Bobos, a primeira vence. Puxar com um passa o naipe puxado para a próxima carta de verdade',
          },
          {
            label: 'Virada de trunfo',
            text: 'um Mago virado deixa o DEALER escolher o trunfo; um Bobo virado significa rodada sem trunfo',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'Sobe e desce',
      description:
        'O arco clássico — uma carta, crescendo até o pico, de volta até uma. Regra do gancho ligada, só apostas exatas. Alguém erra a cada rodada; tomara que não seja você.',
      facts: ['mãos 1…pico…1', 'regra do gancho', '~20 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Distribui grande, encolhe rápido',
      description:
        'Começa com cinco cartas e desce direto até uma. Uma partida inteira em dez minutos, só nervo e sem enrolação.',
      facts: ['mãos 5→1', '~10 min'],
    },
    wizard: {
      name: 'Wizard',
      tagline: 'Sessenta cartas, quatro certezas',
      description:
        'Quatro Magos sempre vencem e quatro Bobos nunca vencem. O naipe puxado entorta em volta deles e o dealer às vezes escolhe o trunfo. Caos, formalizado.',
      facts: ['baralho de 60 cartas', 'magos ativados'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartas na mão',
      help: 'Cartas distribuídas a cada jogador nesta rodada. Uma partida completa define isso automaticamente a cada rodada.',
      group: 'Partida',
    },
    dealer: {
      label: 'Lugar do dealer',
      help: 'Lugar que distribui nesta rodada e aposta por último. Uma partida completa gira a distribuição a cada rodada.',
      group: 'Partida',
    },
    handArc: {
      label: 'Arco das mãos',
      help: 'Como os tamanhos de mão se movem ao longo da partida: sobem e descem, só sobem, ou distribuem grande e encolhem.',
      group: 'Partida',
      options: {
        updown: 'Sobe e desce — 1…pico…1',
        up: 'Só sobe — 1…pico',
        down: 'Só desce — pico…1',
      },
    },
    maxHand: {
      label: 'Maior mão',
      help: 'O arco nunca distribui mais do que isso — limitado para toda rodada guardar uma carta para virar o trunfo.',
      group: 'Partida',
    },
    hookRule: {
      label: 'Regra do gancho',
      help: 'Sacaneia o dealer: a última aposta não pode fazer o total ficar exatamente igual às vazas disponíveis, então alguém sempre erra.',
      group: 'Apostas',
    },
    scoring: {
      label: 'Pontuação',
      help: 'Acerte sua aposta em cheio para pontuar. Os esquemas diferem no que um erro custa.',
      group: 'Pontuação',
      options: {
        exactOnly: 'Só exato — 10 + a aposta ou nada',
        penalty: 'Penalidade — erre por n, perca n',
        plusOne: 'Mais um — o dobro da aposta ao acertar',
      },
    },
    wizards: {
      label: 'Magos e Bobos',
      help: 'Adiciona quatro Magos (sempre vencem) e quatro Bobos (sempre perdem) — um baralho de 60 cartas.',
      group: 'Avançado',
    },
    trumpOnLastRound: {
      label: 'Cortar trunfo nas rodadas de baralho cheio',
      help: 'Quando uma rodada distribuiria o baralho inteiro, corta um trunfo do fundo primeiro (as mãos encolhem em uma) em vez de jogar sem trunfo.',
      group: 'Avançado',
    },
  },
  presets: {
    classic: 'Clássico',
    quick: 'Rápida',
    wizard: 'Wizard',
  },
};
