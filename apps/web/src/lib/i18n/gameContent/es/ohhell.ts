import type { GameCopy } from '../types';

/** Spanish copy for ohhell. Untranslated fields fall back to the pack's English. */
export const ohhellEs: GameCopy = {
  name: 'Oh Hell',
  subtitle: 'el juego de las predicciones',
  tagline: 'Canta tus bazas. Llévate justo esas.',
  description:
    'Las manos crecen y menguan en cada ronda mientras predices el número exacto de bazas que te vas a llevar. La regla del repartidor garantiza que alguien falle — procura que no seas tú.',
  facts: ['3–7 jugadores', 'predicción · triunfo · exacto', 'solo o con amigos'],
  howToPlay: {
    summary:
      'Predice el número exacto de bazas que vas a llevarte, ni una más ni una menos. El mazo mengua y crece en cada ronda, hasta que alguien predice más bazas de las que la mesa puede repartir.',
    objective:
      'A lo largo de una partida de manos que crecen y luego menguan, consigue más puntos que nadie cumpliendo tu predicción con exactitud. En cada ronda, un jugador está matemáticamente condenado a fallar — procura que no seas tú.',
    sections: [
      {
        heading: 'La mesa',
        body: [
          'De tres a siete jugadores, cada uno por su cuenta. Una partida es una secuencia de rondas: la primera reparte una carta a cada uno, luego las manos crecen hasta un máximo (limitado para que siempre quede una carta que voltear como triunfo) y vuelven a bajar hasta una. El reparto rota en sentido horario en cada ronda.',
        ],
      },
      {
        heading: 'La vuelta',
        body: [
          'Después del reparto, se voltea boca arriba la siguiente carta del mazo — su palo es el triunfo de la ronda.',
        ],
        bullets: [
          {
            label: 'Sin carta que voltear',
            text: 'cuando el reparto agota el mazo entero no queda nada que voltear y la ronda se juega sin triunfo',
          },
          {
            label: 'Cortar triunfo',
            text: 'las mesas con "cortar triunfo" activado reducen en una carta la ronda de mazo completo, así aún se puede cortar un triunfo desde el fondo',
          },
        ],
      },
      {
        heading: 'La predicción',
        body: [
          'Empezando a la izquierda del repartidor y siguiendo el sentido horario, cada silla canta un número entre 0 y el tamaño de su mano: exactamente cuántas bazas dice que se llevará. No hay paso ni segunda oportunidad.',
        ],
        bullets: [
          {
            label: 'La regla del repartidor',
            text: 'el repartidor canta EN ÚLTIMO LUGAR y no puede hacer que la suma de las predicciones iguale las bazas disponibles: el repartidor no puede empatar, así que alguien en la mesa está condenado a fallar. La predicción prohibida sencillamente no está disponible',
          },
          {
            label: 'Cero',
            text: 'una predicción legal como cualquier otra: no llevarte ninguna baza',
          },
        ],
      },
      {
        heading: 'Jugar las bazas',
        body: [
          'El jugador a la izquierda del repartidor abre la primera baza. Sigue el palo si puedes; gana el triunfo más alto, o si no hay triunfo, la carta más alta del palo abierto. Quien gana la baza abre la siguiente.',
        ],
      },
      {
        heading: 'Puntuar una ronda',
        body: [
          'Cumple tu predicción EXACTAMENTE o no sumas nada (por defecto). La puntuación de cada silla en la ronda se suma a su total acumulado; tras la última ronda del arco, gana el total más alto.',
        ],
        bullets: [
          {
            label: 'Solo exacto',
            text: 'acertar exactamente da 10 + la predicción; cualquier otra cosa da 0',
          },
          {
            label: 'Penalización',
            text: 'acertar exactamente da 10 + la predicción; fallar cuesta menos la diferencia de tu fallo',
          },
          {
            label: 'Más uno',
            text: 'acertar exactamente da el doble de tu predicción; cualquier otra cosa da 0',
          },
        ],
      },
      {
        heading: 'Variante Mago',
        body: [
          'Con Magos y Bufones activados, cuatro Magos y cuatro Bufones se unen al mazo (60 cartas) y alteran el orden habitual de las cosas.',
        ],
        bullets: [
          {
            label: 'Mago',
            text: 'gana a todo; el PRIMER Mago jugado se lleva la baza. Si lo abres, la baza queda sin palo abierto — cualquiera puede jugar lo que quiera',
          },
          {
            label: 'Bufón',
            text: 'pierde contra todo; si todas las cartas de una baza son Bufones, gana el primero jugado. Si lo abres, el palo abierto lo define la siguiente carta real',
          },
          {
            label: 'Vuelta de triunfo',
            text: 'si se voltea un Mago, el REPARTIDOR elige el triunfo; si se voltea un Bufón, la ronda se juega sin triunfo',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Sube y baja',
      description:
        'El arco clásico: una carta, sube hasta un máximo, y vuelve a bajar hasta una. Regla del repartidor activada, solo predicciones exactas. Alguien falla en cada ronda; ojalá no seas tú.',
      facts: ['manos 1…máximo…1', 'regla del repartidor activada', '~20 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Reparte mucho, reduce rápido',
      description:
        'Empieza con cinco cartas y baja directo hasta una. Toda una partida en diez minutos, puro nervio y sin relleno.',
      facts: ['manos 5→1', '~10 min'],
    },
    wizard: {
      name: 'Mago',
      tagline: 'Sesenta cartas, cuatro certezas',
      description:
        'Cuatro Magos ganan siempre y cuatro Bufones nunca lo hacen. El palo abierto se dobla a su alrededor y el repartidor a veces elige el triunfo. El caos, formalizado.',
      facts: ['mazo de 60 cartas', 'magos activados'],
    },
  },
  fields: {
    handSize: {
      label: 'Cartas en mano',
      help: 'Cartas repartidas a cada jugador en esta ronda. Una partida completa lo ajusta automáticamente en cada ronda.',
      group: 'Partida',
    },
    dealer: {
      label: 'Silla del repartidor',
      help: 'Silla que reparte esta ronda y canta en último lugar. Una partida completa rota el reparto en cada ronda.',
      group: 'Partida',
    },
    handArc: {
      label: 'Arco de manos',
      help: 'Cómo cambia el tamaño de las manos a lo largo de la partida: sube y luego baja, solo sube, o reparte mucho y reduce.',
      group: 'Partida',
      options: {
        updown: 'Sube y baja — 1…máximo…1',
        up: 'Solo sube — 1…máximo',
        down: 'Solo baja — máximo…1',
      },
    },
    maxHand: {
      label: 'Mano más grande',
      help: 'El arco nunca reparte más que esto — limitado para que en cada ronda quede una carta que voltear como triunfo.',
      group: 'Partida',
    },
    hookRule: {
      label: 'Regla del repartidor',
      help: 'El repartidor no puede empatar: la última predicción no puede hacer que el total iguale exactamente las bazas disponibles, así que siempre falla alguien.',
      group: 'Predicción',
    },
    scoring: {
      label: 'Puntuación',
      help: 'Cumple tu predicción con exactitud para puntuar. Los esquemas difieren en lo que cuesta fallar.',
      group: 'Puntuación',
      options: {
        exactOnly: 'Solo exacto — 10 + predicción o nada',
        penalty: 'Penalización — fallas por n, pierdes n',
        plusOne: 'Más uno — el doble de la predicción si aciertas',
      },
    },
    wizards: {
      label: 'Magos y bufones',
      help: 'Añade cuatro Magos (ganan siempre) y cuatro Bufones (pierden siempre) — un mazo de 60 cartas.',
      group: 'Avanzado',
    },
    trumpOnLastRound: {
      label: 'Cortar triunfo en rondas de mazo completo',
      help: 'Cuando una ronda repartiría el mazo entero, corta antes un triunfo desde el fondo (las manos se reducen en una carta) en lugar de jugar sin triunfo.',
      group: 'Avanzado',
    },
  },
  presets: {
    classic: 'Clásico',
    quick: 'Rápida',
    wizard: 'Mago',
  },
};
