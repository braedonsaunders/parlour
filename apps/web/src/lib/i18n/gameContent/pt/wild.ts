import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for wild. Untranslated fields fall back to the pack's English. */
export const wildPt: GameCopy = {
  name: 'Wild',
  subtitle: 'o jogo de se livrar das cartas',
  tagline: 'Solte todas as cartas',
  description:
    'Um caos de 112 cartas com pulos, inversões, +4, despejos de cor e invasões de vez. A mesma mesa acolhedora, um baralho bem mais barulhento.',
  facts: ['2–4 jogadores', 'distribuição cronometrada', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'Um caos de 112 cartas de se livrar da mão — combine com o topo da pilha, solte cartas de ação e esvazie a mão primeiro.',
    objective:
      'Seja o primeiro jogador sem cartas na mão. As cartas de ação atrapalham todo mundo — a menos que revidem.',
    sections: [
      {
        heading: 'Jogando uma carta',
        body: [
          'Na sua vez, jogue uma carta que combine com o topo da pilha pela cor ou pela face, ou compre uma carta.',
          'Curingas podem ser jogados a qualquer momento e deixam você escolher a próxima cor.',
        ],
      },
      {
        heading: 'Cartas de ação',
        bullets: [
          { label: 'Pular', text: 'o próximo jogador perde a vez — e não pode invadir de volta' },
          {
            label: 'Inverter',
            text: 'o jogo muda de direção; um contra um, dá a você outra vez',
          },
          { label: 'Compre Duas', text: 'o próximo jogador pega duas cartas e perde a vez' },
          {
            label: 'Despejar Tudo',
            text: 'descarte todas as cartas da sua mão com a cor dela, embaixo dela; cartas de ação varridas não disparam',
          },
          { label: 'Curinga', text: 'jogue a qualquer momento e escolha a próxima cor' },
          {
            label: 'Curinga Compre Quatro',
            text: 'escolha a cor E entregue quatro cartas ao próximo jogador',
          },
          {
            label: 'Curinga Trocar Mãos',
            text: 'escolha a cor e troque de mão com qualquer jogador (carta opcional)',
          },
          {
            label: 'Curinga Embaralhar Mãos',
            text: 'junte todas as mãos, embaralhe e redistribua (carta opcional)',
          },
        ],
      },
      {
        heading: 'Última carta',
        body: [
          'Ficou com duas cartas? Aperte "Última carta!" antes de jogar. Chegue a uma carta sem avisar e você é pego — compre duas.',
          'Comprar coloca você de volta acima da linha, então o aviso precisa ser feito de novo.',
        ],
      },
      {
        heading: 'Os relógios',
        body: [
          'Toda vez é cronometrada. Se o relógio zerar, a mesa faz uma jogada válida por aquele jogador para a pilha não parar.',
          'A distribuição também tem um relógio de partida. No último minuto, as posições ao vivo do primeiro ao quarto aparecem e se atualizam conforme as mãos mudam.',
        ],
        bullets: [
          {
            label: 'No zero da partida',
            text: 'vence quem tiver menos cartas; mãos do mesmo tamanho são decididas pela ordem dos lugares, para todo replay ter um resultado claro',
          },
          {
            label: 'Opções avançadas',
            text: 'defina os segundos por vez e os minutos totais da partida antes da distribuição',
          },
        ],
      },
      {
        heading: 'Caos da casa',
        body: ['Todas as configurações da mesa ficam nas opções avançadas, antes da distribuição:'],
        bullets: [
          {
            label: 'Acumular',
            text: 'responda um Compre Duas / Compre Quatro com a mesma carta e a penalidade se empilha para a próxima vítima',
          },
          {
            label: 'Invadir',
            text: 'tem a face exata da carta que acabou de ser jogada? Jogue-a fora de vez antes que alguém reaja',
          },
          {
            label: 'Comprar até poder jogar',
            text: 'continue comprando até algo combinar, em vez de comprar uma só',
          },
          {
            label: 'Jogada forçada',
            text: 'uma carta comprada que pode ser jogada deve ser jogada',
          },
          {
            label: 'Desafiar o Compre Quatro',
            text: 'um Compre Quatro só é honesto sem nada da cor anterior — desmascare o blefe e ele fica com a pilha; erre e você pega mais duas',
          },
          {
            label: 'Setes e zeros',
            text: 'um 7 troca a sua mão com a de um jogador que você escolher; um 0 passa todas as mãos um lugar adiante',
          },
          {
            label: 'Curingas de troca',
            text: 'coloca o Curinga Trocar Mãos e o Curinga Embaralhar Mãos no baralho',
          },
        ],
      },
      {
        heading: 'Vencendo',
        body: [
          'Esvazie a mão para vencer antes do relógio da partida zerar. Senão, a mão mais leve que restar vence no zero.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'À risca',
      description:
        'Combine a cor ou o número, depois despeje uma cor inteira de uma vez. Sem acumular, sem invadir — um caos educado.',
      facts: ['uma distribuição', 'sem acumular', '~5 min'],
    },
    party: {
      name: 'Festa',
      tagline: 'Empilhe e bata',
      description:
        'Compre Duas e Compre Quatro se acumulam, e uma combinação exata deixa qualquer um invadir fora de vez. Caos, com luz quentinha.',
      facts: ['acumular ligado', 'invasões ligadas', '~5 min'],
    },
    houseRules: {
      name: 'Regras da Casa',
      tagline: 'Tudo ligado',
      description:
        'Setes trocam mãos, zeros passam tudo adiante, curingas de troca entram no baralho, e a carta que você comprou tem que ser jogada.',
      facts: ['trocas de 7 e 0', 'curingas de troca', 'jogada forçada'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartas distribuídas',
      group: 'A distribuição',
      help: 'Com quantas cartas cada lugar começa.',
    },
    turnTimeSeconds: {
      label: 'Segundos por vez',
      group: 'Tempo',
      help: 'Quando o relógio zera, a mesa faz uma jogada válida por aquele lugar.',
    },
    matchTimeMinutes: {
      label: 'Minutos de partida',
      group: 'Tempo',
      help: 'No zero, vence o jogador com a mão mais leve que restar.',
    },
    stackDrawTwo: {
      label: 'Acumular Compre Duas',
      group: 'Penalidades',
      help: 'Responda um Compre Duas com o seu e passe a pilha crescente adiante.',
    },
    stackDrawFour: {
      label: 'Acumular Compre Quatro',
      group: 'Penalidades',
      help: 'O mesmo para o Compre Quatro. As penalidades podem subir rápido.',
    },
    jumpIn: {
      label: 'Invadir',
      group: 'Regras da casa',
      help: 'Tem a carta exata que acabou de ser jogada? Jogue-a fora de vez.',
    },
    drawToMatch: {
      label: 'Comprar até poder jogar',
      group: 'Regras da casa',
      help: 'Continue comprando até algo combinar, em vez de comprar uma carta só.',
    },
    forcePlay: {
      label: 'Jogada forçada',
      group: 'Regras da casa',
      help: 'Uma carta comprada que pode ser jogada deve ser jogada.',
    },
    sevenZero: {
      label: 'Setes e zeros',
      group: 'Regras da casa',
      help: 'Jogue um 7 para trocar de mão com alguém; jogue um 0 para passar todas as mãos adiante.',
    },
    challengeDrawFour: {
      label: 'Desafiar o Compre Quatro',
      group: 'Regras da casa',
      help: 'Um Compre Quatro só é honesto sem nada da cor em jogo. Desmascare o blefe: acerte e ele fica com as cartas, erre e você pega mais duas.',
    },
    swapCards: {
      label: 'Curingas de troca',
      group: 'O baralho',
      help: 'Coloca o Curinga Trocar Mãos e o Curinga Embaralhar Mãos no baralho.',
    },
  },
  presets: {
    classic: 'Wild Clássico',
    party: 'Pilha de Festa',
    houseRules: 'Regras da Casa',
  },
};
