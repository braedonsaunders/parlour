import type { GameCopy } from '../types';

/** Spanish copy for palace. Untranslated fields fall back to the pack's English. */
export const palaceEs: GameCopy = {
  name: 'Palace',
  subtitle: 'el juego de vaciar capas',
  tagline: 'Vacía la mesa, capa por capa',
  description:
    'Mano, luego boca arriba, luego boca abajo — quema los dieses, esquiva los doses y sé el primero ' +
    'en vaciar cada capa. También conocido como Shithead o Karma.',
  facts: ['2–6 jugadores', 'doses, dieces y ochos', 'solo o con amigos'],
  howToPlay: {
    summary:
      'Deshazte de todo lo que tengas — mano, luego fila boca arriba, luego fila boca abajo — antes ' +
      'de que nadie más vacíe la mesa.',
    objective:
      'Vacía tu mano, tu fila boca arriba y tu fila boca abajo primero para ganar la ronda. Las rondas ' +
      'ganadas se acumulan en la partida; el primero en llegar al objetivo se lleva la partida.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'A todos les tocan tres cartas boca abajo, tres cartas boca arriba encima de esas, y tres ' +
            'cartas en la mano.',
          'Antes de empezar, cambia tantas cartas de la mano como quieras por tus propias cartas boca ' +
            'arriba — tienes un solo cambio, luego te declaras listo.',
        ],
      },
      {
        heading: 'Jugar a la pila',
        body: [
          'En tu turno, juega una o más cartas del mismo valor que igualen o superen el valor de la ' +
            'pila, o recoge toda la pila hacia tu mano.',
          'Debes vaciar tu mano antes de tocar tu fila boca arriba, y vaciar la fila boca arriba antes ' +
            'de tocar la fila boca abajo.',
        ],
        bullets: [
          {
            label: 'Abrir la ronda',
            text: 'quien tenga la carta ordinaria más baja empieza — primero los treses, luego subiendo',
          },
          {
            label: 'Recoge cuando quieras',
            text: 'puedes tomar la pila incluso teniendo una jugada legal — a veces es la jugada más segura',
          },
          {
            label: 'Jugadas boca abajo',
            text:
              'con la mano y la fila boca arriba vacías, voltea una carta boca abajo a ciegas — si ' +
              'supera la pila, se queda en juego y continúas; si no, recoges la pila y la carta',
          },
        ],
      },
      {
        heading: 'Especiales',
        body: ['Cuatro valores cambian las reglas — todos activos por defecto, todos ajustables:'],
        bullets: [
          {
            label: '2 — reinicio',
            text: 'se juega sobre cualquier cosa; el nivel de la pila baja casi a cero',
          },
          {
            label: '10 — quema',
            text: 'se juega sobre cualquier cosa; la pila sale del juego y juegas otra vez',
          },
          {
            label: '8 — invisible',
            text: 'siempre se puede jugar y nunca cambia lo que pide la pila — el siguiente responde a lo que hay debajo',
          },
          {
            label: 'Cuatro iguales',
            text: 'cuatro cartas del mismo valor encima de la pila la queman, como sea que hayan llegado ahí — juegas otra vez',
          },
        ],
      },
      {
        heading: 'Ganar la ronda',
        body: [
          'En el momento en que un asiento vacía mano, fila boca arriba y fila boca abajo juntas, la ' +
            'ronda termina de inmediato.',
          'Todos los demás se ordenan por cuántas cartas les quedan — menos es mejor — y el desempate ' +
            'es cuántas cartas boca abajo les quedan.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: ['Ajusta la mesa en las opciones de sala antes de empezar:'],
        bullets: [
          {
            label: 'Cambio antes de jugar',
            text: 'desactívalo para pasar directo del reparto a la primera jugada',
          },
          {
            label: 'El 2 reinicia / el 10 quema / el 8 siempre se juega',
            text: 'desactiva cualquier especial para que ese valor sea ordinario',
          },
          {
            label: 'Cuatro iguales queman',
            text: 'desactívalo para que una pila de valores iguales simplemente siga creciendo',
          },
          {
            label: 'Primero a (rondas ganadas)',
            text: 'cuántas rondas hacen falta para ganar la partida — 1 para una mano rápida, hasta 7 para una noche larga',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'La subida completa por capas',
      description:
        'Cambia, luego vacía mano, boca arriba y boca abajo. El primero en ganar tres rondas se lleva la mesa.',
      facts: ['a 3 rondas', 'cambio activado', 'todos los especiales'],
    },
    quick: {
      name: 'Rápido',
      tagline: 'Una ronda y ya está',
      description:
        'Una sola ronda lo decide todo — los mismos especiales, sin partida larga que acumular.',
      facts: ['a 1 ronda', '~10 min', 'ideal para calentar'],
    },
    chaos: {
      name: 'Caos',
      tagline: 'Sin cambio, sin piedad',
      description:
        'Directo del reparto a la partida — sin fase de cambio para planear. Todos los especiales al ' +
        'máximo: el 2 reinicia, el 10 quema, el 8 sigue siendo invisible, cuatro iguales incendian la pila.',
      facts: ['a 3 rondas', 'sin fase de cambio', 'espera quemas'],
    },
  },
  fields: {
    allowSwap: {
      label: 'Cambio antes de jugar',
      help: 'La fase de cambio entre el reparto y la primera jugada.',
    },
    twosReset: {
      label: 'El 2 reinicia la pila',
      help: 'Se juega sobre cualquier cosa y reinicia el nivel de la pila.',
    },
    tensBurn: {
      label: 'El 10 quema la pila',
      help: 'Se juega sobre cualquier cosa y quema la pila; el mismo asiento juega otra vez.',
    },
    eightsBlind: {
      label: 'El 8 siempre se puede jugar',
      help: 'Siempre es una jugada legal y no cambia el nivel de la pila.',
    },
    fourKindBurn: {
      label: 'Cuatro iguales queman',
      help: 'Cuatro cartas del mismo valor encima de la pila la queman; el mismo asiento juega otra vez.',
    },
    winsTo: {
      label: 'Primero a (rondas ganadas)',
      help: 'La partida termina cuando un asiento acumula esta cantidad de rondas ganadas.',
    },
  },
  presets: {
    classic: 'Palace clásico',
    quick: 'Palace rápido',
    chaos: 'Palace caótico',
  },
};
