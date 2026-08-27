import type { GameCopy } from '../types';

/** Spanish copy for durak. Untranslated fields fall back to the pack's English. */
export const durakEs: GameCopy = {
  name: 'Durak',
  subtitle: 'el tonto que nadie quiere ser',
  tagline: 'Nunca seas el último con cartas en la mano',
  description:
    'Una baraja corta, un palo de triunfo y una mesa de ataques y defensas. Detén cada carta que ' +
    'te lancen o recógelo todo — el último asiento que se quede con cartas se lleva el gorro de ' +
    'tonto.',
  facts: ['2–6 jugadores', 'baraja de 36 cartas', 'solo o con amigos'],
  howToPlay: {
    summary:
      'Una baraja corta, un palo de triunfo y un solo trabajo: no ser el último asiento con cartas ' +
      'en la mano.',
    objective:
      'Vacía tu mano y quédate fuera para siempre. En cuanto se acaba el mazo, el último asiento ' +
      'que aún tenga cartas es el Durak.',
    sections: [
      {
        heading: 'El reparto',
        body: [
          'Cada asiento recibe seis cartas de una baraja de 36: del seis al as, cuatro palos, sin ' +
            'doses, treses, cuatros ni cincos.',
          'La siguiente carta del mazo se voltea: su palo es el triunfo de toda la mano, y queda ' +
            'boca arriba hasta que se acaba el mazo.',
          'Quien tenga el triunfo más bajo ataca primero. ¿Nadie tiene uno? Abre el asiento uno.',
        ],
      },
      {
        heading: 'Atacar y defender',
        body: [
          'El atacante juega una carta. El defensor debe superarla: una carta más alta del mismo ' +
            'palo, o cualquier triunfo si el ataque no era de triunfo.',
          'Los demás asientos pueden sumar más cartas, siempre que el valor ya haya aparecido en la ' +
            'mesa — ganada o perdida, esa carta sigue siendo válida hasta que termine la baza.',
          'Supera todas las cartas y toda la mesa se retira, fuera del juego para siempre — atacas ' +
            'tú a continuación.',
          '¿No puedes superar una? Recoge toda la mesa en tu mano. El turno pasa al asiento ' +
            'siguiente al tuyo.',
        ],
        bullets: [
          {
            label: 'Límite de ataque',
            text: 'un defensor nunca ve más cartas de las que tenía cuando empezó la baza',
          },
          {
            label: 'Reponer',
            text: 'después de cada baza, las manos vuelven a seis — primero el atacante, luego el resto, el defensor al final',
          },
        ],
      },
      {
        heading: 'Perevodnoy (transferencia)',
        body: [
          'Cuando esta regla de casa está activa, un defensor que aún no haya superado nada puede ' +
            'transferir en su lugar: juega una carta del mismo valor, y el siguiente asiento hereda ' +
            'todo el ataque.',
        ],
      },
      {
        heading: 'El final de la mano',
        body: [
          'En cuanto se acaba el mazo, vaciar tu mano te deja fuera para siempre — para bien, en el ' +
            'orden en que ocurra.',
          'El último asiento que se queda con cartas es el Durak. Todos los demás se clasifican ' +
            'según lo pronto que salieron.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Podkidnoy — el juego tradicional de sumar cartas',
      description:
        'Ataca, defiende y suma cualquier carta cuyo valor ya esté en la mesa. Sin ' +
        'transferencias: superas la carta o recoges la mesa.',
      facts: ['sumar cartas activo', 'sin transferencia', 'manos de 6 cartas'],
    },
    transfer: {
      name: 'Perevodnoy',
      tagline: 'Pasa todo el ataque',
      description:
        'Todo lo del modo Clásico, más una salida: un defensor que aún no haya superado nada ' +
        'puede transferir un valor igual directo al siguiente asiento.',
      facts: ['transferencias activas', 'sumar cartas activo', 'manos de 6 cartas'],
    },
    'heads-up': {
      name: 'Uno contra uno',
      tagline: 'Cara a cara, final rápido',
      description:
        'Pensado para dos. La primera mano que se vacía gana en el acto, con o sin mazo — sin ' +
        'esperar a que se agote la baraja.',
      facts: ['2 jugadores', 'victoria instantánea', 'rápido'],
    },
  },
  fields: {
    transfer: {
      label: 'Transferencia (perevodnoy)',
      help: 'Un defensor con un valor igual puede pasar todo el ataque al siguiente asiento en vez de superarlo.',
      group: 'La baza',
    },
    throwIns: {
      label: 'Sumar cartas (podkidnoy)',
      help: 'Cualquier asiento atacante puede sumar más cartas cuyo valor ya esté en la mesa.',
      group: 'La baza',
    },
    maxAttacks: {
      label: 'Límite de ataque',
      help: 'El máximo de cartas de ataque que puede ver un defensor en una baza.',
      group: 'La baza',
    },
    refillTo: {
      label: 'Tamaño de mano',
      help: 'Cartas repartidas al empezar, y el tamaño al que vuelve cada mano tras una baza.',
      group: 'El reparto',
    },
    instantWin: {
      label: 'Victoria instantánea',
      help: 'La primera mano que se vacía gana en el acto, aunque el mazo todavía tenga cartas.',
      group: 'Reglas de la casa',
    },
  },
  presets: {
    classic: 'Durak clásico',
    transfer: 'Perevodnoy',
    'heads-up': 'Uno contra uno',
  },
};
