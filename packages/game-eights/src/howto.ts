import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const eightsHowToPlay: HowToPlayDoc = {
  summary:
    'One ordinary pack, one pile, and eights that go on anything. Shed your hand and charge the table for what it is still holding.',
  objective:
    'Empty your hand to end the round and bank every card left in everyone else’s. First past the target score takes the match.',
  sections: [
    {
      heading: 'Playing a card',
      body: [
        'On your turn play one card that matches the pile by suit or by rank — a ♦7 goes on any diamond and on any other seven.',
        'An eight is wild. It goes on anything, and you name the suit that has to follow it.',
        'Nothing to play? Draw. The pile asks for the same suit until someone changes it.',
      ],
    },
    {
      heading: 'Action cards',
      body: [
        'Each of these is a table setting, so a house can play as plain or as loud as it likes.',
      ],
      bullets: [
        { label: '8 — wild', text: 'always playable; you name the suit that follows (always on)' },
        { label: '2 — draw two', text: 'the next seat picks up two and loses the turn' },
        { label: 'Q — skip', text: 'play steps straight over the next seat' },
        {
          label: 'A — reverse',
          text: 'the table turns around; head-to-head it hands you another turn',
        },
      ],
    },
    {
      heading: 'Drawing',
      body: [
        'By tradition you keep drawing until something is playable. Turn that off and a turn buys exactly one card.',
        'A card you draw that can be played is yours to play right away, or to keep — unless the table forces the play.',
        'When the stock runs out, everything under the face-up card is shuffled back into a fresh stock.',
      ],
    },
    {
      heading: 'Scoring the round',
      body: [
        'The moment a hand empties, everyone else counts what they are still holding and the shedder banks the lot.',
      ],
      bullets: [
        { label: 'Every eight', text: '50 points' },
        { label: 'Any 10, J, Q or K', text: '10 points' },
        { label: 'Any ace', text: '1 point' },
        { label: 'Everything else', text: 'its face value' },
        {
          label: 'A blocked round',
          text: 'stock spent and nobody able to play — the lightest hand wins and banks the difference',
        },
      ],
    },
    {
      heading: 'Winning the match',
      body: [
        'Rounds keep dealing, the deal moving one seat each time, until someone crosses the target score. The highest score wins.',
        'A tie at the top deals another round rather than splitting the crown.',
      ],
    },
  ],
};
