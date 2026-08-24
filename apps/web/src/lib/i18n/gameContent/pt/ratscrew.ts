import type { GameCopy } from '../types';

/** Brazilian Portuguese copy for ratscrew. Untranslated fields fall back to the pack's English. */
export const ratscrewPt: GameCopy = {
  name: 'Rouba Monte',
  subtitle: 'o jogo do tapa',
  tagline: 'Bata na pilha primeiro',
  description:
    'Vire cartas numa pilha comum e bata em dobras, sanduíches e mais antes de todo mundo. Reflexos em tempo real, desafios de figuras, tapas errados que queimam cartas.',
  facts: ['2–4 jogadores', 'tapas em tempo real', 'solo ou com amigos'],
  howToPlay: {
    summary: 'Alterne virando cartas numa pilha comum e BATA até ganhar todas as cartas da mesa.',
    objective:
      'Ganhe as 52 cartas. Você aumenta seu monte batendo nos padrões primeiro ou baixando figuras que os adversários não conseguem responder. Quando todos os outros ficam sem cartas — ou voltam ao jogo com um tapa — você vence a partida.',
    sections: [
      {
        heading: 'A virada',
        body: [
          'Começando por você, os jogadores alternam colocando a carta do topo do próprio monte virado para baixo na pilha central, virando-a para o lado oposto a si para ninguém espiar.',
          'Se o seu monte secar, você para de virar — mas com a opção de voltar com um tapa ligada, um tapa de sorte coloca você de volta no jogo.',
        ],
      },
      {
        heading: 'Figuras e desafios',
        body: ['Uma figura abre um desafio contra o próximo jogador na ordem do turno:'],
        bullets: [
          { label: 'Valete', text: 'ele tem 1 chance de virar outra figura' },
          { label: 'Dama', text: '2 chances' },
          { label: 'Rei', text: '3 chances' },
          { label: 'Ás', text: '4 chances' },
        ],
      },
      {
        heading: 'Resolvendo um desafio',
        body: [
          'Cada carta que não é figura que o desafiado vira queima uma das chances dele.',
          'Virou uma figura nova? O desafio roda a mesa com chances novas para o próximo jogador.',
          'Acabaram as chances? Quem baixou a figura recolhe a pilha central inteira para baixo do seu monte e puxa a próxima virada.',
        ],
      },
      {
        heading: 'Tapas',
        body: [
          'No instante em que um padrão de tapa cai na pilha, TODO MUNDO corre para bater. O primeiro tapa válido ganha a pilha central inteira e puxa a próxima.',
          'Uma breve janela de tapa abre sempre que um padrão está valendo — esmague o botão de TAPA antes que ela feche!',
        ],
        bullets: [
          { label: 'Dobra', text: 'duas cartas do mesmo valor em sequência (7♦ 7♣)' },
          { label: 'Sanduíche', text: 'mesmo valor com uma carta no meio (7♦ Q♠ 7♥)' },
          {
            label: 'Casamento',
            text: 'um Rei e uma Dama em sequência, em qualquer ordem (K♦ Q♠) — opção da casa',
          },
          {
            label: 'Dez',
            text: 'duas cartas de número seguidas somando dez (3♦ 7♠) — opção da casa',
          },
          {
            label: 'Topo-fundo',
            text: 'a carta do topo é igual à carta bem do fundo da pilha — opção da casa',
          },
          {
            label: 'Sequência',
            text: 'três valores seguidos subindo ou descendo (4-5-6 ou 9-8-7) — opção da casa',
          },
        ],
      },
      {
        heading: 'Tapas errados',
        body: [
          'Bater quando nenhum padrão está valendo custa caro: com a queima por tapa errado ligada, a carta do topo do seu monte desliza para baixo da pilha como penalidade. Nervosismo sai caro — olho nas cartas, não na plateia.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: ['Ajuste o caos nas configurações da sala antes de começar:'],
        bullets: [
          {
            label: 'Dobras / Sanduíches',
            text: 'os padrões clássicos de tapa, ambos ligados por padrão',
          },
          {
            label: 'Casamento / Dez / Topo-fundo / Sequências',
            text: 'padrões extras, todos desligados por padrão para uma mesa clássica',
          },
          {
            label: 'Tapa errado queima uma carta',
            text: 'ligado por padrão; desligue e só padrões valendo poderão ser batidos',
          },
          {
            label: 'Voltar com um tapa',
            text: 'jogadores sem cartas ainda podem bater num padrão valendo para ganhar a pilha e voltar ao jogo',
          },
          {
            label: 'Janela de tapa',
            text: 'quanto tempo a corrida fica aberta — mais curta, mais cruel',
          },
        ],
      },
      {
        heading: 'Boas maneiras na mesa',
        body: [
          'Quem ganha a pilha desliza ela para baixo do próprio monte sem embaralhar e vira a próxima. O último jogador segurando todas as cartas vence a partida.',
          'Um curto momento de tolerância mantém os tapas de longa distância honestos: a mesa espera um instante além da janela antes de dar a corrida por encerrada.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Tapa Clássico',
      tagline: 'Dobras e sanduíches',
      description:
        'O padrão do boteco: vire rápido, fique de olho em dobras e sanduíches e bata antes da janela fechar.',
      facts: ['janela de 1,2 s', 'tapa errado queima', '~8 min'],
    },
    'quick-reflex': {
      name: 'Reflexo Rápido',
      tagline: 'Janelas cruéis',
      description:
        'Os mesmos padrões clássicos no gatilho — a janela de tapa fecha em 0,7 segundos.',
      facts: ['janela de 0,7 s', 'para olhos afiados', '~6 min'],
    },
    slaphappy: {
      name: 'Tapa Maluco',
      tagline: 'Todos os padrões valendo',
      description:
        'Casamentos, dez, topo-fundo e sequências contam além dos clássicos. Caos, bem iluminado, extremamente barulhento.',
      facts: ['todos os padrões', 'janela de 0,8 s', '~5 min'],
    },
  },
  fields: {
    doubles: {
      label: 'Dobras',
    },
    sandwiches: {
      label: 'Sanduíches',
    },
    marriage: {
      label: 'Casamento (K+Q)',
    },
    tens: {
      label: 'Cartas que somam dez',
    },
    topBottom: {
      label: 'Topo-fundo',
    },
    runs: {
      label: 'Sequências',
    },
    misSlapBurn: {
      label: 'Tapa errado queima uma carta',
    },
    slapBackIn: {
      label: 'Voltar com um tapa quando sem cartas',
    },
    slapWindowMs: {
      label: 'Janela de tapa',
    },
  },
  presets: {
    classic: 'Tapa Clássico',
    'quick-reflex': 'Reflexo Rápido',
    slaphappy: 'Tapa Maluco',
  },
};
