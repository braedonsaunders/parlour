import type { GameCopy } from '../types';

/** Spanish copy for cribbage. Untranslated fields fall back to the pack's English. */
export const cribbageEs: GameCopy = {
  name: 'Cribbage',
  subtitle: 'la carrera de las clavijas',
  tagline: 'Clava hasta el 121',
  description:
    'La clásica carrera de bar — forma quinces, escaleras y parejas en tu mano, clávalas en el clavijero y reza para que nadie corte una jota detrás de ti.',
  facts: ['2 jugadores', 'clásico · despiadado', 'solo o con amigos'],
  howToPlay: {
    summary:
      'La clásica carrera de bar — forma combinaciones que puntúan en tu mano y clávalas hasta el 121.',
    objective:
      'Sé el primero en clavar 121 puntos en el clavijero. Los puntos llegan dos veces: al jugar cartas en la mesa (clavando) y al contar tu mano y la cuna en el recuento.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Se te reparten seis cartas. Quédate con cuatro y desliza dos boca abajo hacia LA CUNA — una mano extra que puntúa para quien reparte esta vez.',
          'Descarta con generosidad cuando la cuna es tuya, y a la defensiva cuando es de tu rival.',
        ],
      },
      {
        heading: 'El corte',
        body: [
          'Quien reparte corta el mazo para revelar la carta de arranque, compartida por todas las manos.',
          'Cortar una jota puntúa SUS TALONES — dos puntos para quien reparte, al instante.',
        ],
      },
      {
        heading: 'El clavado',
        body: [
          'Empezando a la izquierda de quien reparte, los jugadores se turnan para poner una carta cada uno, llevando una cuenta acumulada de los valores (las figuras valen 10). Nunca puedes hacer que la cuenta pase de 31.',
          'Puntúa mientras juegas:',
        ],
        bullets: [
          {
            label: 'Quince',
            text: 'tu carta hace que la cuenta llegue exactamente a 15 — 2 puntos',
          },
          {
            label: 'Pareja / trío / póker',
            text: 'iguala el rango de la carta anterior — 2 / 6 / 12 puntos',
          },
          {
            label: 'Escalera',
            text: 'tres o más cartas en secuencia, sin importar el orden — 1 punto por carta',
          },
          {
            label: 'Treinta y uno',
            text: 'tu carta hace que la cuenta llegue exactamente a 31 — 2 puntos',
          },
          {
            label: 'Paso y última carta',
            text: 'si nadie puede jugar por debajo de 31, quien jugó la última carta anota 1 punto y la cuenta se reinicia',
          },
        ],
      },
      {
        heading: 'El recuento',
        body: [
          'Después del clavado, todos cuentan en voz alta: primero la mano de quien no reparte, luego la de quien reparte, y por último la cuna. La carta de arranque cuenta como una quinta carta.',
        ],
        bullets: [
          { label: 'Quinces', text: 'cada combinación de cartas que suma 15 — 2 puntos cada una' },
          { label: 'Parejas', text: 'una pareja 2, un trío 6, un póker 12' },
          {
            label: 'Escaleras',
            text: 'las secuencias puntúan por carta; las escaleras dobles se multiplican (7-7-8-9 = 12)',
          },
          {
            label: 'Color',
            text: 'cuatro cartas del mismo palo en tu MANO puntúan 4, cinco si la de arranque hace juego. En LA CUNA solo cuenta un color de las cinco cartas.',
          },
          { label: 'Su jota', text: 'una jota del palo de la carta de arranque — 1 punto' },
        ],
      },
      {
        heading: 'Victoria y zurras',
        body: [
          'El primero en llegar a 121 gana, incluso a mitad de un conteo. Quien reparte cambia en cada mano.',
          'Con la regla de la zurra activada, el perdedor que termine por debajo de 90 queda ZURRADO — una humillación en toda regla, para saborear.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: ['Los ajustes de la sala llevan las discusiones de bar:'],
        bullets: [
          {
            label: 'Zurras',
            text: 'señala a los perdedores por debajo de 90 (activado por defecto)',
          },
          {
            label: 'Muggins',
            text: 'si no reclamas los puntos que ganaste en la mesa, tu rival puede robártelos (desactivado por defecto) — ¡reclama a tiempo!',
          },
        ],
      },
    ],
  },
  modes: {
    'classic-pub': {
      name: 'Clásica de bar',
      tagline: 'El auténtico',
      description:
        'Seis cartas, dos a la cuna, y una larga carrera de clavijas hasta el 121. Las zurras cuentan — termina por debajo de 90 y te lo recordarán para siempre.',
      facts: ['carrera a 121', 'línea de zurra en 90', '~10–15 min'],
    },
    cutthroat: {
      name: 'Despiadado',
      tagline: 'Muggins vigila',
      description:
        'La misma carrera, con garras más afiladas: si no reclamas tus puntos en la mesa, tu rival se los queda.',
      facts: ['muggins activado', 'roba puntos no reclamados', 'sin piedad'],
    },
    'match-play': {
      name: 'Mejor de tres',
      tagline: 'Al mejor de tres mangas',
      description:
        'Una velada como debe ser: corre hasta el 121, reinicia las clavijas, y repite. El primero en ganar dos mangas completas se lleva la partida.',
      facts: ['primero a 2 mangas', 'el reparto alterna', '~25–40 min'],
    },
  },
  fields: {
    skunks: {
      label: 'Línea de zurra en 90',
    },
    muggins: {
      label: 'Muggins (roba puntos no reclamados)',
    },
    gamesToWin: {
      label: 'Mangas para ganar',
    },
  },
  presets: {
    'classic-pub': 'Clásica de bar',
    cutthroat: 'Despiadado',
    'match-play': 'Mejor de tres',
    friendly: 'Amistosa',
  },
};
