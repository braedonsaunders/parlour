import type { GameCopy } from '../types';

/** Spanish copy for tripeaks. Untranslated fields fall back to the pack's English. */
export const tripeaksEs: GameCopy = {
  name: 'TriPeaks',
  subtitle: 'despeja los tres picos',
  tagline: 'Juega ±1 sobre el hueco',
  description:
    'Dieciocho cartas en tres picos, todas boca arriba. Libera una carta despejando lo que la cubre, encadena jugadas sobre el hueco y despeja los picos.',
  facts: ['1 jugador', 'picos diarios con semilla', 'sin conexión'],
  howToPlay: {
    summary:
      'Un solitario a un jugador: tres picos de dieciocho cartas, todas boca arriba, y un mazo que se gira sobre un único hueco.',
    objective:
      'Despeja todas las cartas de los picos. Las que queden son tu puntuación: cuanto menos, mejor.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Tres picos de dieciocho cartas están boca arriba en cuatro filas. La fila base de nueve siempre está libre. Las treinta y cuatro cartas restantes forman el mazo, y la primera abre el hueco.',
        ],
      },
      {
        heading: 'Cartas libres',
        body: [
          'Una carta queda libre cuando las dos cartas que descansan sobre ella desaparecen. Solo las cartas libres se pueden mover — las que siguen cubiertas quedan atrapadas hasta que sus hijas se despejen.',
        ],
      },
      {
        heading: 'Juega sobre el hueco',
        body: [
          'Juega una carta libre sobre el hueco cuando esté a un rango de distancia — un 8 acepta un 7 o un 9. Los palos y colores no importan. Encadena todas las jugadas que puedas.',
        ],
      },
      {
        heading: 'Gira el mazo',
        body: [
          'Si nada en los picos encaja, gira la siguiente carta del mazo sobre el hueco. La carta anterior del hueco queda enterrada debajo.',
        ],
      },
      {
        heading: 'As, Rey y el mazo',
        body: [
          'El TriPeaks Clásico trata el As y el Rey como callejones sin salida, y el mazo nunca vuelve. Relajado permite que el As y el Rey se enlacen, y permite barajar el hueco de vuelta al mazo una vez que se agota.',
        ],
      },
      {
        heading: 'La puntuación',
        body: [
          'La partida termina cuando los picos quedan despejados, o cuando nada juega y el mazo no puede volver. Las cartas que queden en los picos son tu puntuación. Cero es un despeje total.',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: 'Diario',
      tagline: 'Un reparto para todos',
      description:
        'Un reparto Clásico con semilla de la fecha. Repítelo, compártelo o vuelve mañana a por picos nuevos.',
      facts: ['sin enlace', 'mismo reparto diario', 'gana quien deja menos'],
    },
    classic: {
      name: 'Clásico',
      tagline: 'As y Rey te detienen',
      description:
        'Un reparto nuevo con semilla. El As y el Rey son callejones sin salida; el mazo nunca vuelve.',
      facts: ['sin enlace', 'reparto nuevo', 'sin reciclaje'],
    },
    relaxed: {
      name: 'Relajado',
      tagline: 'El As enlaza con el Rey',
      description:
        'Los mismos tres picos, pero el As y el Rey se juegan entre sí y el hueco se puede reciclar una vez.',
      facts: ['enlaza A–K', 'reparto nuevo', 'un reciclaje'],
    },
  },
  fields: {
    wrap: {
      label: 'El As enlaza con el Rey',
      group: 'Hueco',
      help: 'El TriPeaks Clásico detiene en el As y el Rey. Relajado deja que A y K se jueguen entre sí.',
    },
    recycle: {
      label: 'Reciclar el hueco',
      group: 'Mazo',
      help: 'Cuando el mazo se agota, baraja el hueco (menos su carta superior) de vuelta al mazo una vez.',
    },
  },
  presets: {
    classic: 'Clásico',
    relaxed: 'Relajado',
  },
};
