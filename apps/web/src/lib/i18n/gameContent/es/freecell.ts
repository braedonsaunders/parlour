import type { GameCopy } from '../types';

/** Spanish copy for freecell. Untranslated fields fall back to the pack's English. */
export const freecellEs: GameCopy = {
  name: 'FreeCell',
  subtitle: 'el solitario abierto',
  tagline: 'Despeja la mesa diaria',
  description:
    'Ocho columnas, todas las cartas boca arriba. Aparca extras en las celdas libres y manda cada palo a casa de As a Rey. El mismo reparto diario espera a todos.',
  facts: ['1 jugador', 'reparto diario con semilla', 'sin conexión'],
  howToPlay: {
    summary:
      'El clásico del solitario a cartas abiertas, repartido de forma determinista para una mesa nueva o para el reparto diario.',
    objective: 'Construye las cuatro bases de As a Rey, un palo por pila.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Ocho columnas del tablero muestran todas las cartas boca arriba. Las primeras cuatro columnas reciben siete cartas; las últimas cuatro reciben seis.',
        ],
      },
      {
        heading: 'Celdas libres',
        body: [
          'Aparca una carta en cada celda libre. Clásico tiene cuatro celdas; Relajado tiene seis. Una celda guarda una sola carta, que puede ir al tablero o a una base.',
        ],
      },
      {
        heading: 'Construye el tablero',
        body: [
          'Coloca las cartas en orden descendente y en colores alternados. Una serie empaquetada se mueve junta si el límite de supermovimiento lo permite. Cualquier carta —no solo un Rey— puede entrar en una columna vacía.',
        ],
      },
      {
        heading: 'Las bases',
        body: [
          'Empieza cada palo con su As y sigue subiendo hasta el Rey. Una carta de la base puede volver al tablero si necesitas deshacer una línea.',
        ],
      },
      {
        heading: 'Despeja la mesa',
        body: ['Manda todas las cartas a casa. Completa las cuatro bases para ganar.'],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diario',
      tagline: 'Una mesa para todos',
      description:
        'Un reparto Clásico con semilla de la fecha. Repítelo, compártelo o vuelve mañana a por una mesa nueva.',
      facts: ['cuatro celdas', 'mismo reparto diario', 'cualquier carta al vacío'],
    },
    classic: {
      name: 'Clásico',
      tagline: 'Cuatro celdas libres',
      description: 'Un reparto nuevo con semilla y cuatro celdas de una carta.',
      facts: ['cuatro celdas', 'reparto nuevo', 'cualquier carta al vacío'],
    },
    relaxed: {
      name: 'Relajado',
      tagline: 'Seis celdas libres',
      description: 'Un reparto nuevo más suave: dos celdas extra facilitan mover series largas.',
      facts: ['seis celdas', 'reparto nuevo', 'cualquier carta al vacío'],
    },
  },
  fields: {
    freeCells: {
      label: 'Celdas libres',
      group: 'Reparto',
      options: {
        '4': 'Cuatro celdas — clásico',
        '6': 'Seis celdas — relajado',
      },
      help: 'Aparca una carta en cada celda. Relajado añade dos celdas extra.',
    },
  },
  presets: {
    classic: 'Clásico',
    relaxed: 'Relajado',
  },
};
