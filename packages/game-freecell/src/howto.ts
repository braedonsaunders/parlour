import type { HowToPlayDoc } from '@parlour/engine';

export const freecellHowToPlay: HowToPlayDoc = {
  summary:
    'The open-card solitaire classic, dealt deterministically for a fresh table or the daily.',
  objective: 'Build all four foundations from Ace to King, one suit per pile.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Eight tableau columns hold every card face up. The first four columns get seven cards; the last four get six.',
      ],
    },
    {
      heading: 'Free cells',
      body: [
        'Park one card in each free cell. Classic has four cells; Relaxed has six. A cell holds a single card, which may move to the tableau or a foundation.',
      ],
    },
    {
      heading: 'Build the tableau',
      body: [
        'Place cards in descending rank and alternating colors. A packed run may move together if the free-cell supermove limit allows. Any card — not only a King — may enter an empty column.',
      ],
    },
    {
      heading: 'Foundations',
      body: [
        'Start each suit with its Ace, then build upward to King. A foundation card may return to the tableau if you need to unwind a line.',
      ],
    },
    {
      heading: 'Clear the table',
      body: ['Send every card home. Finish all four foundations to win.'],
    },
  ],
};
