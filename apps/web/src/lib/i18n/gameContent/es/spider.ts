import type { GameCopy } from '../types';

/** Spanish copy for spider. Untranslated fields fall back to the pack's English. */
export const spiderEs: GameCopy = {
  name: 'Spider',
  subtitle: 'el solitario de dos barajas',
  tagline: 'Pela ocho series del mismo palo',
  description:
    'Construye diez columnas en orden descendente, mueve solo series del mismo palo y saca cada Rey-a-As de la mesa. El mismo reparto diario de dos palos espera a todos.',
  facts: ['1 jugador', 'reparto diario con semilla', 'sin conexión'],
  howToPlay: {
    summary:
      'Spider al estilo Microsoft con dos barajas: diez columnas, cinco filas de reserva y ocho palos que hay que pelar.',
    objective: 'Lleva ocho series del mismo palo de Rey a As a las bases.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Se reparten diez columnas: las cuatro primeras tienen seis cartas y el resto cinco. Solo la carta superior de cada columna empieza boca arriba. Quedan cincuenta cartas en el mazo como cinco filas de diez.',
        ],
      },
      {
        heading: 'Construye el tablero',
        body: [
          'Coloca las cartas en orden descendente, cualquier palo. Solo una serie descendente del mismo palo puede moverse en bloque. Una columna vacía acepta cualquier carta o serie.',
        ],
      },
      {
        heading: 'Reparte una fila',
        body: [
          'Pulsa el mazo para dar una carta boca arriba a cada columna. No puedes repartir si alguna columna está vacía o si quedan menos de diez cartas.',
        ],
      },
      {
        heading: 'Pela un palo',
        body: [
          'Cuando se completa una serie del mismo palo de Rey a As en una columna, se retira a una base en el mismo movimiento. Una carta tapada que quede al descubierto se voltea sola.',
        ],
      },
      {
        heading: 'Los palos',
        body: [
          'Relajado pinta las 104 cartas como picas. Clásico (el diario) usa picas y corazones. Difícil usa todos los palos, así que las series empaquetadas son más raras.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diario',
      tagline: 'Una mesa para todos',
      description:
        'Un reparto de dos palos con semilla de la fecha. Repítelo, compártelo o vuelve mañana a por una mesa nueva.',
      facts: ['dos palos', 'mismo reparto diario', 'cinco filas de mazo'],
    },
    relaxed: {
      name: 'Relajado',
      tagline: 'Todas picas',
      description:
        'Un reparto nuevo más suave: cada carta es una pica, así que las series se arman con facilidad.',
      facts: ['un palo', 'reparto nuevo', 'cinco filas de mazo'],
    },
    classic: {
      name: 'Clásico',
      tagline: 'Dos palos',
      description:
        'Un reparto nuevo con semilla pintado en picas y corazones — el predeterminado de Microsoft.',
      facts: ['dos palos', 'reparto nuevo', 'cinco filas de mazo'],
    },
    hard: {
      name: 'Difícil',
      tagline: 'Cuatro palos',
      description:
        'El reparto completo de dos barajas. Las series del mismo palo escasean y cada pelo se gana.',
      facts: ['cuatro palos', 'reparto nuevo', 'cinco filas de mazo'],
    },
  },
  fields: {
    suitCount: {
      label: 'Palos',
      group: 'Reparto',
      options: {
        '1': 'Un palo — relajado',
        '2': 'Dos palos — clásico',
        '4': 'Cuatro palos — difícil',
      },
      help: 'Los repartos de un palo son todas picas. El clásico usa picas y corazones. El difícil usa todos los palos.',
    },
  },
  presets: {
    relaxed: 'Relajado',
    classic: 'Clásico',
    hard: 'Difícil',
  },
};
