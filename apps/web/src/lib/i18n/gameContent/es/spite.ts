import type { GameCopy } from '../types';

/** Spanish copy for spite. Untranslated fields fall back to the pack's English. */
export const spiteEs: GameCopy = {
  name: 'Spite & Malice',
  subtitle: 'la carrera del montón principal',
  tagline: 'Devuélvesela con creces',
  description:
    'Construye los montones centrales del 1 al 12, vacía tu montón principal y arruina los planes de los demás con comodines bien colocados. El nombre ya lo dice todo.',
  facts: ['2–4 jugadores', 'clásico · rápido · despiadado', 'solo o con amigos'],
  howToPlay: {
    summary:
      'Spite & Malice — construye los montones centrales compartidos del 1 al 12 y vacía tu montón principal antes que nadie más el suyo.',
    objective:
      'Sé el primer jugador con el montón principal vacío. Cada carta que entierras en él es una carta de la que otro podrá presumir.',
    sections: [
      {
        heading: 'La mesa',
        body: ['Cuatro tipos de cartas, cuatro sitios donde ponerlas:'],
        bullets: [
          {
            label: 'Montón principal',
            text: 'tu pila objetivo boca abajo; la carta de arriba va boca arriba',
          },
          { label: 'Mano', text: 'cinco cartas, se reponen a cinco al empezar tu turno' },
          {
            label: 'Montones de descarte',
            text: 'cuatro montones personales — terminar tu turno significa descartar en uno',
          },
          {
            label: 'Montones centrales',
            text: 'hasta cuatro construcciones compartidas en las que juega todo el mundo',
          },
        ],
      },
      {
        heading: 'Tu turno',
        body: [
          'Primero, roba hasta completar cinco cartas. Después haz tantas jugadas como quieras, en el orden que prefieras:',
          'juega en un montón central, juega la carta de arriba de tu montón principal, o juega la de arriba de uno de tus montones de descarte.',
          'Tu turno solo termina cuando descartas una carta de tu mano en uno de tus montones de descarte.',
        ],
      },
      {
        heading: 'Construir',
        body: [
          'Un montón central empieza en un As y sube de rango en rango hasta la Reina. El palo nunca importa.',
          'Completa un montón hasta la Reina y todo él vuelve al mazo de robo — el montón se reinicia vacío, a la espera de un As o un comodín.',
        ],
      },
      {
        heading: 'Comodines',
        bullets: [
          {
            label: 'Comodines',
            text: 'dieciocho en la baraja — juega uno como el rango que necesites, y ese rango se recuerda para el montón',
          },
          {
            label: 'Rangos recordados',
            text: 'un comodín que hace de 6 convierte la siguiente carta en un 7, la juegue quien la juegue',
          },
        ],
      },
      {
        heading: 'El montón principal',
        body: [
          'Jugar la carta de arriba de tu montón principal voltea la siguiente de inmediato — y si era la última, ganas en el acto, en mitad del turno, sin necesidad de descartar.',
          '¿Atascado sin nada que jugar? Descarta con cabeza: lo que apiles ahora es una jugada que podrás desbloquear más tarde.',
        ],
      },
      {
        heading: 'Cuando se agota el mazo',
        body: [
          'Los montones completados vuelven directamente al mazo de robo, así que las cartas siguen circulando.',
          'Si el mazo se agota al empezar tu turno, todos los montones centrales a medio construir también vuelven a él — las exigencias se reinician al As y las cartas enterradas salen de su tumba.',
          'Si la mesa se bloquea del todo, se lleva la partida el montón principal más cercano a vaciarse, en lugar de dejar que nadie se estanque.',
        ],
      },
      {
        heading: 'Formas de jugar',
        bullets: [
          {
            label: 'Clásica',
            text: 'la carrera completa de montón principal de 20 cartas — trae algo de picar',
          },
          { label: 'Rápida', text: 'un montón principal de 10 cartas para un duelo veloz' },
          {
            label: 'Despiadada',
            text: 'montón principal de 13 cartas y sin reponer a mitad de turno: vacía tu mano pronto y jugarás en desventaja',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásica',
      tagline: 'La carrera completa',
      description:
        'Veinte cartas enterradas en cada montón principal y todos los comodines de la baraja. El juego tal como debía jugarse, con calma.',
      facts: ['montón principal de 20', 'reyes y jokers comodín', '~15 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Ajuste de cuentas más corto',
      description:
        'Montones principales de diez cartas dejan el resto intacto — mismos comodines, misma malicia, la mitad de espera para tu venganza.',
      facts: ['montón principal de 10', 'todos los comodines', '~5–8 min'],
    },
    cutthroat: {
      name: 'Despiadada',
      tagline: 'Sin piedad, sin repuestos',
      description:
        'Trece cartas de fondo y sin reponer a mitad de turno: vacía tu mano en mal momento y jugarás en desventaja mientras otro gana.',
      facts: ['montón principal de 13', 'sin reponer a mitad de turno', 'severo'],
    },
  },
  fields: {
    payoffSize: {
      label: 'Montón principal',
      help: 'Cartas enterradas en cada montón principal. Vacía el tuyo para ganar — números más bajos acortan la partida.',
      group: 'El reparto',
    },
    handSize: {
      label: 'Cartas repartidas',
      help: 'Tamaño de la mano, que se repone al empezar cada turno.',
      group: 'El reparto',
    },
    discardPiles: {
      label: 'Montones de descarte',
      help: 'Montones delante de cada jugador. Terminar un turno significa descartar en uno de ellos.',
      group: 'El reparto',
    },
    wilds: {
      label: 'Comodines en la baraja',
      help: 'Un comodín vale por el rango que digas. Dieciocho es la baraja de caja; menos hace que cada uno sea oro.',
      group: 'Comodines',
    },
    buildPiles: {
      label: 'Montones centrales',
      help: 'Montones de construcción compartidos en los que juega todo el mundo. Menos montones significa más espera por los unos de los demás.',
      group: 'El centro',
    },
    refillMidTurn: {
      label: 'Reponer a mitad de turno',
      help: 'Vacía tu mano y se repone a cinco de inmediato para que sigas jugando. Desactivado es la variante despiadada.',
      group: 'Reglas de la casa',
    },
  },
  presets: {
    classic: 'Clásica',
    quick: 'Rápida',
    cutthroat: 'Despiadada',
  },
};
