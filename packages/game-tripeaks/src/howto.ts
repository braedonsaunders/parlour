import type { HowToPlayDoc } from '@parlour/engine';

export const tripeaksHowToPlay: HowToPlayDoc = {
  summary:
    'A one-player patience: three peaks of eighteen cards, all face up, and a stock you turn onto a single hole.',
  objective: 'Clear every card from the peaks. Leftover cards are your score — lower is better.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Three peaks of eighteen cards sit face up in four rows. The base row of nine is always free. The thirty-four leftover cards form the stock, and the first one opens the hole.',
      ],
    },
    {
      heading: 'Free cards',
      body: [
        'A card is free once both cards resting on it are gone. Only free cards may move — cards still covered are stuck until their children clear.',
      ],
    },
    {
      heading: 'Play onto the hole',
      body: [
        'Play a free card onto the hole when it is one rank away — an 8 takes a 7 or a 9. Suits and colors do not matter. Chain as many plays as line up.',
      ],
    },
    {
      heading: 'Turn the stock',
      body: [
        'If nothing on the peaks fits, turn the next stock card onto the hole. The old hole card is buried underneath it.',
      ],
    },
    {
      heading: 'Ace, King, and the stock',
      body: [
        'Classic TriPeaks treats Ace and King as dead ends, and the stock never comes back. Relaxed lets Ace and King wrap, and allows one shuffle of the hole back into the stock once it runs dry.',
      ],
    },
    {
      heading: 'The score',
      body: [
        'The deal ends when the peaks are clear, or when nothing plays and the stock cannot come back. Cards still on the peaks are your score. Zero is a clear.',
      ],
    },
  ],
};
