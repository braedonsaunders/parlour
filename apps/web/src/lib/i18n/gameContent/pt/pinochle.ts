import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for pinochle. Untranslated fields fall back to the pack's English. */
export const pinochlePt: GameCopy = {
  name: 'Pinochle',
  subtitle: 'o jogo de duplas',
  tagline: 'Dê o lance, declare e leve as vazas',
  description:
    'Sente-se de frente para o seu parceiro, vença o leilão, escolha o trunfo e declare sua combinação. Ases, dez e reis são as cartas que valem — cumpra seu lance ou fique devendo.',
  facts: ['4 jogadores · 2v2', 'lance · declaração · vazas', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'O clássico americano de duplas — dê o lance, escolha o trunfo, declare e jogue as vazas.',
    objective:
      'Sentado de frente para o seu parceiro, vença o leilão e cumpra seu lance — declaração mais pontos de vazas pelo menos iguais ao que você pediu. O primeiro time a chegar na pontuação alvo depois de uma mão completa vence a partida.',
    sections: [
      {
        heading: 'A mesa',
        body: [
          'Quatro jogadores, dois times: você e o jogador à sua frente são parceiros. Cada mão distribui o baralho duplo completo de 48 cartas — doze para cada um, sem morto. A distribuição gira para a esquerda a cada mão.',
        ],
      },
      {
        heading: 'O leilão',
        body: [
          'Começando à esquerda de quem deu as cartas, cada lugar passa ou dá um lance maior que o anterior. Depois que você passa, está fora da mão. O último lugar que ainda tem um lance vence o leilão e escolhe o trunfo. Se todos passarem sem nenhum lance, a mão é descartada e redistribuída pelo mesmo dealer.',
        ],
        bullets: [
          {
            label: 'Lance de abertura',
            text: 'precisa superar o mínimo da mesa (25 no modo Clássico)',
          },
          { label: 'Aumentos', text: 'qualquer número inteiro maior, até um teto de 60' },
        ],
      },
      {
        heading: 'A declaração',
        body: [
          'Depois que o trunfo é escolhido, cada lugar declara sua combinação para marcar pontos. As cartas ficam na mão — declarar é pontuar, não descartar — e a mesa calcula tudo para você, então ninguém pode declarar errado.',
        ],
        bullets: [
          { label: 'Sequência de trunfo', text: 'Ás-10-rei-dama-valete de trunfo, 15 pontos' },
          {
            label: 'Casamento',
            text: 'rei + dama do mesmo naipe — 4 se for trunfo (mais 2 se for um segundo par além da sequência), 2 se não for',
          },
          {
            label: 'Pinochle',
            text: 'dama de espadas + valete de ouros vale 4; ter as duas cópias de cada uma é um pinochle duplo, que vale 30',
          },
          {
            label: 'Rodadas',
            text: 'uma carta do mesmo valor nos quatro naipes — ases 10, reis 8, damas 6, valetes 4',
          },
          { label: 'Dix', text: 'cada 9 de trunfo que você tiver vale 1' },
        ],
      },
      {
        heading: 'Jogando as vazas',
        body: [
          'Quem venceu o leilão puxa a primeira vaza. Você precisa acompanhar o naipe se puder; o trunfo vence um naipe puxado que não seja trunfo, e do contrário a carta mais alta vence. Ás, dez e rei valem 10 pontos cada um quando capturados em uma vaza; a última vaza vale mais 10. Quem vence uma vaza puxa a próxima.',
        ],
      },
      {
        heading: 'Pontuando uma mão',
        body: [
          'Some a declaração do time que arrematou aos pontos de vaza que ele fez. Se cumprir o lance, ele marca o total inteiro. Se ficar devendo, ele quebra — perde exatamente o valor do lance, declaração incluída. O outro time sempre marca seus próprios pontos de vaza, e também sua declaração, a menos que a mesa tenha desativado isso.',
        ],
      },
      {
        heading: 'A partida',
        body: [
          'As mãos se acumulam até um time chegar ao alvo (100 / 150 / 500). Se os dois times ultrapassarem na mesma mão, o time que arrematou vence a partida direto, a menos que tenha quebrado — nesse caso, ele perde o desempate para a pontuação mais alta, e quem arrematou vence qualquer empate restante.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: [
          'As configurações da sala mudam a pontuação alvo, o lance mínimo de abertura, e se os adversários marcam a própria declaração. As mesas Clássicas mantêm os valores padrão.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'Partida até 150',
      description:
        'Pinochle de duplas até 150, lance mínimo de abertura 25. O jogo como se joga em toda mesa de cozinha.',
      facts: ['partida até 150', 'lance mín. 25', '~30 min'],
    },
    quick: {
      name: 'Rápido',
      tagline: 'Primeiro a 100',
      description:
        'As mesmas regras, corrida mais curta — 100 pontos, lance de abertura menor, acaba mais rápido.',
      facts: ['partida até 100', 'lance mín. 20', '~15 min'],
    },
    marathon: {
      name: 'Maratona',
      tagline: 'Partida até 500',
      description: 'Uma longa batalha de duplas até 500 — cada declaração e cada quebra importam.',
      facts: ['partida até 500', 'lance mín. 25', '~90 min'],
    },
  },
  fields: {
    target: {
      label: 'Partida até',
      group: 'Partida',
      help: 'Depois de cada mão, a primeira dupla a chegar ou passar dessa pontuação vence.',
      options: {
        '100': '100 — rápido',
        '150': '150 — clássico',
        '500': '500 — maratona',
      },
    },
    minBid: {
      label: 'Lance mínimo',
      group: 'Leilão',
      help: 'O lance de abertura do leilão precisa superar esse mínimo. Cada lance seguinte precisa superar o anterior, até 60.',
    },
    opponentsScoreMeld: {
      label: 'Adversários marcam declaração',
      group: 'Pontuação',
      help: 'Quando desligado, o time que não arrematou só marca os pontos de vaza que fizer — não sua declaração.',
    },
  },
  presets: {
    classic: 'Clássico',
    quick: 'Rápido',
    marathon: 'Maratona',
  },
};
