import type { GameCopy } from '../types';

/** Spanish copy for pinochle. Untranslated fields fall back to the pack's English. */
export const pinochleEs: GameCopy = {
  name: 'Pinacle',
  subtitle: 'el juego de parejas',
  tagline: 'Puja, declara y hazte con las bazas',
  description:
    'Siéntate frente a tu compañero, gana la subasta, nombra el triunfo y declara tu juego. Ases, dieces y reyes son las cartas que cuentan — cumple tu puja o te quedas corto y lo pagas.',
  facts: ['4 jugadores · 2v2', 'puja · declaración · bazas', 'solo o con amigos'],
  howToPlay: {
    summary:
      'El clásico americano de parejas — puja, nombra el triunfo, declara tu juego y juega las bazas.',
    objective:
      'Sentado frente a tu compañero, gana la subasta y cumple tu puja — declaración más puntos de baza al menos iguales a lo que cantaste. El primer equipo en llegar a la puntuación objetivo tras una mano completa gana la partida.',
    sections: [
      {
        heading: 'La mesa',
        body: [
          'Cuatro jugadores, dos equipos: tú y el jugador de enfrente sois compañeros. Cada mano reparte el mazo doble completo de 48 cartas — doce para cada uno, sin viuda. El reparto rota a la izquierda en cada mano.',
        ],
      },
      {
        heading: 'La puja',
        body: [
          'Empezando a la izquierda del repartidor, cada silla pasa o puja más alto que la puja anterior. Una vez que pasas, quedas fuera de la mano. La última silla con una puja en pie gana la subasta y nombra el triunfo. Si todos pasan sin que nadie puje, la mano se descarta y se reparte de nuevo con el mismo repartidor.',
        ],
        bullets: [
          {
            label: 'Puja inicial',
            text: 'debe superar el mínimo de la mesa (25 en el modo Clásico)',
          },
          { label: 'Subidas', text: 'cualquier entero más alto, hasta un tope de 60' },
        ],
      },
      {
        heading: 'La declaración',
        body: [
          'Una vez nombrado el triunfo, cada silla declara su juego para sumar puntos. Las cartas se quedan en la mano — declarar es puntuar, no descartar — y la mesa lo calcula por ti, así que nadie puede declarar de más.',
        ],
        bullets: [
          { label: 'Escalera de triunfo', text: 'As-10-Rey-Reina-Jota de triunfo, 15 puntos' },
          {
            label: 'Matrimonio',
            text: 'Rey + Reina de un palo — 4 si es triunfo (2 más si es una segunda pareja además de la escalera), 2 si no lo es',
          },
          {
            label: 'Pinacle',
            text: 'Reina de picas + Jota de diamantes vale 4; tener ambas copias de cada una es un doble pinacle que vale 30',
          },
          {
            label: 'Rondas',
            text: 'una carta de un valor en los cuatro palos — Ases 10, Reyes 8, Reinas 6, Jotas 4',
          },
          { label: 'Dix', text: 'cada 9 de triunfo que tengas vale 1' },
        ],
      },
      {
        heading: 'Jugar las bazas',
        body: [
          'El pujador abre la primera baza. Debes seguir el palo si puedes; el triunfo vence a un palo abierto que no sea triunfo, y si no, gana la carta más alta. As, diez y rey valen 10 puntos cada uno al capturarlos en una baza; la última baza vale 10 más. El ganador de una baza abre la siguiente.',
        ],
      },
      {
        heading: 'Puntuar una mano',
        body: [
          'Suma la declaración del equipo pujador a los puntos de baza que consiguió. Si cumple la puja, se anota el total completo. Si se queda corto, se queda en contra — pierde exactamente el valor de la puja, declaración incluida. El otro equipo siempre anota sus propios puntos de baza, y también su declaración salvo que la mesa lo haya desactivado.',
        ],
      },
      {
        heading: 'La partida',
        body: [
          'Las manos se acumulan hasta que un equipo llega al objetivo (100 / 150 / 500). Si ambos equipos lo superan en la misma mano, el equipo pujador gana la partida directamente salvo que se haya quedado corto — en ese caso pierde el desempate frente a la puntuación más alta, y el pujador gana cualquier empate restante.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: [
          'Los ajustes de la sala cambian la puntuación objetivo, la puja mínima de apertura y si los rivales anotan su declaración. Las mesas Clásicas mantienen los valores por defecto.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Partida a 150',
      description:
        'Pinacle de parejas a 150, puja mínima de apertura 25. El juego tal como se juega en cualquier mesa de cocina.',
      facts: ['partida a 150', 'puja mín. 25', '~30 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Primero a 100',
      description:
        'Las mismas reglas, carrera más corta — 100 puntos, puja de apertura más baja, se acaba antes.',
      facts: ['partida a 100', 'puja mín. 20', '~15 min'],
    },
    marathon: {
      name: 'Maratón',
      tagline: 'Partida a 500',
      description:
        'Una larga batalla de parejas hasta 500 — cada declaración y cada puja fallida cuentan.',
      facts: ['partida a 500', 'puja mín. 25', '~90 min'],
    },
  },
  fields: {
    target: {
      label: 'Partida a',
      group: 'Partida',
      help: 'Tras cada mano, la primera pareja que llegue a esta puntuación o la supere gana.',
      options: {
        '100': '100 — rápida',
        '150': '150 — clásica',
        '500': '500 — maratón',
      },
    },
    minBid: {
      label: 'Puja mínima',
      group: 'Puja',
      help: 'La puja de apertura de la subasta debe superar este mínimo. Cada puja posterior debe superar a la anterior, hasta 60.',
    },
    opponentsScoreMeld: {
      label: 'Los rivales anotan declaración',
      group: 'Puntuación',
      help: 'Si está desactivado, el equipo que no puja solo anota los puntos de baza que consiga — no su declaración.',
    },
  },
  presets: {
    classic: 'Clásico',
    quick: 'Rápida',
    marathon: 'Maratón',
  },
};
