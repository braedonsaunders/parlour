import type { HowToPlayDoc } from '@parlour/engine';

export const spiderHowToPlay: HowToPlayDoc = {
  summary:
    'Microsoft-style two-deck Spider: ten columns, five leftover deal-rows, and eight suits to peel off.',
  objective: 'Clear eight same-suit King-to-Ace runs to the foundations.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Ten tableau columns are dealt: the first four hold six cards and the rest hold five. Only each column’s top card begins face up. Fifty cards remain in the stock as five deal-rows of ten.',
      ],
    },
    {
      heading: 'Build the tableau',
      body: [
        'Place cards in descending rank, any suit. Only a same-suit packed descending run may move as a unit. An empty column accepts any card or run.',
      ],
    },
    {
      heading: 'Deal a row',
      body: [
        'Click the stock to deal one face-up card onto every column. You cannot deal while any column is empty, or when fewer than ten cards remain.',
      ],
    },
    {
      heading: 'Clear a suit',
      body: [
        'When a same-suit King-through-Ace run is completed on a column, it is removed to a foundation slot as part of that same move. A newly exposed down card turns automatically.',
      ],
    },
    {
      heading: 'Suits',
      body: [
        'Relaxed paints all 104 cards as spades. Classic (the daily) uses spades and hearts. Hard uses every suit, so packed runs are rarer.',
      ],
    },
  ],
};
