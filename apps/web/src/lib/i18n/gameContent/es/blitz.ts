import type { GameCopy } from '../types';

/** Spanish copy for blitz. Untranslated fields fall back to the pack's English. */
export const blitzEs: GameCopy = {
  name: 'Blitz',
  subtitle: 'el juego del 31',
  tagline: 'Persigue el treinta y uno',
  description:
    'Roba, cambia y toca para llegar a 31 en un mismo palo. Tres formatos de partida, bots astutos y una celebración muy ruidosa.',
  facts: ['2–4 jugadores', 'clásico · rápido · cronometrado', 'solo o con amigos'],
  howToPlay: {
    summary: 'El clásico del bar, el 31 — roba, cambia y toca para llegar a un palo que valga 31.',
    objective:
      'Ten en la mano un valor mayor que el de todos los demás cuando termine la ronda. Las manos puntúan según su mejor palo: A=11, figuras=10, las demás su valor. 31 en un mismo palo es un BLITZ y gana en el acto.',
    sections: [
      {
        heading: 'Tu turno',
        body: ['Tienes dos acciones:'],
        bullets: [
          {
            label: 'Robar',
            text: 'toma la carta de arriba del mazo, o coge la de arriba del descarte',
          },
          {
            label: 'Descartar',
            text: 'desliza una carta de tu mano boca arriba sobre la pila',
          },
        ],
      },
      {
        heading: 'Puntuar una mano',
        body: [
          'Solo cuenta tu mejor palo. Tres corazones que sumen 27 vencen a tres cartas mixtas que sumen 30.',
          'Un trío (tres del mismo valor) es una mano especial que vale 30½ (regla de casa activable).',
        ],
      },
      {
        heading: 'Tocar',
        body: [
          'En lugar de robar, puedes TOCAR para terminar la ronda. Todos los demás juegan exactamente un turno más, y luego se muestran las manos.',
          'La mano más baja pierde una vida. Si TÚ tocaste y empatas o quedas en la más baja, la penalización es tuya — toca con confianza.',
        ],
      },
      {
        heading: '¡Blitz!',
        body: [
          'Tener 31 en un mismo palo hace estallar la ronda al instante — todos los demás jugadores pierden una vida, sin mostrar manos.',
          '¿Te repartieron un Blitz antes de tu primer turno? Cuenta igual. Puedes presumir sin problema.',
        ],
      },
      {
        heading: 'Formatos de partida',
        bullets: [
          {
            label: 'Clásico',
            text: 'pierdes una vida por cada ronda perdida; gana el último jugador con vidas',
          },
          {
            label: 'Rápido',
            text: 'rondas independientes, contador a primero-a-N victorias, redistribución instantánea',
          },
          {
            label: 'Cronometrado',
            text: 'reloj de partida, temporizadores de turno obligatorios, gana quien tenga más rondas ganadas cuando suene el timbre',
          },
        ],
      },
      {
        heading: 'Reglas de casa',
        body: [
          'Cada mesa puede ajustarse en las opciones de la sala — vidas, penalizaciones por tocar, empates, trío, bloqueo de descarte y temporizadores de turno están todos ahí.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Vidas en juego',
      description:
        'Pierde una ronda, pierde una vida. Toca pronto o persigue el 31 perfecto — el último jugador con fichas gana la partida.',
      facts: ['3 vidas cada uno', 'el último en pie', '~5–10 min'],
    },
    fast: {
      name: 'Rápido',
      tagline: 'Una ronda a la vez',
      description:
        'Rondas independientes, redistribución instantánea. La mano más alta gana el bote — el primero en llegar a tres gana la partida.',
      facts: ['primero a 3 gana', 'sin eliminaciones', '~2–4 min'],
    },
    timed: {
      name: 'Cronometrado',
      tagline: 'Corre contra el timbre',
      description:
        'Un reloj de partida de tres minutos y temporizadores de turno relámpago. Quien tenga más rondas ganadas cuando suene la campana se lo lleva.',
      facts: ['reloj de partida 3:00', 'temporizador de turno 7 s', 'desempate a muerte súbita'],
    },
  },
  fields: {
    threeOfAKind: {
      label: 'Trío',
      options: {
        '30.5': 'Vale 30,5',
        '30': 'Vale 30',
        off: 'Desactivado',
      },
    },
    tieLowest: {
      label: 'Empate en la más baja',
      options: {
        both: 'Pierden ambos',
        nobody: 'No pierde nadie',
        redeal: 'Nuevo reparto entre los empatados',
      },
    },
    discardLock: {
      label: 'Bloquear el descarte que acabas de robar',
    },
  },
  presets: {
    'classic-pub': 'Clásico de bar',
    cutthroat: 'Sin piedad',
    friendly: 'Amistoso',
  },
};
