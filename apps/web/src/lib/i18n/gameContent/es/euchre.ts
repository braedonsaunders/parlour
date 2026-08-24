import type { GameCopy } from '../types';

/** Spanish copy for euchre. Untranslated fields fall back to the pack's English. */
export const euchreEs: GameCopy = {
  name: 'Euchre',
  subtitle: 'el juego de parejas',
  tagline: 'Gana bazas para tu equipo',
  description:
    'Acepta el triunfo, nombra tu palo y persigue a los jacks con el jugador de enfrente. El primer equipo en llegar a diez gana la partida.',
  facts: ['4 jugadores · 2v2', 'juego de bazas', 'solo o con amigos'],
  howToPlay: {
    summary: 'El clásico de parejas — nombra el triunfo y corre con tu equipo hasta los 10 puntos.',
    objective:
      'Sentado frente a tu compañero, gana al menos tres de las cinco bazas de cada mano haciendo rey de la mesa a tu palo cantado. El primer equipo en llegar a la puntuación objetivo gana la partida.',
    sections: [
      {
        heading: 'La mesa',
        body: [
          'Cuatro jugadores, dos equipos: tú y el jugador de enfrente sois compañeros. Cinco cartas cada uno; las cuatro últimas forman el descarte, con su carta superior boca arriba.',
        ],
      },
      {
        heading: 'Aceptar el triunfo — primera ronda de puja',
        body: [
          'Empezando a la izquierda del repartidor, cada uno acepta o pasa la carta boca arriba:',
        ],
        bullets: [
          {
            label: 'Aceptar el triunfo',
            text: 'ese palo pasa a ser triunfo, el repartidor recoge la carta en su mano y entierra una boca abajo',
          },
          {
            label: 'Ir en solitario',
            text: 'toma el triunfo y manda a tu compañero al banquillo para esta mano',
          },
          { label: 'Pasar', text: 'la decisión avanza a la izquierda' },
        ],
      },
      {
        heading: 'Nombrar el triunfo — segunda ronda',
        body: [
          'Si los cuatro pasan, la carta boca arriba se entierra y cada silla puede nombrar cualquier otro palo como triunfo. El palo descartado queda fuera de juego.',
          'Obligar al repartidor (por defecto): si todos los demás pasan en la segunda ronda, el repartidor debe cantar un palo.',
        ],
      },
      {
        heading: 'Los jacks',
        body: [
          'Cuando se nombra un palo, su jack es el JACK MAYOR — la carta más alta en juego. El jack del palo del mismo color es el JACK MENOR, solo por debajo del jack mayor, y cuenta como triunfo. Así, con corazones como triunfo, J♥ y luego J♦ son las dos cartas dominantes.',
        ],
      },
      {
        heading: 'Jugar las bazas',
        body: [
          'El jugador a la izquierda del repartidor abre. Debes seguir el palo abierto si puedes — recuerda que el jack menor pertenece al triunfo, no a su palo impreso. Gana la carta más alta del palo abierto, salvo que alguien juegue triunfo; el triunfo más alto se lleva todo. El ganador abre la siguiente.',
        ],
      },
      {
        heading: 'Puntuar una mano',
        body: ['El equipo que cantó es el de los HACEDORES. Tras las cinco bazas:'],
        bullets: [
          { label: '3 o 4 bazas', text: 'los hacedores anotan 1 punto' },
          { label: '5 bazas', text: 'una marcha — los hacedores anotan 2' },
          {
            label: 'Marcha en solitario',
            text: 'las cinco bazas yendo en solitario — los hacedores anotan 4',
          },
          {
            label: '¡Euchred!',
            text: 'los hacedores ganan menos de tres bazas — los defensores anotan 2',
          },
        ],
      },
      {
        heading: 'Ir en solitario',
        body: [
          'Un jugador con confianza puede jugar sin su compañero, que se queda fuera de la mano por completo. Ganar las cinco en solitario vale 4 puntos — pero si consigues menos de tres, la defensa igualmente te deja en euchre por 2.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: [
          'Los ajustes de la sala afinan la partida: juego a 5/10/15, obligar al repartidor activado o no, y si se permite ir en solitario. Cuando una mano entera se descarta sin que nadie cante triunfo, el reparto simplemente pasa a la izquierda.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Pub clásico',
      tagline: 'La cosa de verdad',
      description:
        'Diez puntos, obligar al repartidor, ir en solitario. El juego tal como se juega en cualquier salón y mesa de cocina.',
      facts: ['partida a 10', 'obliga al repartidor', '~20 min'],
    },
    'quick-cut': {
      name: 'Corte rápido',
      tagline: 'Primero a cinco',
      description:
        'Las mismas reglas, carrera más corta — cinco puntos y se acabó. Perfecto mientras se calienta la tetera.',
      facts: ['partida a 5', '~10 min'],
    },
    'long-game': {
      name: 'Partida larga',
      tagline: 'Acomódate',
      description: 'Quince puntos para una tarde entera. Las rencillas son bienvenidas.',
      facts: ['partida a 15', '~30 min'],
    },
    'old-school': {
      name: 'A la antigua',
      tagline: 'El repartidor puede pasar',
      description:
        'Sin obligar al repartidor — todos pueden pasar y el reparto sigue adelante. Como insisten algunos abuelos.',
      facts: ['partida a 10', 'sin obligar', '~20 min'],
    },
  },
  fields: {
    targetScore: {
      label: 'Partida a',
      group: 'Partida',
      options: {
        '5': '5 — corte rápido',
        '10': '10 — estándar',
        '15': '15 — partida larga',
      },
      help: 'La primera pareja en llegar a esta puntuación gana la partida.',
    },
    stickDealer: {
      label: 'Obligar al repartidor',
      group: 'Puja',
      help: 'En la segunda ronda de puja, el repartidor debe cantar un palo cuando todos los demás pasan.',
    },
    goingAlone: {
      label: 'Permitir ir en solitario',
      group: 'Puja',
      help: 'Un jugador con una mano espectacular puede mandar a su compañero al banquillo durante esa mano.',
    },
  },
  presets: {
    classic: 'Pub clásico',
    'quick-cut': 'Corte rápido',
    'long-game': 'Partida larga',
    'old-school': 'A la antigua',
  },
};
