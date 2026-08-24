import type { GameCopy } from '../types';

/** Spanish copy for spades. Untranslated fields fall back to the pack's English. */
export const spadesEs: GameCopy = {
  name: 'Picas',
  subtitle: 'el juego de parejas',
  tagline: 'Canta tus bazas',
  description:
    'Siéntate frente a tu compañero, canta un número y consigue esa cantidad de bazas — ni una más, ni una menos si puedes evitarlo. Las picas son siempre triunfo. Las bolsas te encontrarán.',
  facts: ['4 jugadores · 2v2', 'canto · triunfo · bolsas', 'solo o con amigos'],
  howToPlay: {
    summary:
      'El clásico americano de parejas — canta tus bazas, rompe picas y corre hacia los 500.',
    objective:
      'Sentado frente a tu compañero, consigue al menos tantas bazas como hayáis cantado entre los dos. El primer equipo en llegar a la puntuación objetivo (500 por defecto) gana; un empate en la línea o por encima juega otra mano.',
    sections: [
      {
        heading: 'La mesa',
        body: [
          'Cuatro jugadores, dos equipos: tú y el jugador de enfrente sois compañeros. Cada mano reparte el mazo completo de 52 cartas — trece cartas por jugador. Tanto el reparto como el primer canto empiezan a la izquierda del repartidor y avanzan en sentido horario.',
        ],
      },
      {
        heading: 'El canto',
        body: [
          'Cada silla canta un número, una sola vez. No hay paso ni recanto. El contrato de tu equipo es la suma de los dos cantos que no son nil.',
        ],
        bullets: [
          { label: '1–13', text: 'cuántas bazas esperas conseguir' },
          {
            label: 'Nil',
            text: 'un canto aparte — no lleves ninguna baza y ganas +100, o −100 si llevas alguna. Las bazas de un nil fallido no ayudan a tu compañero a cumplir su contrato, pero cada una sigue contando como bolsa',
          },
        ],
      },
      {
        heading: 'Jugar las bazas',
        body: [
          'El jugador a la izquierda del repartidor abre la primera baza. Sigue el palo si puedes; gana la pica más alta, o si no, la carta más alta del palo abierto. Quien gana la baza abre la siguiente.',
        ],
        bullets: [
          {
            label: 'Romper picas',
            text: 'no se puede abrir con una pica hasta que alguien haya fallado con una estando sin ese palo — salvo que en tu mano solo te queden picas',
          },
          {
            label: 'Sin palo',
            text: '¿te has quedado sin el palo abierto? Juega lo que quieras, incluido un triunfo',
          },
        ],
      },
      {
        heading: 'Puntuar una mano',
        body: [
          'Si las sillas del equipo que no cantaron nil consiguen al menos el contrato, el equipo anota 10 puntos por baza cantada más 1 por cada baza de más. Si os quedáis cortos, el contrato cuesta −10 por baza cantada.',
        ],
        bullets: [
          {
            label: 'Bolsas',
            text: 'las bazas de más (y las bazas de un nil fallido) son bolsas. Se arrastran de mano en mano; cada diez bolsas cuestan 100 puntos y las bolsas sobrantes se quedan en la cuenta',
          },
          {
            label: 'Nil',
            text: 'se puntúa aparte, sumado al resultado del contrato del compañero',
          },
        ],
      },
      {
        heading: 'La partida',
        body: [
          'Las manos se acumulan hasta que un equipo alcanza el objetivo (250 / 500 / 750). Gana la puntuación más alta; si ambos equipos llegan al mismo total en la línea o por encima, se reparte otra mano.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: [
          'Los ajustes de la sala solo tocan tres cosas: la puntuación objetivo, si se permite el nil y si cuentan las bolsas. Las mesas clásicas mantienen los valores por defecto. El nil a ciegas no está disponible.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Al pie de la letra',
      description:
        'Picas por parejas a 500, con nil y con bolsas. El juego tal como se juega en cualquier mesa de cocina.',
      facts: ['partida a 500', 'nil · bolsas', '~25 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Primero en llegar a 250',
      description:
        'Las mismas reglas, carrera más corta — 250 puntos y se acabó. Una partida entera en el rato de la comida.',
      facts: ['partida a 250', 'nil · bolsas', '~12 min'],
    },
    'clean-books': {
      name: 'Bazas limpias',
      tagline: 'Sin bolsas',
      description:
        'Cumple tu canto o cae en falta — las bazas de más no son bolsas y no suman puntos. Precisión antes que relleno.',
      facts: ['partida a 500', 'nil activo', 'bolsas desactivadas'],
    },
  },
  fields: {
    targetScore: {
      label: 'Partida a',
      help: 'Después de cada mano, gana el equipo más alto en la línea o por encima de esta puntuación. Si empatan, se juega otra mano.',
      group: 'Partida',
      options: {
        '250': '250 — corte rápido',
        '500': '500 — estándar',
        '750': '750 — partida larga',
      },
    },
    nil: {
      label: 'Permitir nil',
      help: 'Un canto de cero es nil: no lleves ninguna baza y ganas +100, o −100 si llevas alguna. Las bazas de un nil fallido no ayudan al contrato del compañero.',
      group: 'Canto',
    },
    bags: {
      label: 'Contar bolsas',
      help: 'Las bazas de más y las bazas de un nil fallido son bolsas. Cada diez bolsas cuestan 100 puntos; las bolsas sobrantes se quedan en la cuenta.',
      group: 'Puntuación',
    },
  },
  presets: {
    classic: 'Clásico',
    quick: 'Rápida',
    'clean-books': 'Bazas limpias',
  },
};
