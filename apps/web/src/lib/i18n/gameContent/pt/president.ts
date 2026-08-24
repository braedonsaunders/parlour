import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for president. Untranslated fields fall back to the pack's English. */
export const presidentPt: GameCopy = {
  name: 'Presidente',
  subtitle: 'o jogo de subir na vida',
  tagline: 'Suba até a coroa',
  description:
    'Cubra a pilha com um jogo maior, esvazie a mão primeiro e suba de Mico a Presidente. Até oito lugares, com coroas e ferroadas incluídas.',
  facts: ['4–8 jogadores', 'papéis e trocas', 'solo ou com amigos'],
  howToPlay: {
    summary:
      'O clássico jogo de subir na vida — esvazie a mão primeiro, suba a escada de Mico a Presidente e faça os rivais servirem cartas para você.',
    objective:
      'Termine cada rodada no melhor lugar que puder. O primeiro a sair é Presidente, o último é Mico. Os pontos de posição acumulam entre as rodadas; o primeiro a chegar ao total alvo vence a partida.',
    sections: [
      {
        heading: 'Jogando na pilha',
        body: [
          'Quem puxa abre a vaza com qualquer jogo — uma carta sozinha, um par, uma trinca ou uma quadra do mesmo valor.',
          'Em sentido horário, cada jogador precisa cobrir a pilha com o MESMO tamanho de jogo em um valor estritamente maior, ou passar.',
        ],
        bullets: [
          {
            label: 'Ordem dos valores',
            text: 'o 3 é o mais baixo, subindo até o A, com o 2 acima de tudo',
          },
          {
            label: 'Passar',
            text: 'passar só pula esta vez — se alguém cobrir a pilha mais adiante na vaza, você volta ao jogo (a menos que a regra da casa de passe travado esteja ligada)',
          },
          {
            label: 'Vencer a vaza',
            text: 'quando todos os outros passam, a pilha é varrida e o vencedor puxa o que quiser',
          },
          {
            label: 'O 2 limpa',
            text: 'um 2 sozinho vence a pilha na hora e mantém a puxada — regra da casa, ligada por padrão',
          },
        ],
      },
      {
        heading: 'Terminando a rodada',
        body: [
          'Ficou sem cartas? Você garante o próximo degrau da escada. O jogo continua até sobrar um único jogador com cartas na mão — o Mico.',
          'O primeiro a sair é Presidente, o segundo é Vice-Presidente, o penúltimo é Vice-Mico e o último lugar é Mico.',
        ],
      },
      {
        heading: 'Pontuação e a partida',
        body: [
          'Cada rodada guarda pontos de posição: o Presidente marca tantos pontos quantos forem os lugares, o segundo colocado um a menos, e assim por diante até um único ponto para o Mico.',
          'A partida termina no momento em que alguém alcança o alvo — vence o maior total acumulado, e empates dividem a coroa.',
        ],
      },
      {
        heading: 'A troca',
        body: [
          'Antes da próxima rodada, os lugares de baixo pagam tributo das mãos recém-distribuídas e os lugares de alto devolvem o que escolherem:',
        ],
        bullets: [
          {
            label: 'Mico → Presidente',
            text: 'as duas melhores cartas do Mico; o Presidente devolve duas quaisquer',
          },
          { label: 'Vice-Mico → Vice-Presidente', text: 'uma carta em cada direção' },
          {
            label: 'Opção desligada',
            text: 'desligue as trocas nas configurações da sala para um cada-um-por-si mais puro',
          },
        ],
      },
      {
        heading: 'Regras da casa',
        body: ['Ajuste a mesa nas configurações da sala antes de começar:'],
        bullets: [
          {
            label: 'O 2 limpa a pilha',
            text: 'ligado por padrão — desligado, o 2 é só mais uma carta imbatível',
          },
          {
            label: 'Passes travados',
            text: 'depois de passar, você fica de fora da vaza inteira (desligado por padrão: você volta quando a pilha muda)',
          },
          { label: 'Trocas', text: 'a troca de cartas por papel entre as rodadas' },
          {
            label: 'Pontos alvo',
            text: 'o tamanho da partida — 7 para uma partidinha, 11 para uma sessão, 21 para uma maratona',
          },
        ],
      },
      {
        heading: 'Etiqueta da mesa',
        body: [
          'A primeira rodada começa pelo lugar inicial; depois disso, o Presidente sentado puxa todas as rodadas.',
          'As cartas são distribuídas uma a uma até o baralho acabar, então mesas ímpares deixam alguns lugares com uma carta a menos — todo mundo no mesmo barco.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'A escada inteira',
      description:
        'Coroas, tributos e viradas — o primeiro a onze pontos leva o salão. Do jeito que se joga no boteco.',
      facts: ['primeiro a 11', 'trocas ligadas', 'o 2 limpa'],
    },
    rapid: {
      name: 'Rápida',
      tagline: 'Curta e apimentada',
      description:
        'O primeiro a sete mantém a mesa andando. As mesmas regras, menos rodadas, viradas mais barulhentas.',
      facts: ['primeiro a 7', '~10 min', 'ótimo com 6+'],
    },
    marathon: {
      name: 'Maratona',
      tagline: 'Reinados longos',
      description:
        'Vinte e um pontos de política. Micos viram presidentes, dinastias nascem e caem.',
      facts: ['primeiro a 21', 'sessão longa', 'arco completo'],
    },
  },
  fields: {
    twoClears: {
      label: 'O 2 limpa a pilha',
    },
    passLocks: {
      label: 'Passar tira você da vaza',
    },
    trading: {
      label: 'Troca de cartas por papel entre rodadas',
    },
    targetPoints: {
      label: 'Primeiro a (pontos)',
    },
  },
  presets: {
    classic: 'Salão Clássico',
    rapid: 'Gabinete Rápido',
    marathon: 'Maratona',
  },
};
