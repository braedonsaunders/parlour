import type { GameCopy } from '../types';

/** Spanish copy for poker. Untranslated fields fall back to the pack's English. */
export const pokerEs: GameCopy = {
  name: 'Póker',
  subtitle: 'Texas hold’em sin límite',
  tagline: 'La última pila en pie',
  description:
    'Dos cartas propias, cinco en el centro, y todas las fichas que tengas para decir cuánto te las crees. Las ciegas suben hasta que alguien se lo lleva todo.',
  facts: ['2–6 jugadores', 'Texas hold’em sin límite', 'solo fichas de juego'],
  howToPlay: {
    summary:
      'Texas hold’em sin límite, jugado como un sit-and-go: todos empiezan igual, las ciegas suben y la última pila en pie gana.',
    objective:
      'Gana todas las fichas. En cada mano recibes dos cartas propias y compartes cinco en el centro; la mejor mano de cinco cartas se lleva el bote, y quien se queda sin fichas queda fuera de la partida.',
    sections: [
      {
        heading: 'Las fichas',
        body: [
          'Las fichas son solo para llevar la cuenta, no hay nada que comprar ni que cobrar. Todos empiezan con la misma pila, y la partida termina cuando un jugador las tiene todas.',
        ],
      },
      {
        heading: 'Una mano',
        body: [
          'Dos cartas boca abajo para cada silla, y una ronda de apuestas. Tres cartas comunitarias (el flop), otra ronda. Una cuarta (el turn), otra ronda. Una quinta (el river), la última ronda. Quien siga en juego muestra sus cartas, y las mejores cinco de las siete disponibles ganan.',
        ],
        bullets: [
          {
            label: 'El botón',
            text: 'marca al repartidor y se mueve una silla a la izquierda cada mano',
          },
          {
            label: 'Ciegas',
            text: 'las dos sillas a la izquierda del botón ponen fichas antes de que salgan las cartas, así siempre hay algo por lo que jugar',
          },
        ],
      },
      {
        heading: 'Tu turno',
        body: ['Cuando te toca actuar, solo hay cuatro cosas que puedes hacer.'],
        bullets: [
          { label: 'Retirarse', text: 'abandonar la mano y lo que ya hayas puesto' },
          {
            label: 'Pasar',
            text: 'seguir en juego sin poner fichas, solo cuando no debes igualar nada',
          },
          { label: 'Igualar', text: 'igualar la apuesta actual' },
          {
            label: 'Apostar / subir',
            text: 'poner más, y todos los demás deben igualarlo para seguir en juego. Una subida debe ser al menos del tamaño de la anterior, salvo que apuestes todo lo que te queda',
          },
        ],
      },
      {
        heading: 'Todo dentro',
        body: [
          'Nunca puedes perder más de lo que tienes delante. Apostar tu última ficha es ir todo dentro: sigues en la mano hasta el final, y cualquier apuesta mayor que tu pila forma un bote secundario que no puedes ganar ni perder.',
        ],
      },
      {
        heading: 'Jerarquía de manos',
        body: [
          'De mejor a peor. Los empates se resuelven con la siguiente carta más alta, y un empate real reparte el bote.',
        ],
        bullets: [
          {
            label: 'Escalera de color',
            text: 'cinco seguidas del mismo palo; con el as arriba es una escalera real',
          },
          { label: 'Póker', text: 'las cuatro cartas de un mismo valor' },
          { label: 'Full', text: 'tres cartas de un valor y dos de otro' },
          { label: 'Color', text: 'cinco cartas del mismo palo' },
          { label: 'Escalera', text: 'cinco seguidas; el as juega alto o bajo' },
          { label: 'Trío', text: 'tres cartas de un mismo valor' },
          { label: 'Doble pareja', text: 'dos cartas de un valor y dos de otro' },
          { label: 'Pareja', text: 'dos cartas de un mismo valor' },
          { label: 'Carta alta', text: 'ninguna de las anteriores' },
        ],
      },
      {
        heading: 'La partida',
        body: [
          'Las ciegas suben según un calendario, así que retirarse para siempre no es un plan: la partida siempre termina. Si te quedas sin fichas quedas fuera; el último jugador con fichas gana, y el resto termina en el orden en que fue quedando fuera.',
        ],
      },
      {
        heading: 'Reglas de la casa',
        body: [
          'Los ajustes de la sala eligen la pila inicial, la velocidad con la que suben las ciegas, si la ciega grande pone una ciega adicional para toda la mesa a partir del tercer nivel, y si las manos perdedoras se muestran en el enfrentamiento o se retiran boca abajo.',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: 'Clásico',
      tagline: 'La mesa completa',
      description:
        'Tres mil fichas cada uno y ciegas que suben cada ocho manos. Margen para jugar una mano entera antes de que nadie esté comprometido.',
      facts: ['3.000 fichas', 'ciegas cada 8', '~25 min'],
    },
    turbo: {
      name: 'Turbo',
      tagline: 'Todo dentro o a casa',
      description:
        'Pilas cortas y ciegas que se duplican cada cuatro manos. Nadie tiene tiempo de esperar a los ases.',
      facts: ['1.500 fichas', 'ciegas cada 4', '~10 min'],
    },
    deep: {
      name: 'Pila Profunda',
      tagline: 'Juega al jugador',
      description:
        'Seis mil fichas y una escalada lenta, sin ciega ante. La partida larga, donde la posición y la paciencia valen algo.',
      facts: ['6.000 fichas', 'ciegas cada 12', 'sin ante'],
    },
  },
  fields: {
    startingStack: {
      label: 'Pila inicial',
      group: 'Partida',
      help: 'Fichas con las que empieza cada silla. Pilas más profundas dan más juego tras el flop antes de que nadie esté comprometido.',
      options: {
        '1500': '1.500 — corta',
        '3000': '3.000 — estándar',
        '6000': '6.000 — profunda',
      },
    },
    blindSpeed: {
      label: 'Subida de ciegas',
      group: 'Partida',
      help: 'Las ciegas suben según un calendario para que la partida siempre termine. Turbo obliga a jugar rápido.',
      options: {
        slow: 'Lenta — cada 12 manos',
        standard: 'Estándar — cada 8 manos',
        turbo: 'Turbo — cada 4 manos',
      },
    },
    ante: {
      label: 'Ciega ante de mesa',
      group: 'Apuestas',
      help: 'A partir del tercer nivel, la ciega grande pone una ciega adicional para toda la mesa, así siempre hay algo que merezca la pena ganar.',
    },
    showMucked: {
      label: 'Mostrar manos perdedoras',
      group: 'Enfrentamiento',
      help: 'Desactivado, una mano perdedora se retira boca abajo como en una mesa real. Activado, todos ven cada mano que llegó al river.',
    },
  },
  presets: {
    classic: 'Clásico',
    turbo: 'Turbo',
    deep: 'Pila Profunda',
  },
};
