import type { GameCopy } from '../types';

/** Spanish copy for pyramid. Untranslated fields fall back to the pack's English. */
export const pyramidEs: GameCopy = {
  name: 'Pirámide',
  subtitle: 'empareja hasta trece',
  tagline: 'Despeja la pirámide diaria',
  description:
    'Veintiocho cartas en un triángulo. Empareja rangos libres que sumen 13, gira el mazo y deja lo menos posible.',
  facts: ['1 jugador', 'pirámide diaria con semilla', 'sin conexión'],
  howToPlay: {
    summary:
      'Un solitario a un jugador: veintiocho cartas en pirámide y un mazo que se gira sobre un único descarte.',
    objective:
      'Empareja cartas libres que sumen trece y limpia la mesa. Las que queden son tu puntuación: cuanto menos, mejor.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Siete filas forman una pirámide de veintiocho cartas boca arriba. Una carta está libre cuando desaparecen las dos que la cubren — o cuando está en la última fila. Las veinticuatro restantes son el mazo. El descarte empieza vacío.',
        ],
      },
      {
        heading: 'Empareja hasta trece',
        body: [
          'El As vale 1 y el Rey vale 13. Cualquier par de cartas libres cuyos rangos sumen 13 se puede emparejar — Dama y As, Jota y 2, y así. Un Rey ya vale 13 y se retira solo. Los palos no importan.',
        ],
      },
      {
        heading: 'El descarte',
        body: [
          'Gira una carta del mazo al descarte cada vez. Solo la carta superior del descarte está viva: emparéjala con una carta libre de la pirámide, o retírala si es un Rey. Las cartas enterradas del descarte no se emparejan entre sí.',
        ],
      },
      {
        heading: 'Reciclar',
        body: [
          'Cuando el mazo se acaba, vuelve a voltear el descarte sin barajar. Clásico permite dos reciclajes — tres pasadas. Relajado no se acaba nunca.',
        ],
      },
      {
        heading: 'La puntuación',
        body: [
          'La partida termina cuando no queda ninguna carta, o cuando nada empareja y el mazo no puede volver. Cada carta que siga en la pirámide, el mazo o el descarte cuenta. Cero es un clear.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diario',
      tagline: 'Una pirámide para todos',
      description:
        'Una pirámide Clásica con semilla de la fecha. Repítela, compártela o vuelve mañana a por una mesa nueva.',
      facts: ['dos reciclajes', 'mismo reparto diario', 'gana quien deja menos'],
    },
    classic: {
      name: 'Clásico',
      tagline: 'Tres pasadas',
      description:
        'Una pirámide nueva con semilla. El descarte se puede reciclar dos veces — tres viajes por el mazo.',
      facts: ['dos reciclajes', 'reparto nuevo', 'tres pasadas'],
    },
    relaxed: {
      name: 'Relajado',
      tagline: 'Pasadas ilimitadas',
      description:
        'La misma mesa de emparejar, pero el descarte se puede volver a girar las veces que quieras.',
      facts: ['reciclajes ilimitados', 'reparto nuevo', 'sin límite de pasadas'],
    },
  },
  fields: {
    recyclesLimit: {
      label: 'Reciclajes del descarte',
      group: 'Mazo',
      options: {
        '2': 'Dos reciclajes — clásico',
        '-1': 'Ilimitados — relajado',
      },
      help: 'Clásico permite dos reciclajes, tres pasadas por el mazo. Relajado no se acaba nunca.',
    },
  },
  presets: {
    classic: 'Clásico',
    relaxed: 'Relajado',
  },
};
