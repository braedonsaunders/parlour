import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const palaceHowToPlay: HowToPlayDoc = {
  summary:
    'Shed every card you hold — hand, then face-up row, then face-down row — before anyone else clears the table.',
  objective:
    'Empty your hand, your face-up row and your face-down row first to win the round. Round wins bank across the match; first to the target wins the parlour.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Everyone gets three face-down cards, three face-up cards laid on top of them, and three cards in hand.',
        'Before play starts, swap as many hand cards as you like with your own face-up cards — you get one swap, then ready up.',
      ],
    },
    {
      heading: 'Playing to the pile',
      body: [
        'On your turn, play one or more cards of the same rank that equal or beat the rank on top of the pile, or pick up the whole pile into your hand.',
        'You must clear your hand before touching your face-up row, and clear the face-up row before touching your face-down row.',
      ],
      bullets: [
        {
          label: 'Opening the round',
          text: 'whoever holds the lowest ordinary card leads — 3s first, then up through the deck',
        },
        {
          label: 'Pick up any time',
          text: 'you may take the pile even when you have a legal play — sometimes it is the safer move',
        },
        {
          label: 'Face-down plays',
          text: 'with hand and face-up empty, flip one face-down card blind — if it beats the pile it stays in play and you carry on; if it does not, you pick up the pile and the card',
        },
      ],
    },
    {
      heading: 'Specials',
      body: ['Four ranks bend the rules — all on by default, all tunable in room settings:'],
      bullets: [
        {
          label: '2 — reset',
          text: 'playable on anything; the pile floor drops back down to almost nothing',
        },
        {
          label: '10 — burn',
          text: 'playable on anything; the pile is removed from the game and you play again',
        },
        {
          label: '8 — blind',
          text: 'always playable and never changes what the pile is asking for — the next player answers whatever is underneath',
        },
        {
          label: 'Four of a kind',
          text: 'four cards of one rank on top of the pile burns it, however they got there — you play again',
        },
      ],
    },
    {
      heading: 'Winning the round',
      body: [
        'The moment a seat empties hand, face-up and face-down together, the round ends immediately.',
        'Everyone else is ranked by how many cards they are still holding — fewer is better — with face-down cards remaining as the tiebreak.',
      ],
    },
    {
      heading: 'House rules',
      body: ['Tune the table in room settings before you start:'],
      bullets: [
        {
          label: 'Swap before play',
          text: 'turn off to skip straight from the deal to the first lead',
        },
        {
          label: '2 resets / 10 burns / 8 is always playable',
          text: 'toggle any special off to make that rank ordinary',
        },
        {
          label: 'Four of a kind burns',
          text: 'toggle off to let a pile of matching ranks just keep growing',
        },
        {
          label: 'First to (round wins)',
          text: 'how many rounds it takes to win the match — 1 for a quick hand, up to 7 for a long night',
        },
      ],
    },
  ],
};
