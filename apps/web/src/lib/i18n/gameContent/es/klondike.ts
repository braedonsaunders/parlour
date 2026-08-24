import type { GameCopy } from '../types';

/** Spanish copy for klondike. Untranslated fields fall back to the pack's English. */
export const klondikeEs: GameCopy = {
  name: 'Klondike',
  subtitle: 'el clásico del solitario',
  tagline: 'Despeja la mesa diaria',
  description:
    'Levanta siete columnas en colores alternados, gira el mazo y manda cada palo a casa de As a Rey. El mismo reparto diario espera a todos.',
  facts: ['1 jugador', 'reparto diario con semilla', 'sin conexión'],
  howToPlay: {
    summary:
      'El clásico del solitario a siete columnas, repartido de forma determinista para una mesa nueva o para el reparto diario.',
    objective: 'Construye las cuatro bases de As a Rey, un palo por pila.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Siete columnas del tablero guardan de una a siete cartas. Solo la carta superior de cada columna empieza boca arriba; las otras veinticuatro cartas forman el mazo.',
        ],
      },
      {
        heading: 'Construye el tablero',
        body: [
          'Coloca las cartas en orden descendente y en colores alternados. Una serie boca arriba se mueve en bloque. Solo un Rey —solo o encabezando una serie— puede entrar en una columna vacía.',
        ],
      },
      {
        heading: 'Gira y recicla',
        body: [
          'Clásico gira tres cartas del mazo a la vez; Relajado gira una. Solo la carta superior del descarte puede moverse. Cuando el mazo se agota, da la vuelta al descarte sin barajar. No hay límite de pasadas.',
        ],
      },
      {
        heading: 'Las bases',
        body: [
          'Empieza cada palo con su As y sigue subiendo hasta el Rey. Una carta de la base puede volver al tablero si necesitas deshacer una jugada.',
        ],
      },
      {
        heading: 'Despeja la mesa',
        body: [
          'Mover la última carta boca arriba de una columna voltea automáticamente la carta que queda al descubierto. Completa las cuatro bases para ganar.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diario',
      tagline: 'Una mesa para todos',
      description:
        'Un reparto de Robar Tres con semilla de la fecha. Repítelo, compártelo o vuelve mañana a por una mesa nueva.',
      facts: ['robar tres', 'mismo reparto diario', 'pasadas ilimitadas'],
    },
    classic: {
      name: 'Clásico',
      tagline: 'Robar tres',
      description: 'Un reparto nuevo con semilla y tres cartas giradas del mazo cada vez.',
      facts: ['robar tres', 'reparto nuevo', 'pasadas ilimitadas'],
    },
    relaxed: {
      name: 'Relajado',
      tagline: 'Robar una',
      description: 'Un reparto nuevo más suave: cada carta del mazo llega de una en una.',
      facts: ['robar una', 'reparto nuevo', 'pasadas ilimitadas'],
    },
  },
  fields: {
    drawCount: {
      label: 'Robo del mazo',
      group: 'Reparto',
      options: {
        '3': 'Robar tres — clásico',
        '1': 'Robar una — relajado',
      },
      help: 'Gira una o tres cartas a la vez. El descarte puede reciclarse sin límite de pasadas.',
    },
  },
  presets: {
    classic: 'Clásico',
    relaxed: 'Relajado',
  },
};
