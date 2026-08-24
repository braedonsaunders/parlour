import type { GameCopy } from '../types';

/** Spanish copy for wild. Untranslated fields fall back to the pack's English. */
export const wildEs: GameCopy = {
  name: 'Wild',
  subtitle: 'el juego de vaciar la mano',
  tagline: 'Suelta todas tus cartas',
  description:
    'Un alboroto de 112 cartas con saltos, cambios de sentido, +4, descartes de color y jugadas fuera de turno. La misma mesa cálida, con un mazo mucho más ruidoso.',
  facts: ['2–4 jugadores', 'reparto cronometrado', 'solo o con amigos'],
  howToPlay: {
    summary:
      'Un alboroto de 112 cartas: empareja la carta de arriba, desata cartas de acción y vacía tu mano antes que nadie.',
    objective:
      'Sé el primero en quedarte sin cartas. Las cartas de acción frenan a los demás... a menos que se defiendan.',
    sections: [
      {
        heading: 'Jugar una carta',
        body: [
          'En tu turno, juega una carta que coincida con la de arriba en color o en valor, o roba en su lugar.',
          'Los comodines se pueden jugar en cualquier momento y te dejan elegir el próximo color.',
        ],
      },
      {
        heading: 'Cartas de acción',
        bullets: [
          {
            label: 'Saltar',
            text: 'el siguiente jugador pierde el turno, y no puede colarse de vuelta',
          },
          {
            label: 'Cambio de sentido',
            text: 'invierte el sentido del juego; entre dos jugadores te da otro turno seguido',
          },
          { label: '+2', text: 'el siguiente jugador roba dos cartas y pierde el turno' },
          {
            label: 'Descartar todo',
            text: 'descarta todas las cartas de tu mano de ese color debajo de ella; las cartas de acción arrastradas no se activan',
          },
          { label: 'Comodín', text: 'juégalo cuando quieras y canta el próximo color' },
          {
            label: 'Comodín +4',
            text: 'canta el color Y hace que el siguiente jugador robe cuatro cartas',
          },
          {
            label: 'Comodín Intercambiar Manos',
            text: 'canta el color y luego intercambia tu mano con quien quieras (carta opcional)',
          },
          {
            label: 'Comodín Barajar Manos',
            text: 'junta todas las manos, barájalas y repártelas de nuevo (carta opcional)',
          },
        ],
      },
      {
        heading: 'Última carta',
        body: [
          '¿Te quedan dos cartas? Pulsa "¡Última carta!" antes de jugar. Si te quedas con una sin cantarla, te pillan y robas dos.',
          'Si robas, vuelves a tener más cartas, así que hay que volver a cantarla.',
        ],
      },
      {
        heading: 'Los relojes',
        body: [
          'Cada turno tiene un tiempo límite. Si el reloj llega a cero, la mesa hace una jugada válida por ese jugador para que la partida siga.',
          'El reparto también tiene un reloj de partida. Durante su último minuto, aparecen las posiciones en vivo del primero al cuarto puesto y se actualizan según cambian las manos.',
        ],
        bullets: [
          {
            label: 'Al llegar a cero',
            text: 'gana quien tenga menos cartas; los empates se resuelven por orden de asiento, así cada partida tiene un resultado claro',
          },
          {
            label: 'Opciones avanzadas',
            text: 'ajusta los segundos por turno y los minutos totales de la partida antes de repartir',
          },
        ],
      },
      {
        heading: 'Caos de la casa',
        body: ['Todos los ajustes de la mesa están en Opciones avanzadas antes de repartir:'],
        bullets: [
          {
            label: 'Acumular',
            text: 'responde a un +2 o un +4 con la misma carta y la penalización se acumula para la próxima víctima',
          },
          {
            label: 'Colarse',
            text: '¿tienes una carta idéntica a la que se acaba de jugar? Suéltala fuera de turno antes de que nadie reaccione',
          },
          {
            label: 'Robar hasta poder jugar',
            text: 'sigue robando hasta conseguir una carta jugable, en vez de robar solo una',
          },
          {
            label: 'Jugada forzada',
            text: 'si robas una carta que se puede jugar, tienes que jugarla',
          },
          {
            label: 'Desafiar los +4',
            text: 'un +4 solo es legítimo si no tienes ninguna carta del color anterior: desafía el farol y, si aciertas, se lleva la pila; si fallas, te llevas dos más',
          },
          {
            label: 'Sietes y ceros',
            text: 'un 7 intercambia tu mano con el jugador que elijas; un 0 pasa todas las manos un asiento',
          },
          {
            label: 'Comodines de intercambio',
            text: 'añade al mazo los comodines Intercambiar Manos y Barajar Manos',
          },
        ],
      },
      {
        heading: 'Ganar',
        body: [
          'Vacía tu mano para ganar antes de que se acabe el tiempo de la partida. Si no, gana quien tenga la mano más ligera al llegar a cero.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Al pie de la letra',
      description:
        'Empareja el color o el número, y suelta todo un color de golpe. Sin acumular, sin colarte: un alboroto educado.',
      facts: ['un reparto', 'sin acumular', '~5 min'],
    },
    party: {
      name: 'Fiesta',
      tagline: 'Acumula y arrasa',
      description:
        'Los +2 y los +4 se acumulan, y una coincidencia exacta deja que cualquiera se cuele fuera de turno. Caos, con buena luz.',
      facts: ['acumulación activada', 'colarse activado', '~5 min'],
    },
    houseRules: {
      name: 'Reglas de la casa',
      tagline: 'Todo activado',
      description:
        'Los sietes intercambian manos, los ceros las pasan, los comodines de intercambio se unen al mazo, y la carta que robas hay que jugarla.',
      facts: ['cambios 7-0', 'comodines de intercambio', 'jugada forzada'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartas repartidas',
      help: 'Cuántas cartas recibe cada asiento al empezar.',
      group: 'El reparto',
    },
    turnTimeSeconds: {
      label: 'Segundos por turno',
      help: 'Cuando se acaba el tiempo, la mesa hace una jugada válida por ese asiento.',
      group: 'Tiempo',
    },
    matchTimeMinutes: {
      label: 'Minutos de partida',
      help: 'Al llegar a cero, gana quien tenga la mano más ligera.',
      group: 'Tiempo',
    },
    stackDrawTwo: {
      label: 'Acumular +2',
      help: 'Responde a un +2 con otro tuyo y pasa la pila, cada vez más grande.',
      group: 'Penalizaciones',
    },
    stackDrawFour: {
      label: 'Acumular +4',
      help: 'Lo mismo con los +4. Las penalizaciones pueden crecer rápido.',
      group: 'Penalizaciones',
    },
    jumpIn: {
      label: 'Colarse',
      help: '¿Tienes la carta exacta que se acaba de jugar? Suéltala fuera de turno.',
      group: 'Reglas de la casa',
    },
    drawToMatch: {
      label: 'Robar hasta poder jugar',
      help: 'Sigue robando hasta que consigas una carta jugable, en vez de robar solo una.',
      group: 'Reglas de la casa',
    },
    forcePlay: {
      label: 'Jugada forzada',
      help: 'Si robas una carta que se puede jugar, tienes que jugarla.',
      group: 'Reglas de la casa',
    },
    sevenZero: {
      label: 'Sietes y ceros',
      help: 'Juega un 7 para intercambiar tu mano con alguien; juega un 0 para pasar todas las manos un asiento.',
      group: 'Reglas de la casa',
    },
    challengeDrawFour: {
      label: 'Desafiar los +4',
      help: 'Un +4 solo es legítimo si no tienes ninguna carta del color en juego. Desafía el farol: si aciertas, se lleva las cartas; si fallas, te llevas dos más.',
      group: 'Reglas de la casa',
    },
    swapCards: {
      label: 'Comodines de intercambio',
      help: 'Añade al mazo los comodines Intercambiar Manos y Barajar Manos.',
      group: 'El mazo',
    },
  },
  presets: {
    classic: 'Wildpile clásico',
    party: 'Pila de fiesta',
    houseRules: 'Reglas de la casa',
  },
};
