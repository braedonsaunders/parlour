import type { GameCopy } from '../types';

/** Spanish copy for president. Untranslated fields fall back to the pack's English. */
export const presidentEs: GameCopy = {
  name: 'Presidente',
  subtitle: 'el juego de la escalada',
  tagline: 'Sube hasta la corona',
  description:
    'Corona la pila con un conjunto más alto, deshazte de tu mano antes que nadie y sube de Escoria a Presidente. Hasta ocho sillas, con coronas y sustos incluidos.',
  facts: ['2–8 jugadores', 'roles y trueques', 'solo o con amigos'],
  howToPlay: {
    summary:
      'El clásico juego de escalada — deshazte de tu mano primero, sube la escalera de Escoria a Presidente y haz que tus rivales te sirvan cartas.',
    objective:
      'Termina cada reparto en la mejor silla que puedas. El primero en quedarse sin cartas es Presidente, el último es Escoria. Los puntos de posición se acumulan entre repartos; gana quien primero llegue al total objetivo.',
    sections: [
      {
        heading: 'Jugar a la pila',
        body: [
          'Quien lidera abre una baza con cualquier conjunto — una carta, pareja, trío o cuarteto de un mismo valor.',
          'En el sentido de las agujas del reloj, cada jugador debe coronar la pila con el MISMO tamaño de conjunto y un valor estrictamente más alto, o pasar.',
        ],
        bullets: [
          {
            label: 'Orden de valores',
            text: 'el 3 es el más bajo, subiendo hasta el As, con el 2 por encima de todo',
          },
          {
            label: 'Pasar',
            text: 'pasar solo te salta este turno — si alguien más corona la pila más tarde en la baza, vuelves a entrar (salvo que esté activa la regla de la casa de paso bloqueado)',
          },
          {
            label: 'Ganar la baza',
            text: 'cuando todos los demás han pasado, se recoge la pila y quien ganó lidera lo que quiera',
          },
          {
            label: 'Un 2 limpia',
            text: 'un 2 solo gana la pila al instante y mantiene el turno — regla de la casa, activa por defecto',
          },
        ],
      },
      {
        heading: 'Terminar un reparto',
        body: [
          'Te quedas sin cartas y aseguras el siguiente puesto en la escalera. Se sigue jugando hasta que solo queda un jugador con cartas en la mano — la Escoria.',
          'El primero es Presidente, el segundo es Vicepresidente, el penúltimo es Vice Escoria y el último puesto es Escoria.',
        ],
      },
      {
        heading: 'Puntuación y la partida',
        body: [
          'Cada reparto acumula puntos de posición: el Presidente anota tantos puntos como sillas haya, el segundo uno menos, y así hasta un único punto para la Escoria.',
          'La partida termina en el momento en que alguien alcanza el objetivo — gana el total acumulado más alto, los empates comparten la corona.',
        ],
      },
      {
        heading: 'El intercambio',
        body: [
          'Antes del siguiente reparto, las sillas bajas pagan tributo desde sus manos recién repartidas y las sillas altas devuelven su elección:',
        ],
        bullets: [
          {
            label: 'Escoria → Presidente',
            text: 'las dos mejores cartas de la Escoria; el Presidente devuelve las dos que quiera',
          },
          { label: 'Vice Escoria → Vicepresidente', text: 'una carta en cada sentido' },
          {
            label: 'Interruptor de desactivación',
            text: 'desactiva el trueque en los ajustes de la sala para un todos-contra-todos más puro',
          },
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: ['Ajusta la mesa en los ajustes de la sala antes de empezar:'],
        bullets: [
          {
            label: 'El 2 limpia la pila',
            text: 'activo por defecto — desactivado, el 2 es solo otra carta imbatible',
          },
          {
            label: 'Pases bloqueados',
            text: 'una vez pasas, te quedas fuera del resto de la baza (por defecto desactivado: vuelves a entrar cuando cambia la pila)',
          },
          { label: 'Trueque', text: 'el intercambio de cartas por roles entre repartos' },
          {
            label: 'Puntos objetivo',
            text: 'lo larga que es la partida — 7 para una carrera corta, 11 para una sesión, 21 para una maratón',
          },
        ],
      },
      {
        heading: 'Etiqueta de mesa',
        body: [
          'El primer reparto lo abre la silla inicial; después, quien sea Presidente lidera cada reparto.',
          'Las manos se reparten por turnos hasta que el mazo se agota, así que en mesas impares algunas sillas se quedan con una carta menos — todos están en el mismo barco.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'La escalera completa',
      description:
        'Coronas, tributos y remontadas — el primero en llegar a once puntos se lleva la sala. Como se juega en el bar.',
      facts: ['a 11 puntos', 'trueque activo', '2 limpiezas'],
    },
    rapid: {
      name: 'Rápida',
      tagline: 'Corta y picante',
      description:
        'El primero en llegar a siete mantiene la mesa en movimiento. Las mismas reglas, menos repartos, remontadas más ruidosas.',
      facts: ['a 7 puntos', '~10 min', 'genial con 6+'],
    },
    marathon: {
      name: 'Maratón',
      tagline: 'Reinados largos',
      description:
        'Veintiún puntos de política. Las escorias se convierten en presidentes, las dinastías suben y caen.',
      facts: ['a 21 puntos', 'sesión larga', 'arco completo'],
    },
  },
  fields: {
    twoClears: {
      label: 'Un 2 limpia la pila',
      help: 'un 2 solo gana la pila al instante y mantiene el turno para quien lo juega',
    },
    passLocks: {
      label: 'Pasar te deja fuera de la baza',
      help: 'variante de paso bloqueado: pasar te elimina del resto de la baza. Por defecto desactivado — pasar solo salta el turno actual, así que puedes volver a entrar si alguien más corona la pila antes de que termine la baza',
    },
    trading: {
      label: 'Intercambio de cartas por roles entre repartos',
      help: 'intercambio de cartas basado en roles entre repartos (necesita 4 o más sillas)',
    },
    targetPoints: {
      label: 'Primero a (puntos)',
      help: 'la partida termina cuando una silla acumula esta cantidad de puntos de posición',
    },
  },
  presets: {
    classic: 'Presidente Clásico',
    rapid: 'Gabinete Rápido',
    marathon: 'Maratón',
  },
};
