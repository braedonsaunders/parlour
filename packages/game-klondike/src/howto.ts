import type { HowToPlayDoc } from '@parlour/engine';

export const klondikeHowToPlay: HowToPlayDoc = {
  summary:
    'The seven-column solitaire classic, dealt deterministically for a fresh table or the daily.',
  objective: 'Build all four foundations from Ace to King, one suit per pile.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Seven tableau columns hold one through seven cards. Only each column’s top card begins face up; the other twenty-four cards form the stock.',
      ],
    },
    {
      heading: 'Build the tableau',
      body: [
        'Place cards in descending rank and alternating colors. A packed face-up run moves together. Only a King — alone or heading a run — may enter an empty column.',
      ],
    },
    {
      heading: 'Turn and recycle',
      body: [
        'Classic turns three stock cards at a time; Relaxed turns one. Only the top waste card may move. When stock empties, turn the waste back over without shuffling. There is no pass limit.',
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
      body: [
        'Moving the last face-up card from a column automatically turns the newly exposed card. Finish all four foundations to win.',
      ],
    },
  ],
};
