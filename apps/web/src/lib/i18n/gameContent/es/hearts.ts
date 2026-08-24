import type { GameCopy } from '../types';

/** Spanish copy for hearts. Untranslated fields fall back to the pack's English. */
export const heartsEs: GameCopy = {
  name: 'Corazones',
  subtitle: 'el juego de la evasión',
  tagline: 'Evita los corazones',
  description:
    'Esquiva todos los corazones, elude a la Dama Negra y deja que otro cargue con los puntos. Pases rotativos, elecciones secretas, una reina muy afilada.',
  facts: ['4 jugadores', 'pasar · baza · esquivar', 'solo o con amigos'],
  howToPlay: {
    summary:
      'El clásico juego de evasión: no te lleves corazones, esquiva a la Dama Negra y deja que otro cargue con los puntos.',
    objective:
      'Termina la partida con la puntuación más baja. Cada corazón que captures cuesta 1 punto y la reina de picas cuesta 13; cuando alguien supera el límite de fin de partida (100 por defecto), gana quien tenga el total más bajo.',
    sections: [
      {
        heading: 'El pase',
        body: [
          'Antes de cada mano eliges tres cartas y se las pasas a un vecino de mesa: todos eligen en secreto y los cuatro pases llegan a la vez.',
          'La dirección rota en cada mano: izquierda, derecha, enfrente y luego una mano sin pase.',
        ],
      },
      {
        heading: 'Jugar las bazas',
        body: [
          'El dos de tréboles abre la primera baza. Sigue el palo si puedes; la carta más alta del palo jugado se lleva la baza y su ganador sale en la siguiente.',
        ],
        bullets: [
          {
            label: 'Primera baza',
            text: 'no se pueden tirar cartas de penalización en ella (regla de la casa opcional)',
          },
          {
            label: 'Romper corazones',
            text: 'los corazones no pueden salir hasta que se haya descartado uno en una baza anterior, a menos que tu mano sea solo corazones',
          },
          {
            label: 'Sin palo',
            text: '¿te quedaste sin el palo jugado? Tira lo que quieras: aquí es donde la reina le cae a alguien',
          },
        ],
      },
      {
        heading: 'Puntuar una mano',
        body: [
          'Cuando se juegan las trece bazas, cada corazón que capturaste vale 1 punto y la reina de picas vale 13.',
        ],
        bullets: [
          {
            label: 'Jota de diamantes',
            text: 'regla de la casa opcional: da −10 a quien la capture',
          },
          {
            label: 'Cazar la luna',
            text: 'captura los trece corazones y la reina y tú sumas cero mientras los demás se llevan +26; o, con la otra regla de la casa, tu propia puntuación baja 26',
          },
        ],
      },
      {
        heading: 'La partida',
        body: [
          'Las manos se acumulan hasta que alguien cruza el límite de fin de partida (50 / 75 / 100). El total más bajo gana la partida; los empates comparten la corona.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: [
          'Los ajustes de la sala controlan todo: la dirección del pase, las manos sin pase, la protección de la primera baza, la jota de diamantes, el límite de fin de partida y el cambio de la luna. Las mesas clásicas mantienen los valores por defecto.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Al pie de la letra',
      description:
        'Pases rotativos izquierda-derecha-enfrente, una mano sin pase cada cuarto reparto, sin puntos en la primera baza. Partida a 100.',
      facts: ['partida a 100', 'manos sin pase activas', '~15 min'],
    },
    quickcut: {
      name: 'Corte Rápido',
      tagline: 'Los mismos corazones, más rápido',
      description:
        'Reglas idénticas, techo más bajo: el primero en pasar de 50 termina la partida. Un partido entero en lo que dura un café.',
      facts: ['partida a 50', 'manos sin pase activas', '~8 min'],
    },
    cutthroat: {
      name: 'Despiadado',
      tagline: 'La jota anda suelta',
      description:
        'La jota de diamantes da −10 a quien la capture, y las cartas de penalización vuelan desde la primera baza. Nadie está a salvo.',
      facts: ['J♦ −10', 'puntos en la primera baza', 'partida a 100'],
    },
  },
  fields: {
    passDirection: {
      label: 'Pasar cartas',
      options: {
        left: 'Izquierda',
        right: 'Derecha',
        across: 'Enfrente',
        hold: 'Retener (sin pase)',
      },
    },
    holdHand: {
      label: 'Mano sin pase cada cuarto reparto',
    },
    noPointsFirstTrick: {
      label: 'Sin cartas de penalización en la primera baza',
    },
    jackDiamonds: {
      label: 'La jota de diamantes puntúa −10',
    },
    gameOver: {
      label: 'La partida termina en',
      options: {
        '50': '50 puntos',
        '75': '75 puntos',
        '100': '100 puntos',
      },
    },
    moonShift: {
      label: 'Cazar la luna',
      options: {
        opponents: '+26 para los demás',
        self: '−26 de tu propia puntuación',
      },
    },
  },
  presets: {
    classic: 'Corazones Clásico',
    quickcut: 'Corte Rápido',
    cutthroat: 'Despiadado',
  },
};
