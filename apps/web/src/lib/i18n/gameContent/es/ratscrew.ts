import type { GameCopy } from '../types';

/** Spanish copy for ratscrew. Untranslated fields fall back to the pack's English. */
export const ratscrewEs: GameCopy = {
  name: 'Rat Screw',
  subtitle: 'el juego de la palmada',
  tagline: 'Sé el primero en dar la palmada',
  description:
    'Voltea cartas sobre un montón compartido y da la palmada en parejas, sándwiches y mucho ' +
    'más antes que nadie. Reflejos en tiempo real, desafíos con figuras y quemazos por palmada ' +
    'en falso.',
  facts: ['2–4 jugadores', 'palmadas en tiempo real', 'solo o con amigos'],
  howToPlay: {
    summary:
      'Por turnos, voltea cartas sobre un montón compartido y da PALMADAS para ganar todas las ' +
      'cartas de la mesa.',
    objective:
      'Gana las 52 cartas. Haces crecer tu mazo dando la palmada en los patrones antes que ' +
      'nadie o colocando figuras que tus rivales no puedan responder. Cuando todos los demás se ' +
      'quedan sin cartas —o vuelven al juego a base de palmadas— ganas la partida.',
    sections: [
      {
        heading: 'El volteo',
        body: [
          'Empezando por ti, los jugadores se turnan para colocar la carta de arriba de su ' +
            'propio mazo boca abajo sobre el montón central, girándola lejos de sí mismos para ' +
            'que nadie la vea antes de tiempo.',
          'Si tu mazo se queda seco, dejas de voltear —pero con "Volver con una palmada" ' +
            'activado, una palmada afortunada te devuelve al juego.',
        ],
      },
      {
        heading: 'Figuras y desafíos',
        body: ['Una figura inicia un desafío contra el siguiente jugador en el orden de turno:'],
        bullets: [
          { label: 'Jota', text: 'tiene 1 oportunidad de voltear otra figura' },
          { label: 'Reina', text: '2 oportunidades' },
          { label: 'Rey', text: '3 oportunidades' },
          { label: 'As', text: '4 oportunidades' },
        ],
      },
      {
        heading: 'Resolver un desafío',
        body: [
          'Cada carta que no sea figura que voltee el jugador desafiado le quema una ' +
            'oportunidad.',
          '¿Voltea una nueva figura? El desafío pasa al siguiente jugador de la mesa con ' +
            'oportunidades renovadas.',
          '¿Se queda sin oportunidades? El jugador que lanzó la figura se lleva todo el montón ' +
            'central bajo su mazo y abre el siguiente volteo.',
        ],
      },
      {
        heading: 'Palmadas',
        body: [
          'En cuanto un patrón que se puede palmear cae en el montón, TODOS corren a darle la ' +
            'palmada. La primera palmada válida se lleva todo el montón central y abre el ' +
            'siguiente volteo.',
          'Cada vez que un patrón está activo se abre una breve ventana de palmada: ¡pulsa el ' +
            'botón de PALMADA antes de que se cierre!',
        ],
        bullets: [
          { label: 'Pareja', text: 'dos cartas del mismo valor seguidas (7♦ 7♣)' },
          { label: 'Sándwich', text: 'el mismo valor con una carta en medio (7♦ Q♠ 7♥)' },
          {
            label: 'Matrimonio',
            text: 'un Rey y una Reina seguidos, en cualquier orden (K♦ Q♠) — regla de la casa',
          },
          {
            label: 'Diez',
            text: 'dos cartas numéricas seguidas que suman diez (3♦ 7♠) — regla de la casa',
          },
          {
            label: 'Arriba-abajo',
            text:
              'la carta de arriba coincide con la última carta del fondo del montón — ' +
              'regla de la casa',
          },
          {
            label: 'Escalera',
            text:
              'tres valores seguidos, ascendentes o descendentes (4-5-6 o 9-8-7) — regla ' +
              'de la casa',
          },
        ],
      },
      {
        heading: 'Palmadas en falso',
        body: [
          'Dar la palmada cuando no hay ningún patrón activo tiene un precio: con "La palmada ' +
            'en falso quema una carta" activado, tu carta de arriba se desliza bajo el montón ' +
            'como penalización. Los nervios salen caros — mantén los ojos en las cartas, no en ' +
            'la gente.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: ['Ajusta el caos en las opciones de la sala antes de empezar:'],
        bullets: [
          {
            label: 'Parejas / Sándwiches',
            text: 'los patrones clásicos de palmada, ambos activados por defecto',
          },
          {
            label: 'Matrimonio / Dieces / Arriba-abajo / Escaleras',
            text: 'patrones extra, todos desactivados por defecto para una mesa clásica',
          },
          {
            label: 'La palmada en falso quema una carta',
            text:
              'activado por defecto; desactívalo y solo se podrán palmear los patrones ' +
              'activos',
          },
          {
            label: 'Volver con una palmada al quedarte sin cartas',
            text:
              'los jugadores sin cartas aún pueden dar la palmada en un patrón activo para ' +
              'ganar el montón y volver al juego',
          },
          {
            label: 'Ventana de palmada',
            text: 'cuánto tiempo permanece abierta la carrera — cuanto más corta, más despiadada',
          },
        ],
      },
      {
        heading: 'Modales de mesa',
        body: [
          'Quien gana el montón lo desliza bajo su mazo sin barajar y abre el siguiente ' +
            'volteo. Gana la partida el último jugador que se queda con todas las cartas.',
          'Un breve margen de gracia mantiene honestas las palmadas a distancia: la mesa ' +
            'espera un instante más allá de la ventana antes de darla por cerrada.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Palmada clásica',
      tagline: 'Parejas y sándwiches',
      description:
        'El clásico de bar: voltea rápido, vigila las parejas y los sándwiches, y da la ' +
        'palmada antes de que se cierre la ventana.',
      facts: ['ventana de palmada: 1,2 s', 'la palmada en falso quema', '~8 min'],
    },
    'quick-reflex': {
      name: 'Reflejos rápidos',
      tagline: 'Ventanas crueles',
      description:
        'Los mismos patrones clásicos con el gatillo fácil: la ventana de palmada se cierra ' +
        'de golpe en 0,7 segundos.',
      facts: ['ventana de palmada: 0,7 s', 'para ojos rápidos', '~6 min'],
    },
    slaphappy: {
      name: 'Palmada total',
      tagline: 'Todos los patrones activos',
      description:
        'Matrimonios, dieces, arriba-abajo y escaleras cuentan además de los clásicos. Caos, ' +
        'con buena luz y muy ruidoso.',
      facts: ['todos los patrones', 'ventana de palmada: 0,8 s', '~5 min'],
    },
  },
  fields: {
    doubles: { label: 'Parejas' },
    sandwiches: { label: 'Sándwiches' },
    marriage: { label: 'Matrimonio (K+Q)' },
    tens: { label: 'Los dieces suman diez' },
    topBottom: { label: 'Arriba-abajo' },
    runs: { label: 'Escaleras' },
    misSlapBurn: { label: 'La palmada en falso quema una carta' },
    slapBackIn: { label: 'Volver con una palmada al quedarte sin cartas' },
    slapWindowMs: { label: 'Ventana de palmada' },
  },
  presets: {
    classic: 'Palmada clásica',
    'quick-reflex': 'Reflejos rápidos',
    slaphappy: 'Palmada total',
  },
};
