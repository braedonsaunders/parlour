import type { GameCopy } from '../types';

/** Spanish copy for eights. Untranslated fields fall back to the pack's English. */
export const eightsEs: GameCopy = {
  name: 'Ocho Loco',
  subtitle: 'el juego de vaciar la mano con comodines',
  tagline: 'Los ochos van donde quieran',
  description:
    'Una baraja corriente y una pila que no para de crecer. Sigue el palo o el valor, suelta un ' +
    'ocho para doblar la mesa al palo que quieras y cóbrale a los demás todo lo que aún tengan en ' +
    'la mano.',
  facts: ['2–6 jugadores', 'partida a puntos', 'solo o con amigos'],
  howToPlay: {
    summary:
      'Una baraja corriente, una pila y ochos que van encima de cualquier cosa. Vacía tu mano y ' +
      'cóbrale a la mesa lo que todavía tenga.',
    objective:
      'Vacía tu mano para terminar la ronda y cóbrate todas las cartas que les queden a los demás. ' +
      'El primero en superar la puntuación objetivo se lleva la partida.',
    sections: [
      {
        heading: 'Jugar una carta',
        body: [
          'En tu turno, juega una carta que coincida con la pila en palo o en valor: un 7♦ vale ' +
            'sobre cualquier diamante y sobre cualquier otro siete.',
          'El ocho es comodín. Va encima de cualquier carta, y eliges tú el palo que debe seguirlo.',
          '¿Nada que jugar? Roba. La pila pide el mismo palo hasta que alguien lo cambie.',
        ],
      },
      {
        heading: 'Cartas de acción',
        body: [
          'Cada una de estas es un ajuste de mesa, así que cada casa puede jugar tan tranquila o ' +
            'tan ruidosa como quiera.',
        ],
        bullets: [
          {
            label: '8 — comodín',
            text: 'siempre se puede jugar; tú eliges el palo que sigue (siempre activo)',
          },
          { label: '2 — roba dos', text: 'el siguiente asiento roba dos cartas y pierde el turno' },
          { label: 'Q — saltar', text: 'el turno pasa por encima del siguiente asiento' },
          {
            label: 'A — invertir',
            text: 'la mesa cambia de sentido; entre dos jugadores te da otro turno seguido',
          },
        ],
      },
      {
        heading: 'Robar',
        body: [
          'Por tradición, sigues robando hasta que tengas algo jugable. Desactívalo y cada turno ' +
            'solo te da derecho a una carta.',
          'Una carta que robas y que se puede jugar es tuya para jugarla en el acto o para ' +
            'quedártela, a menos que la mesa obligue a jugarla.',
          'Cuando se acaba el mazo, todo lo que hay bajo la carta boca arriba se vuelve a barajar ' +
            'en un mazo nuevo.',
        ],
      },
      {
        heading: 'Puntuación de la ronda',
        body: [
          'En el momento en que una mano se vacía, todos los demás cuentan lo que aún tienen en la ' +
            'mano y quien se quedó sin cartas se lleva el total.',
        ],
        bullets: [
          { label: 'Cada ocho', text: '50 puntos' },
          { label: 'Cualquier 10, J, Q o K', text: '10 puntos' },
          { label: 'Cualquier as', text: '1 punto' },
          { label: 'Todo lo demás', text: 'su valor nominal' },
          {
            label: 'Una ronda bloqueada',
            text: 'se acaba el mazo y nadie puede jugar: gana la mano más ligera y se lleva la diferencia',
          },
        ],
      },
      {
        heading: 'Ganar la partida',
        body: [
          'Se siguen repartiendo rondas, con el reparto pasando un asiento cada vez, hasta que ' +
            'alguien supera la puntuación objetivo. Gana la puntuación más alta.',
          'Un empate en la cima reparte otra ronda en vez de repartir la corona.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Ochos y nada más',
      description:
        'El juego tal como lo repartía tu abuela. Sigue el palo o el valor, juega un ocho para ' +
        'cantar un palo y roba hasta que algo encaje. El primero en llegar a 100 gana.',
      facts: ['solo el 8 es comodín', 'roba hasta poder jugar', 'a 100'],
    },
    house: {
      name: 'Casero',
      tagline: 'Doses, reinas y ases',
      description:
        'Las reglas que casi todo el mundo juega en realidad: los doses reparten cartas, las ' +
        'reinas saltan al siguiente asiento y los ases dan la vuelta a la mesa. El primero en ' +
        'llegar a 100 gana.',
      facts: ['2 · Q · A activos', 'sin acumular', 'a 100'],
    },
    chaos: {
      name: 'Alocado',
      tagline: 'A acumular sin parar',
      description:
        'Los doses se acumulan sobre doses hasta que alguien se traga el montón entero, la carta ' +
        'que robas hay que jugarla, y solo tienes derecho a robar una vez por turno. Partida larga, ' +
        'mesa ruidosa.',
      facts: ['acumulación activada', 'jugada forzada', 'a 150'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartas repartidas',
      help: 'Cuántas cartas recibe cada asiento al empezar una ronda.',
      group: 'El reparto',
    },
    targetScore: {
      label: 'Jugar hasta',
      help: 'Se siguen repartiendo rondas hasta que alguien supera esta puntuación.',
      group: 'El reparto',
    },
    twosDrawTwo: {
      label: 'Doses roban dos',
      help: 'El siguiente asiento roba dos cartas y pierde el turno.',
      group: 'Cartas de acción',
    },
    queensSkip: {
      label: 'Reinas saltan',
      help: 'El turno pasa por encima del siguiente asiento.',
      group: 'Cartas de acción',
    },
    acesReverse: {
      label: 'Ases invierten',
      help: 'Da la vuelta a la mesa. Con dos jugadores actúa como un salto.',
      group: 'Cartas de acción',
    },
    stackDrawTwo: {
      label: 'Acumular doses',
      help: 'Responde a un dos con el tuyo y pasa toda la penalización acumulada.',
      group: 'Reglas de la casa',
    },
    drawUntilPlayable: {
      label: 'Robar hasta poder jugar',
      help: 'La regla tradicional. Desactívala para robar exactamente una carta por turno.',
      group: 'Reglas de la casa',
    },
    forcePlay: {
      label: 'Jugada forzada',
      help: 'Una carta que robas y que se puede jugar, hay que jugarla.',
      group: 'Reglas de la casa',
    },
  },
  presets: {
    classic: 'Ochos clásicos',
    house: 'Ochos de casa',
    chaos: 'Ocho Loco',
  },
};
