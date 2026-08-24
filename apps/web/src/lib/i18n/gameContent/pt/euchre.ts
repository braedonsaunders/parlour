import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for euchre. Untranslated fields fall back to the pack's English. */
export const euchrePt: GameCopy = {
  name: 'Euchre',
  subtitle: 'o jogo de duplas',
  tagline: 'Ganhe vazas pelo seu time',
  description:
    'Peça o trunfo, escolha seu naipe e corra atrás dos bowers com o jogador do outro lado da mesa. O primeiro time a chegar em dez leva a partida.',
  facts: ['4 jogadores · 2v2', 'jogo de vazas', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'O clássico do Meio-Oeste americano — forme sua dupla, escolha o trunfo e corra com seu time até os 10 pontos.',
    objective:
      'Sentado de frente para o seu parceiro, ganhe pelo menos três das cinco vazas de cada mão fazendo do naipe escolhido o rei da mesa. O primeiro time a chegar na pontuação alvo vence a partida.',
    sections: [
      {
        heading: 'A mesa',
        body: [
          'Quatro jogadores, dois times: você e o jogador à sua frente são parceiros. Cinco cartas para cada um; as últimas quatro cartas formam o monte reserva, com a carta de cima virada para cima.',
        ],
      },
      {
        heading: 'Pedir — primeira rodada de apostas',
        body: [
          'Começando à esquerda de quem deu as cartas, cada um aceita ou passa a carta virada:',
        ],
        bullets: [
          {
            label: 'Pedir',
            text: 'aquele naipe vira trunfo, quem deu as cartas pega a carta para a mão e descarta uma virada para baixo',
          },
          {
            label: 'Ir sozinho',
            text: 'pega o trunfo e manda seu parceiro para o banco nesta mão',
          },
          { label: 'Passar', text: 'a decisão passa para a esquerda' },
        ],
      },
      {
        heading: 'Escolher o trunfo — segunda rodada',
        body: [
          'Se os quatro passarem, a carta virada é enterrada e cada lugar pode escolher qualquer outro naipe como trunfo. O naipe recusado está fora de jogo.',
          'Obrigar quem deu as cartas (padrão): se todos os outros passarem na segunda rodada, quem deu as cartas é obrigado a escolher um naipe.',
        ],
      },
      {
        heading: 'Bowers',
        body: [
          'Quando um naipe é escolhido, o valete dele é o bower DIREITO — a carta mais alta do jogo. O valete do naipe da mesma cor é o bower ESQUERDO, o segundo mais alto, e conta como trunfo. Então, com copas como trunfo, J♥ e depois J♦ são as duas cartas mandonas.',
        ],
      },
      {
        heading: 'Jogando as vazas',
        body: [
          'O jogador à esquerda de quem deu as cartas puxa. Você é obrigado a seguir o naipe puxado se puder — lembre-se de que o bower esquerdo pertence ao trunfo, não ao naipe impresso. A carta mais alta do naipe puxado vence a vaza, a menos que alguém corte com trunfo; o trunfo mais alto ganha de tudo. Quem vence puxa a próxima.',
        ],
      },
      {
        heading: 'Pontuando uma mão',
        body: ['O time que pediu é o MANDANTE. Depois das cinco vazas:'],
        bullets: [
          { label: '3 ou 4 vazas', text: 'os mandantes marcam 1 ponto' },
          { label: '5 vazas', text: 'uma marcha — os mandantes marcam 2' },
          {
            label: 'Marcha sozinho',
            text: 'as cinco vazas jogando sozinho — os mandantes marcam 4',
          },
          {
            label: 'Euchrado!',
            text: 'os mandantes ganham menos de três vazas — os defensores marcam 2',
          },
        ],
      },
      {
        heading: 'Ir sozinho',
        body: [
          'Quem pedir com confiança de sobra pode jogar sem o parceiro, que fica de fora da mão por completo. Ganhe as cinco sozinho e vale 4 pontos — mas faça menos de três e a defesa ainda te euchra por 2.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: [
          'As configurações da sala ajustam a partida: jogo até 5/10/15, obrigar quem deu as cartas ligado ou desligado e se ir sozinho é permitido. Quando todas as mãos são abandonadas sem escolha de trunfo, a distribuição simplesmente passa para a esquerda.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Boteco clássico',
      tagline: 'O jogo de verdade',
      description:
        'Dez pontos, obrigar quem deu as cartas, ir sozinho. O jogo como se joga em todo salão de bombeiros e mesa de cozinha.',
      facts: ['jogo até 10', 'obrigar o dealer', '~20 min'],
    },
    'quick-cut': {
      name: 'Corte rápido',
      tagline: 'Primeiro a cinco',
      description:
        'As mesmas regras, corrida mais curta — cinco pontos e acabou. Perfeito enquanto a chaleira ainda está esquentando.',
      facts: ['jogo até 5', '~10 min'],
    },
    'long-game': {
      name: 'Partida longa',
      tagline: 'Acomode-se',
      description: 'Quinze pontos para uma noite inteira de jogo. Rancores são bem-vindos.',
      facts: ['jogo até 15', '~30 min'],
    },
    'old-school': {
      name: 'Antigamente',
      tagline: 'Quem deu pode passar',
      description:
        'Sem obrigar quem deu as cartas — todo mundo pode passar e a distribuição segue adiante. Do jeito que alguns avôs fazem questão de jogar.',
      facts: ['jogo até 10', 'sem obrigação', '~20 min'],
    },
  },
  fields: {
    targetScore: {
      label: 'Partida até',
      help: 'A primeira dupla a chegar nesta pontuação vence a partida.',
      group: 'Partida',
      options: {
        '5': '5 — corte rápido',
        '10': '10 — padrão',
        '15': '15 — partida longa',
      },
    },
    stickDealer: {
      label: 'Obrigar quem deu as cartas',
      help: 'Na segunda rodada de apostas, quem deu as cartas é obrigado a escolher um naipe quando todos os outros passam.',
      group: 'Apostas',
    },
    goingAlone: {
      label: 'Permitir ir sozinho',
      help: 'Quem pedir com uma mão monstruosa pode mandar o parceiro para o banco naquela mão.',
      group: 'Apostas',
    },
  },
  presets: {
    classic: 'Boteco clássico',
    'quick-cut': 'Corte rápido',
    'long-game': 'Partida longa',
    'old-school': 'Antigamente',
  },
};
