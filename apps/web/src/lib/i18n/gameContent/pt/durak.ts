import type { GameCopy } from '../types';

/** Portuguese copy for durak. Untranslated fields fall back to the pack's English. */
export const durakPt: GameCopy = {
  name: 'Durak',
  subtitle: 'o bobo que ninguém quer ser',
  tagline: 'Nunca seja o último com cartas na mão',
  description:
    'Um baralho curto, um naipe de trunfo e uma mesa de ataques e defesas. Vença cada carta ' +
    'lançada contra você ou recolha tudo — o último assento ainda com cartas veste o gorro de ' +
    'bobo.',
  facts: ['2–6 jogadores', 'baralho de 36 cartas', 'sozinho ou com amigos'],
  howToPlay: {
    summary:
      'Um baralho curto, um naipe de trunfo e uma única missão: nunca ser o último assento ainda ' +
      'com cartas na mão.',
    objective:
      'Esvazie sua mão e fique fora para sempre. Assim que o monte acabar, o último assento ainda ' +
      'com cartas é o Durak.',
    sections: [
      {
        heading: 'A distribuição',
        body: [
          'Cada assento recebe seis cartas de um baralho de 36: do seis ao ás, quatro naipes, sem ' +
            'dois, três, quatro nem cinco.',
          'A próxima carta do monte é virada: seu naipe é o trunfo de toda a mão, e fica virada ' +
            'para cima até o monte acabar.',
          'Quem tiver o trunfo mais baixo ataca primeiro. Ninguém tem um? O assento um abre.',
        ],
      },
      {
        heading: 'Atacar e defender',
        body: [
          'O atacante joga uma carta. O defensor deve vencê-la: uma carta mais alta do mesmo naipe, ' +
            'ou qualquer trunfo se o ataque não era de trunfo.',
          'Outros assentos podem lançar mais cartas, desde que o valor já tenha aparecido na mesa — ' +
            'vencida ou não, esse valor continua válido até o fim da rodada.',
          'Vença todas as cartas e a mesa inteira é retirada, fora do jogo para sempre — você ataca ' +
            'em seguida.',
          'Não consegue vencer uma? Recolha toda a mesa para sua mão. O jogo passa para o assento ' +
            'seguinte ao seu.',
        ],
        bullets: [
          {
            label: 'Limite de ataque',
            text: 'um defensor nunca vê mais cartas do que tinha quando a rodada começou',
          },
          {
            label: 'Reposição',
            text: 'depois de cada rodada, as mãos voltam a seis — primeiro o atacante, depois os demais, o defensor por último',
          },
        ],
      },
      {
        heading: 'Perevodnoy (repasse)',
        body: [
          'Quando essa regra da casa está ativa, um defensor que ainda não venceu nada pode ' +
            'repassar em vez de defender: joga uma carta do mesmo valor, e o próximo assento herda ' +
            'todo o ataque.',
        ],
      },
      {
        heading: 'O fim da mão',
        body: [
          'Assim que o monte acabar, esvaziar sua mão tira você do jogo para sempre — em ' +
            'definitivo, na ordem em que acontecer.',
          'O último assento ainda com cartas é o Durak. Todos os outros são classificados pela ' +
            'ordem em que saíram.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'Podkidnoy — o jogo tradicional de lançar cartas',
      description:
        'Ataque, defenda e lance qualquer carta cujo valor já esteja na mesa. Sem repasses — ' +
        'vença a carta ou recolha a mesa.',
      facts: ['lançar cartas ativo', 'sem repasse', 'mãos de 6 cartas'],
    },
    transfer: {
      name: 'Perevodnoy',
      tagline: 'Repasse o ataque inteiro',
      description:
        'Tudo do modo Clássico, mais uma saída: um defensor que ainda não venceu nada pode ' +
        'repassar um valor igual direto para o próximo assento.',
      facts: ['repasses ativos', 'lançar cartas ativo', 'mãos de 6 cartas'],
    },
    'heads-up': {
      name: 'Um contra um',
      tagline: 'Frente a frente, final rápido',
      description:
        'Feito para dois. A primeira mão a esvaziar vence na hora, com ou sem monte — sem esperar ' +
        'o baralho acabar.',
      facts: ['2 jogadores', 'vitória instantânea', 'rápido'],
    },
  },
  fields: {
    transfer: {
      label: 'Repasse (perevodnoy)',
      help: 'Um defensor com um valor igual pode repassar todo o ataque para o próximo assento em vez de vencê-lo.',
      group: 'A rodada',
    },
    throwIns: {
      label: 'Lançar cartas (podkidnoy)',
      help: 'Qualquer assento atacante pode lançar mais cartas cujo valor já esteja na mesa.',
      group: 'A rodada',
    },
    maxAttacks: {
      label: 'Limite de ataque',
      help: 'O máximo de cartas de ataque que um defensor pode ver em uma rodada.',
      group: 'A rodada',
    },
    refillTo: {
      label: 'Tamanho da mão',
      help: 'Cartas distribuídas no início, e o tamanho ao qual cada mão volta depois de uma rodada.',
      group: 'A distribuição',
    },
    instantWin: {
      label: 'Vitória instantânea',
      help: 'A primeira mão a esvaziar vence na hora, mesmo que o monte ainda tenha cartas.',
      group: 'Regras da casa',
    },
  },
  presets: {
    classic: 'Durak clássico',
    transfer: 'Perevodnoy',
    'heads-up': 'Um contra um',
  },
};
