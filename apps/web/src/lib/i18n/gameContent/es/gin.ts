import type { GameCopy } from '../types';

/** Spanish copy for gin. Untranslated fields fall back to the pack's English. */
export const ginEs: GameCopy = {
  name: 'Gin',
  subtitle: 'el clásico del rummy',
  tagline: 'Combina, toca y gana la noche',
  description:
    'Diez cartas, dos sillas. Forma tríos y escaleras, deshazte de tus cartas sueltas y golpea la mesa antes que tu rival.',
  facts: ['2 jugadores', 'toque · gin · gin grande', 'solo o con amigos'],
  howToPlay: {
    summary:
      'El clásico para dos — roba, descarta y combina hasta lograr una mano digna de un toque.',
    objective:
      'Convierte tus diez cartas en tríos y escaleras para que casi no sobre nada, y toca antes que tu rival. La primera silla en superar el objetivo de la partida gana.',
    sections: [
      {
        heading: 'Combinaciones y cartas sueltas',
        body: [
          'Una combinación es un trío o cuarteto del mismo valor, o tres o más cartas seguidas del mismo palo. Los ases solo valen como cartas bajas (A-2-3, nunca Q-K-A).',
          'Todo lo que no forme parte de una combinación son cartas sueltas, que cuentan por su valor nominal: las figuras valen diez y los ases uno. Cuanto menos, mejor.',
        ],
      },
      {
        heading: 'Tu turno',
        body: ['Dos pasos, cada turno:'],
        bullets: [
          {
            label: 'Robar',
            text: 'toma la carta de arriba del mazo, o desliza la de arriba del descarte',
          },
          {
            label: 'Descartar',
            text: 'coloca una carta boca arriba sobre la pila — nunca la carta que acabas de robar este turno, sea del mazo o del descarte',
          },
        ],
      },
      {
        heading: 'La carta inicial',
        body: [
          'Tras el reparto queda una carta boca arriba. Quien no reparte puede tomarla para su mano o pasar; después el repartidor tiene la misma opción. Si ambos pasan, quien no reparte roba del mazo y comienza la partida.',
        ],
      },
      {
        heading: 'El toque',
        body: [
          'En vez de descartar, puedes tocar cuando tus cartas sueltas estén en el límite de toque (10 por defecto) o por debajo. Eso termina la mano de inmediato — sin descarte. Robar antes una undécima carta abre la vía del gin grande si todo queda combinado.',
        ],
      },
      {
        heading: 'Gin y cartas adosadas',
        body: [
          'Cero cartas sueltas es gin — el defensor no puede adosar nada y paga todas sus cartas sueltas más la bonificación de gin.',
          'En un toque normal, el defensor adosa primero: cualquiera de sus cartas sobrantes que amplíe un trío de quien toca a cuarteto, o que extienda una escalera por cualquier extremo, se descuenta de la cuenta antes de la comparación.',
          'Si las cartas sueltas del defensor terminan siendo iguales o menores que las tuyas, eso es un contragolpe — en su lugar, cobra la diferencia más una bonificación.',
        ],
      },
      {
        heading: 'Puntuación y la partida',
        body: [
          'Las manos se suceden hasta que alguien supera el objetivo de la partida (100 por defecto), alternando el reparto en cada mano.',
        ],
        bullets: [
          { label: 'Toque', text: 'diferencia entre las cartas sueltas' },
          { label: 'Contragolpe', text: 'diferencia + 25 para el defensor' },
          { label: 'Gin', text: 'todas las cartas sueltas del defensor + 25' },
          {
            label: 'Gin grande',
            text: 'once cartas todas combinadas — cartas sueltas del defensor + 31 (activable)',
          },
          {
            label: 'Bonificación de caja',
            text: '+25 opcional por mano ganada, sumado al final (activable)',
          },
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: ['Cada mesa se puede ajustar en las opciones de la sala:'],
        bullets: [
          {
            label: 'Límite de toque',
            text: 'qué tan bajo debes estar para tocar — límites más ajustados alargan las manos',
          },
          {
            label: 'Objetivo de la partida',
            text: '50 para una partida rápida, 100 la clásica, más para los incansables',
          },
          {
            label: 'Gin grande / bonificaciones / bonificación de caja',
            text: 'los ajustes de pago',
          },
        ],
      },
      {
        heading: 'Manos muertas',
        body: [
          'Si el mazo queda en dos cartas, la mano muere — sin puntos, el repartidor reparte de nuevo. Toca antes.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'Directo a 100',
      description:
        'El estándar de siempre — toca con diez cartas sueltas o menos, el gin paga 25, el gin grande paga 31. El primero en superar los 100 se lo lleva.',
      facts: ['límite de toque 10', 'partida a 100', '~15 min'],
    },
    quick: {
      name: 'Rápida',
      tagline: 'Carrera a 50',
      description:
        'Las mismas reglas, escalera más corta. Una partida ágil para dos, ideal para el descanso del café.',
      facts: ['partida a 50', '~8 min'],
    },
    purist: {
      name: 'Purista',
      tagline: 'Sin adornos',
      description:
        'El gin grande está desactivado y las bonificaciones de caja se quedan en casa. Toques puros, cartas sueltas puras, sin red de seguridad.',
      facts: ['sin gin grande', 'sin bonificación de caja'],
    },
  },
  fields: {
    knockCap: {
      label: 'Límite de toque',
      help: 'Cartas sueltas máximas con las que puedes tocar',
      group: 'Mesa',
    },
    matchTarget: {
      label: 'Partida a',
      help: 'La primera silla en superar esta puntuación gana la partida',
      group: 'Mesa',
    },
    ginBonus: {
      label: 'Bonificación de gin',
      group: 'Bonificaciones',
    },
    bigGin: {
      label: 'Gin grande',
      help: 'Roba una undécima carta que combine por completo',
      group: 'Bonificaciones',
    },
    bigGinBonus: {
      label: 'Bonificación de gin grande',
      group: 'Bonificaciones',
    },
    boxBonus: {
      label: 'Bonificación de caja',
      help: '+25 por mano ganada, sumado al total final',
      group: 'Bonificaciones',
    },
  },
  presets: {
    classic: 'Clásico',
    quick: 'Partida rápida',
    purist: 'Purista',
  },
};
