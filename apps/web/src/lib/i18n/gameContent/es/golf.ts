import type { GameCopy } from '../types';

/** Spanish copy for golf. Untranslated fields fall back to the pack's English. */
export const golfEs: GameCopy = {
  name: 'Golf',
  subtitle: 'el solitario rápido',
  tagline: 'Juega ±1 al hoyo',
  description:
    'Siete columnas de cinco, todas las cartas boca arriba. Juega un rango junto al hoyo, encadena todo lo que puedas y deja lo menos posible sobre el césped.',
  facts: ['1 jugador', 'hoyo diario con semilla', 'sin conexión'],
  howToPlay: {
    summary:
      'Un solitario rápido a un jugador: siete columnas de cinco, todas las cartas visibles y un solo hoyo.',
    objective:
      'Quita todas las cartas del césped. Las que queden son tu puntuación: cuanto menos, mejor.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Siete columnas guardan cinco cartas boca arriba cada una. Las diecisiete restantes forman el mazo. La primera carta del mazo abre el hoyo.',
        ],
      },
      {
        heading: 'Juega al hoyo',
        body: [
          'Solo puede moverse la carta más baja de cada columna. Júegala al hoyo cuando esté a un rango de distancia: un 8 admite un 7 o un 9. Palos y colores no importan.',
        ],
      },
      {
        heading: 'Gira el mazo',
        body: [
          'Si nada del césped encaja, gira la siguiente carta del mazo sobre el hoyo. La carta anterior queda enterrada y no vuelve. No hay reciclaje.',
        ],
      },
      {
        heading: 'As y Rey',
        body: [
          'El Golf clásico trata el As y el Rey como callejones sin salida. Fairway permite que se conecten para que una cadena siga corriendo.',
        ],
      },
      {
        heading: 'La puntuación',
        body: [
          'El hoyo termina cuando el césped está limpio o el mazo se acaba y ya no hay jugadas. Las cartas que quedan en el tablero son tu puntuación. Cero es un clear.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diario',
      tagline: 'Un hoyo para todos',
      description:
        'Un hoyo Clásico con semilla de la fecha. Repítelo, compártelo o vuelve mañana a por una mesa nueva.',
      facts: ['sin envolvente', 'mismo reparto diario', 'gana quien deja menos'],
    },
    classic: {
      name: 'Clásico',
      tagline: 'As y Rey te detienen',
      description:
        'Un hoyo nuevo con semilla. As y Rey son callejones sin salida; el mazo no vuelve.',
      facts: ['sin envolvente', 'reparto nuevo', 'sin reciclaje'],
    },
    fairway: {
      name: 'Fairway',
      tagline: 'El As envuelve al Rey',
      description:
        'El mismo hoyo rápido, pero As y Rey se juegan entre sí para que las cadenas duren más.',
      facts: ['envuelve A–K', 'reparto nuevo', 'sin reciclaje'],
    },
  },
  fields: {
    wrap: {
      label: 'El As envuelve al Rey',
      group: 'Hoyo',
      help: 'El Golf clásico se detiene en As y Rey. Fairway deja que A y K se jueguen el uno al otro.',
    },
  },
  presets: {
    classic: 'Clásico',
    fairway: 'Fairway',
  },
};
