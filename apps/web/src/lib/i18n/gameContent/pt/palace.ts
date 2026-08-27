import type { GameCopy } from '../types';

/** Portuguese copy for palace. Untranslated fields fall back to the pack's English. */
export const palacePt: GameCopy = {
  name: 'Palace',
  subtitle: 'o jogo de esvaziar camadas',
  tagline: 'Esvazie a mesa, camada por camada',
  description:
    'Mão, depois viradas para cima, depois viradas para baixo — queime os dez, desvie dos dois e ' +
    'seja o primeiro a esvaziar cada camada. Também conhecido como Shithead ou Karma.',
  facts: ['2–6 jogadores', 'doses, dez e oitos', 'sozinho ou com amigos'],
  howToPlay: {
    summary:
      'Livre-se de tudo o que tiver — mão, depois fileira virada para cima, depois fileira virada ' +
      'para baixo — antes que outro alguém esvazie a mesa.',
    objective:
      'Esvazie sua mão, sua fileira virada para cima e sua fileira virada para baixo primeiro para ' +
      'vencer a rodada. Rodadas vencidas se acumulam na partida; o primeiro a atingir a meta leva a partida.',
    sections: [
      {
        heading: 'A distribuição',
        body: [
          'Cada jogador recebe três cartas viradas para baixo, três cartas viradas para cima sobre ' +
            'elas, e três cartas na mão.',
          'Antes de começar, troque quantas cartas da mão quiser pelas suas próprias cartas viradas ' +
            'para cima — você tem uma troca só, depois se declara pronto.',
        ],
      },
      {
        heading: 'Jogando na pilha',
        body: [
          'Na sua vez, jogue uma ou mais cartas do mesmo valor que igualem ou superem o valor da ' +
            'pilha, ou recolha a pilha inteira para a mão.',
          'Você deve esvaziar sua mão antes de tocar na fileira virada para cima, e esvaziar essa ' +
            'fileira antes de tocar na fileira virada para baixo.',
        ],
        bullets: [
          {
            label: 'Abrindo a rodada',
            text: 'quem tiver a carta comum mais baixa começa — três primeiro, depois subindo',
          },
          {
            label: 'Recolha quando quiser',
            text: 'você pode pegar a pilha mesmo tendo uma jogada legal — às vezes é a escolha mais segura',
          },
          {
            label: 'Jogadas viradas para baixo',
            text:
              'com a mão e a fileira virada para cima vazias, vire uma carta às cegas — se ela superar ' +
              'a pilha, fica em jogo e você continua; se não, você recolhe a pilha e a carta',
          },
        ],
      },
      {
        heading: 'Cartas especiais',
        body: ['Quatro valores mudam as regras — todos ativos por padrão, todos ajustáveis:'],
        bullets: [
          {
            label: '2 — reinicia',
            text: 'joga-se sobre qualquer coisa; o piso da pilha cai quase a nada',
          },
          {
            label: '10 — queima',
            text: 'joga-se sobre qualquer coisa; a pilha sai do jogo e você joga de novo',
          },
          {
            label: '8 — invisível',
            text: 'sempre jogável, e nunca muda o que a pilha pede — o próximo responde ao que está por baixo',
          },
          {
            label: 'Quadra',
            text: 'quatro cartas do mesmo valor no topo da pilha a queimam, não importa como chegaram lá — você joga de novo',
          },
        ],
      },
      {
        heading: 'Vencendo a rodada',
        body: [
          'No momento em que um jogador esvazia mão, fileira virada para cima e fileira virada para ' +
            'baixo juntas, a rodada termina imediatamente.',
          'Todos os demais são classificados por quantas cartas ainda têm — menos é melhor — com as ' +
            'cartas viradas para baixo restantes como desempate.',
        ],
      },
      {
        heading: 'Regras da casa',
        body: ['Ajuste a mesa nas configurações da sala antes de começar:'],
        bullets: [
          {
            label: 'Troca antes de jogar',
            text: 'desative para ir direto da distribuição para a primeira jogada',
          },
          {
            label: 'O 2 reinicia / o 10 queima / o 8 sempre pode ser jogado',
            text: 'desative qualquer especial para tornar aquele valor comum',
          },
          {
            label: 'Quadra queima',
            text: 'desative para deixar uma pilha de valores iguais simplesmente crescer',
          },
          {
            label: 'Primeiro a (rodadas vencidas)',
            text: 'quantas rodadas são precisas para vencer a partida — 1 para uma mão rápida, até 7 para uma noite longa',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clássico',
      tagline: 'A subida completa por camadas',
      description:
        'Troque, depois esvazie mão, viradas para cima e viradas para baixo. O primeiro a três ' +
        'rodadas vencidas leva a mesa.',
      facts: ['até 3 rodadas', 'troca ativada', 'todos os especiais'],
    },
    quick: {
      name: 'Rápido',
      tagline: 'Uma rodada e pronto',
      description:
        'Uma única rodada decide tudo — os mesmos especiais, sem partida longa para acumular.',
      facts: ['até 1 rodada', '~10 min', 'ótimo para aquecer'],
    },
    chaos: {
      name: 'Caos',
      tagline: 'Sem troca, sem piedade',
      description:
        'Direto da distribuição para o jogo — sem fase de troca para planejar. Todos os especiais no ' +
        'máximo: o 2 reinicia, o 10 queima, o 8 continua invisível, a quadra sempre incendeia a pilha.',
      facts: ['até 3 rodadas', 'sem fase de troca', 'espere queimadas'],
    },
  },
  fields: {
    allowSwap: {
      label: 'Troca antes de jogar',
      help: 'A fase de troca entre a distribuição e a primeira jogada.',
    },
    twosReset: {
      label: 'O 2 reinicia a pilha',
      help: 'Joga-se sobre qualquer coisa e reinicia o piso da pilha.',
    },
    tensBurn: {
      label: 'O 10 queima a pilha',
      help: 'Joga-se sobre qualquer coisa e queima a pilha; o mesmo jogador joga de novo.',
    },
    eightsBlind: {
      label: 'O 8 sempre pode ser jogado',
      help: 'Sempre uma jogada legal, e nunca muda o piso da pilha.',
    },
    fourKindBurn: {
      label: 'Quadra queima',
      help: 'Quatro cartas do mesmo valor no topo da pilha a queimam; o mesmo jogador joga de novo.',
    },
    winsTo: {
      label: 'Primeiro a (rodadas vencidas)',
      help: 'A partida termina quando um jogador acumula essa quantidade de rodadas vencidas.',
    },
  },
  presets: {
    classic: 'Palace clássico',
    quick: 'Palace rápido',
    chaos: 'Palace caótico',
  },
};
