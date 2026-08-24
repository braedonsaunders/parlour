import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for spite. Untranslated fields fall back to the pack's English. */
export const spitePt: GameCopy = {
  name: 'Spite & Malice',
  subtitle: 'a corrida da pilha de pagamento',
  tagline: 'Devolva na mesma moeda',
  description:
    'Monte as pilhas centrais do ás à dama, esvazie a sua pilha de pagamento e arruine os planos dos outros com curingas na hora certa. O nome já diz as regras.',
  facts: ['2–4 jogadores', 'clássico · rápido · impiedoso', 'sozinho ou com amigos'],
  howToPlay: {
    summary:
      'Spite & Malice — monte as pilhas centrais do ás à dama e esvazie a sua pilha de pagamento antes de todo mundo.',
    objective:
      'Seja o primeiro jogador a esvaziar a pilha de pagamento. Cada carta que você enterra nela é uma carta que os outros adoram comemorar.',
    sections: [
      {
        heading: 'A mesa',
        body: ['Quatro tipos de carta, quatro lugares para colocá-las:'],
        bullets: [
          {
            label: 'Pilha de pagamento',
            text: 'sua pilha de objetivo, virada para baixo; a carta do topo fica virada para cima',
          },
          {
            label: 'Mão',
            text: 'cinco cartas, repostas até cinco no começo do seu turno',
          },
          {
            label: 'Pilhas de descarte',
            text: 'quatro pilhas suas — encerrar o turno significa descartar em uma delas',
          },
          {
            label: 'Pilhas centrais',
            text: 'até quatro sequências compartilhadas em que todo mundo joga',
          },
        ],
      },
      {
        heading: 'Seu turno',
        body: [
          'Primeiro, compre até voltar a ter cinco cartas. Depois faça quantas jogadas quiser, na ordem que preferir:',
          'jogue em uma pilha central, jogue o topo da sua pilha de pagamento ou jogue o topo de uma das suas pilhas de descarte.',
          'Seu turno só termina quando você descarta uma carta da mão em uma das suas pilhas de descarte.',
        ],
      },
      {
        heading: 'Montando as pilhas',
        body: [
          'Uma pilha central começa com um ás e sobe valor por valor até a dama. O naipe nunca importa.',
          'Complete uma pilha até a dama e ela inteira volta para o monte de compra — a pilha recomeça vazia, esperando um ás ou um curinga.',
        ],
      },
      {
        heading: 'Curingas',
        bullets: [
          {
            label: 'Reis',
            text: 'curingas — jogue-os como qualquer valor que precisar, e esse valor fica valendo para a pilha',
          },
          {
            label: 'Curingas',
            text: 'funcionam exatamente igual quando a mesa os inclui na distribuição',
          },
          {
            label: 'Valores lembrados',
            text: 'um curinga valendo 6 faz a próxima carta ser um 7, jogue quem jogar',
          },
        ],
      },
      {
        heading: 'A pilha de pagamento',
        body: [
          'Jogar o topo da sua pilha de pagamento vira a próxima carta na hora — e se era a última, você ganha ali mesmo, no meio do turno, sem precisar descartar.',
          'Travado, sem nada para jogar? Descarte com intenção: o que você guarda agora é uma jogada que pode destravar depois.',
        ],
      },
      {
        heading: 'Quando o monte seca',
        body: [
          'As pilhas completas voltam direto para o monte, então as cartas continuam circulando.',
          'Se o monte secar no começo do seu turno, todas as pilhas centrais pela metade também voltam — a sequência zera no ás e as cartas enterradas saem da cova.',
          'Se mesmo assim a mesa travar de vez, a pilha de pagamento mais perto de esvaziar leva a partida, em vez de alguém enrolar para sempre.',
        ],
      },
      {
        heading: 'Jeitos de jogar',
        bullets: [
          { label: 'Clássico', text: 'a corrida completa com pilha de 20 cartas — traga lanche' },
          { label: 'Rápido', text: 'pilha de 10 cartas para uma desforra ligeira' },
          {
            label: 'Impiedoso',
            text: 'pilha de 13 cartas e sem reposição no meio do turno: esvazie a mão cedo demais e jogue com menos cartas',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'A corrida completa',
      description:
        'Vinte cartas enterradas em cada pilha de pagamento e todos os curingas do baralho. O jogo como foi feito para ser saboreado devagar.',
      facts: ['pagamento de 20 cartas', 'reis e curingas livres', '~15 min'],
    },
    quick: {
      name: 'Rápido',
      tagline: 'Ressentimento mais curto',
      description:
        'Pilhas de pagamento com dez cartas mantêm todo o resto igual — mesmos curingas, mesma malícia, metade da espera pela sua vingança.',
      facts: ['pagamento de 10 cartas', 'todos os curingas', '~5–8 min'],
    },
    cutthroat: {
      name: 'Impiedoso',
      tagline: 'Sem piedade, sem reposição',
      description:
        'Treze cartas de profundidade e sem reposição no meio do turno: esvazie a mão na hora errada e jogue com menos cartas enquanto outra pessoa ganha.',
      facts: ['pagamento de 13 cartas', 'sem reposição no turno', 'brutal'],
    },
  },
  fields: {
    payoffSize: {
      label: 'Pilha de pagamento',
      help: 'Cartas enterradas em cada pilha de pagamento. Esvazie a sua para vencer — números menores fazem partidas mais curtas.',
      group: 'A distribuição',
    },
    handSize: {
      label: 'Cartas distribuídas',
      help: 'Tamanho da mão, reposta até o limite no começo de cada turno.',
      group: 'A distribuição',
    },
    discardPiles: {
      label: 'Pilhas de descarte',
      help: 'Pilhas em frente a cada jogador. Encerrar um turno significa descartar em uma delas.',
      group: 'A distribuição',
    },
    kingsWild: {
      label: 'Reis são curingas',
      help: 'Um rei vale qualquer valor que você disser. Desligado, os reis nem entram no baralho.',
      group: 'Curingas',
    },
    jokersWild: {
      label: 'Curingas entram',
      help: 'Os curingas funcionam exatamente como os reis. Desligado, nenhum entra no baralho.',
      group: 'Curingas',
    },
    buildPiles: {
      label: 'Pilhas centrais',
      help: 'Sequências compartilhadas em que todo mundo joga. Menos pilhas significam mais espera pelo ás dos outros.',
      group: 'O centro',
    },
    refillMidTurn: {
      label: 'Reposição no turno',
      help: 'Esvazie a mão e ela volta a cinco cartas para você continuar jogando. Desligado é impiedoso.',
      group: 'Regras da casa',
    },
  },
  presets: {
    classic: 'Clássico',
    quick: 'Rápido',
    cutthroat: 'Impiedoso',
  },
};
