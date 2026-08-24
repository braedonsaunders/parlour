import type { GameCopy } from '../types';

/** Spanish copy for scopa. Untranslated fields fall back to the pack's English. */
export const scopaEs: GameCopy = {
  name: 'Scopa',
  subtitle: 'el juego de pesca',
  tagline: 'Barre la mesa',
  description:
    'Captura cartas de la mesa por igualdad o por suma, acapara las monedas de oro y ve a por el settebello. Deja la mesa limpia del todo y cántala como scopa: la palabra más dulce en las salas de cartas italianas.',
  facts: ['2–6 jugadores', 'capturar · sumar', 'solo o con amigos'],
  howToPlay: {
    summary:
      'El clásico italiano de pesca: captura cartas de la mesa y déjala limpia para hacer scopa.',
    objective:
      'Captura cartas de la mesa igualando o sumando su valor. Más cartas, más monedas, el settebello, la primiera y cada scopa suman un punto; la primera en llegar al objetivo (11 por defecto) gana la partida.',
    sections: [
      {
        heading: 'La mesa',
        body: [
          'Scopa se juega con una baraja italiana de 40 cartas: Denari (monedas), Coppe (copas), Spade (espadas) y Bastoni (bastos), del 1 al 10. Pueden jugar dos, tres, cuatro o seis personas; a cuatro y a seis os sentáis en parejas fijas, alternando asientos alrededor de la mesa.',
          'Cada reparto da tres cartas a cada jugador y coloca cuatro boca arriba sobre la mesa. Si aparecen tres o más Reyes en el tablero inicial, se baraja de nuevo y se reparte otra vez.',
        ],
      },
      {
        heading: 'Capturar',
        body: [
          'En tu turno juegas exactamente una carta de tu mano. Las cartas capturan solo por número: el palo nunca importa.',
        ],
        bullets: [
          {
            label: 'Igualar',
            text: 'tu carta se lleva una sola carta de la mesa del mismo valor: un 5 se lleva un 5',
          },
          {
            label: 'Elegir',
            text: 'si dos cartas de la mesa comparten ese valor, eliges cuál te llevas — elige con cuidado, lo que queda importa',
          },
          {
            label: 'Sumar',
            text: 'tu carta puede llevarse dos o más cartas de la mesa que sumen su valor: un 8 se lleva un 3 y un 5. Pero si existe una captura simple DEBES hacerla — las combinaciones solo valen cuando no hay ninguna igualdad disponible',
          },
          {
            label: 'Dejar',
            text: '¿nada encaja? Tu carta se queda en la mesa, boca arriba y a disposición de cualquiera',
          },
        ],
      },
      {
        heading: 'Scopa',
        body: [
          'Si barres todas las cartas que quedan en la mesa en una sola captura, haces una scopa: un punto, anotado al instante. Una scopa en la última carta del último reparto no cuenta — esas cartas se barren de todos modos. Cuando las manos se vacían, se reparten tres cartas nuevas a cada jugador; la mesa nunca se reabastece. Cuando se agota el mazo, el último jugador que capturó se lleva las cartas que queden en la mesa, y esa barrida no es una scopa.',
        ],
      },
      {
        heading: 'Puntuar una ronda',
        body: [
          'Tras el último reparto se reparten cuatro puntos, más las scopas que se hayan hecho. En las mesas por parejas, las capturas del equipo se juntan antes de puntuar.',
        ],
        bullets: [
          {
            label: 'Carte',
            text: 'más cartas capturadas — 21 o más de las 40 en partidas a dos; un empate no da el punto a nadie',
          },
          {
            label: 'Denari',
            text: 'más monedas capturadas — 6 o más de las 10; un empate no da el punto a nadie',
          },
          { label: 'Settebello', text: 'quien capturó el hermoso 7 de monedas suma 1, siempre' },
          {
            label: 'Primiera',
            text: 'la mejor carta de cada palo, sumadas — el 7 vale 21, el 6 vale 18, el As 16, el 5 → 15, el 4 → 14, el 3 → 13, el 2 → 12, y las figuras solo 10. Si no tienes ninguna carta de algún palo, no puedes ganarla. El total más alto se lleva 1 punto; los empates no dan el punto a nadie',
          },
          { label: 'Scope', text: 'un punto por cada una, ya anotado durante la partida' },
        ],
      },
      {
        heading: 'La partida',
        body: [
          'Las rondas se repiten — la mano de repartir pasa a la izquierda cada vez — hasta que alguien supera la puntuación objetivo. Si dos bandos empatan justo en la línea, otra ronda lo decide.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: [
          'Los ajustes de la sala exponen los mandos clásicos: el objetivo (11/16/21), Scopone (mazo entero repartido, sin robo), Napola (una bonificación por escalera de monedas), Re di denari (una bonificación por el Rey de monedas) y la visualización con palos franceses, que es puramente visual.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásica',
      tagline: 'La primera a 11',
      description:
        'Scopa tal como se juega en cualquier bar italiano: tres cartas cada vez, cuatro puntos por ronda, la primera a once.',
      facts: ['partida a 11', 'repartos de 3 cartas', '~20 min'],
    },
    lungo: {
      name: 'Lungo',
      tagline: 'La partida larga',
      description:
        'Las mismas reglas, carrera hasta veintiuno. Espacio para remontadas, rencillas y scopas legendarias.',
      facts: ['partida a 21', 'repartos de 3 cartas', '~40 min'],
    },
    scopone: {
      name: 'Scopone',
      tagline: 'Mazo entero, sin piedad',
      description:
        'El clásico de toda la vida a cuatro manos: diez cartas repartidas de golpe a cada uno, sin mazo de robo, sin nada oculto. Cada captura es un compromiso.',
      facts: ['4 jugadores · 2 contra 2', 'mazo entero', '~30 min'],
    },
  },
  fields: {
    target: {
      label: 'Partida a',
      group: 'Partida',
      help: 'Tras cada ronda gana quien tenga la puntuación más alta en esta línea o por encima. Un empate en la línea reparte otra ronda.',
      options: {
        '11': '11 — clásica',
        '16': '16 — larga',
        '21': '21 — lungo',
      },
    },
    scopone: {
      label: 'Scopone',
      group: 'Reparto',
      help: 'El clásico de toda la vida a cuatro manos: se reparte todo el mazo de golpe y no hay mazo de robo. Capturar se vuelve mucho más ajustado.',
    },
    napola: {
      label: 'Napola',
      group: 'Puntuación',
      help: 'Ten el As, el 2 y el 3 de monedas para 3 puntos extra, más 1 más por cada carta de monedas que continúe la escalera (4, 5, …).',
    },
    reDenari: {
      label: 'Re di denari',
      group: 'Puntuación',
      help: 'Un punto extra para quien capture el Rey de monedas.',
    },
    frenchSuits: {
      label: 'Visualización con palos franceses',
      group: 'Mesa',
      help: 'Muestra monedas/copas/espadas como diamantes/corazones/picas para que se vea la baraja estándar. Puramente visual: los identificadores y las reglas siguen en italiano.',
    },
  },
  presets: {
    classic: 'Clásica',
    lungo: 'Lungo',
    'scopone-preset': 'Scopone',
  },
};
