import type { HowToPlayDoc } from '@parlour/engine';

export const golfHowToPlay: HowToPlayDoc = {
  summary: 'A fast one-player patience: seven columns of five, every card face up, and one hole.',
  objective: 'Clear every card from the grass. Leftover cards are your score — lower is better.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Seven columns hold five face-up cards each. The leftover seventeen cards form the stock. The first stock card opens the hole.',
      ],
    },
    {
      heading: 'Play onto the hole',
      body: [
        'Only the lowest card in each column may move. Play it onto the hole when it is one rank away — an 8 takes a 7 or a 9. Suits and colors do not matter.',
      ],
    },
    {
      heading: 'Turn the stock',
      body: [
        'If nothing on the grass fits, turn the next stock card onto the hole. The old hole card is buried and cannot come back. There is no recycle.',
      ],
    },
    {
      heading: 'Ace and King',
      body: [
        'Classic Golf treats Ace and King as dead ends. Fairway lets them wrap so a chain can keep running.',
      ],
    },
    {
      heading: 'The score',
      body: [
        'The hole ends when the grass is clear or the stock is gone and nothing else plays. Cards still on the tableau are your score. Zero is a clear.',
      ],
    },
  ],
};
