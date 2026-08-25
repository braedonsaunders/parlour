import type { HowToPlayDoc } from '@parlour/engine';

export const pyramidHowToPlay: HowToPlayDoc = {
  summary:
    'A one-player patience: twenty-eight cards in a pyramid, and a stock you turn onto a single waste pile.',
  objective:
    'Pair free cards that sum to thirteen and clear the table. Leftover cards are your score — lower is better.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Seven rows form a pyramid of twenty-eight face-up cards. A card is free when both cards that cover it are gone — or when it sits on the last row. The leftover twenty-four cards are the stock. The waste starts empty.',
      ],
    },
    {
      heading: 'Pair to thirteen',
      body: [
        'Ace is 1 through King is 13. Any two free cards whose ranks add to 13 may be paired — Queen and Ace, Jack and 2, and so on. A King is already 13 and removes alone. Suits do not matter.',
      ],
    },
    {
      heading: 'The waste',
      body: [
        'Turn one stock card onto the waste at a time. Only the top waste card is live: pair it with a free pyramid card, or remove it if it is a King. Buried waste cards cannot be paired with each other.',
      ],
    },
    {
      heading: 'Recycle',
      body: [
        'When the stock is gone, flip the waste back over without shuffling. Classic allows two recycles — three passes. Relaxed never runs out.',
      ],
    },
    {
      heading: 'The score',
      body: [
        'The deal ends when every card is gone, or when nothing pairs and the stock cannot come back. Every card still in the pyramid, stock, or waste counts. Zero is a clear.',
      ],
    },
  ],
};
